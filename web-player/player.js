/* ============================================================
 * ScriptWeaver — Web Playable 纯前端播放引擎
 * 自包含、零依赖。读取同目录 game.json 后离线运行。
 * 支持：背景 / 立绘（按站位归一化坐标）/ 对话打字机 / 选择支跳转 /
 *      语音·音效·BGM·环境音 / 变量操作与条件 / 存读档（localStorage）/
 *      PC 与移动端自适应（点击 / 触摸 / 空格回车）。
 * ============================================================ */
(function () {
  'use strict'

  // -------- 站位坐标（与编辑器 PRESET_SLOTS 同源） --------
  var PRESET_SLOTS = {
    left: { x: 0.22, y: 1.0 },
    'left-center': { x: 0.37, y: 1.0 },
    center: { x: 0.5, y: 1.0 },
    'right-center': { x: 0.63, y: 1.0 },
    right: { x: 0.78, y: 1.0 },
  }
  var DEFAULT_SLOT = { x: 0.5, y: 1.0 }

  // -------- DOM --------
  function $(id) { return document.getElementById(id) }
  var stageWrap = $('stage-wrap')
  var bgLayer = $('bg-layer')
  var charLayer = $('char-layer')
  var dialogueEl = $('dialogue')
  var speakerEl = $('speaker')
  var textEl = $('text')
  var choicesEl = $('choices')
  var hud = $('hud')
  var titleScreen = $('title-screen')
  var saveOverlay = $('save-overlay')
  var toastEl = $('toast')

  // -------- 状态 --------
  var game = null
  var lines = []
  var assetMap = {}
  var variables = {}          // 运行时变量值
  var varDefs = []            // 变量声明
  var nameToMeta = {}         // 显示名 -> { displayName, dialogueColor }
  var currentIndex = 0
  var mode = 'title'          // 'title' | 'play'
  var autoMode = false
  var typing = false
  var typeTimer = null
  var advanceTimer = null
  var finishedTyping = false
  var bgmEl = null
  var ambientEl = null
  var voiceEl = null
  var seEls = []

  var AUTOSAVE_KEY = 'sw_web_autosave_v1'
  var SLOT_KEY = 'sw_web_slot_v1_'

  // ========================================================
  // 条件表达式求值（安全子集，无 eval）
  // 支持：标识符 / 数字 / True|False / ( ) / not and or / == != >= <= > < + - * /
  // ========================================================
  function tokenize(expr) {
    var re = /\s*(\(|\)|==|!=|>=|<=|>|<|\+|-|\*|\/|and|or|not|True|False|[A-Za-z_][A-Za-z0-9_]*|[0-9]+(\.[0-9]+)?)/g
    var out = []
    var m
    while ((m = re.exec(expr)) !== null) {
      if (m[0].length === 0) break
      out.push(m[0].trim())
    }
    return out
  }

  function makeParser(tokens) {
    var pos = 0
    function peek() { return tokens[pos] }
    function next() { return tokens[pos++] }
    function parseOr() {
      var left = parseAnd()
      while (peek() === 'or') { next(); var r = parseAnd(); left = (left || r) }
      return left
    }
    function parseAnd() {
      var left = parseNot()
      while (peek() === 'and') { next(); var r = parseNot(); left = (left && r) }
      return left
    }
    function parseNot() {
      if (peek() === 'not') { next(); return !parseNot() }
      return parseCmp()
    }
    function parseCmp() {
      var left = parseAdd()
      var op = peek()
      if (op === '==' || op === '!=' || op === '>=' || op === '<=' || op === '>' || op === '<') {
        next()
        var right = parseAdd()
        switch (op) {
          case '==': return left === right
          case '!=': return left !== right
          case '>=': return left >= right
          case '<=': return left <= right
          case '>': return left > right
          case '<': return left < right
        }
      }
      return left
    }
    function parseAdd() {
      var left = parseMul()
      while (peek() === '+' || peek() === '-') {
        var op = next(); var r = parseMul()
        left = op === '+' ? left + r : left - r
      }
      return left
    }
    function parseMul() {
      var left = parsePrimary()
      while (peek() === '*' || peek() === '/') {
        var op = next(); var r = parsePrimary()
        left = op === '*' ? left * r : left / r
      }
      return left
    }
    function parsePrimary() {
      var t = peek()
      if (t === '(') { next(); var v = parseOr(); next(); return v }
      if (t === 'not' || t === 'and' || t === 'or') throw new Error('语法错误')
      next()
      if (t === 'True') return true
      if (t === 'False') return false
      if (/^[0-9]/.test(t)) return parseFloat(t)
      if (/^[A-Za-z_]/.test(t)) {
        if (Object.prototype.hasOwnProperty.call(variables, t)) return variables[t]
        return 0
      }
      throw new Error('无法识别: ' + t)
    }
    return function () { return parseOr() }
  }

  function evalCondition(expr) {
    if (!expr || !expr.trim()) return true
    try {
      var parse = makeParser(tokenize(expr))
      return !!parse()
    } catch (e) {
      console.warn('条件求值失败:', expr, e)
      return true
    }
  }

  // ========================================================
  // 变量操作
  // ========================================================
  function applyOps(ops) {
    if (!ops || !ops.length) return
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i]
      var name = op.varName
      if (!Object.prototype.hasOwnProperty.call(variables, name)) continue
      var cur = variables[name]
      switch (op.op) {
        case 'set': variables[name] = op.value; break
        case 'add': variables[name] = (typeof cur === 'number' ? cur : 0) + (Number(op.value) || 0); break
        case 'subtract': variables[name] = (typeof cur === 'number' ? cur : 0) - (Number(op.value) || 0); break
        case 'toggle': variables[name] = !cur; break
      }
    }
  }

  // ========================================================
  // 时长估算（与编辑器一致）
  // ========================================================
  function estimateMs(text) {
    var t = (text || '').trim()
    if (!t) return 1200
    var n = Array.from(t).length
    var ms = 800 + n * 90
    return Math.max(1200, Math.min(ms, 9000))
  }

  // ========================================================
  // 舞台渲染
  // ========================================================
  function renderBackground(state) {
    var bg = state.background
    var id = bg && bg.asset_id
    var isVideo = !!(id && (id.indexOf('sw-video:') === 0 || (assetMap[id] && assetMap[id].type === 'video')))
    var src = id && assetMap[id] ? assetMap[id].src : null
    var img = bgLayer.querySelector('img')
    var vid = bgLayer.querySelector('video')
    // ---- 视频背景：直读素材做可循环播放（与编辑器铁律 1 一致的 <video src> 消费路径） ----
    if (isVideo) {
      if (img) img.classList.remove('show')
      if (!src) { if (vid) vid.style.display = 'none'; return }
      if (!vid) {
        vid = document.createElement('video')
        vid.className = 'sw-bg sw-bg-img'
        vid.style.objectFit = 'contain'
        vid.muted = true
        vid.autoplay = true
        vid.playsInline = true
        bgLayer.appendChild(vid)
      }
      vid.style.display = 'block'
      vid.loop = !!(bg && bg.movieLoop != null ? bg.movieLoop : true)
      if (vid.getAttribute('data-src') !== src) {
        vid.setAttribute('data-src', src)
        vid.src = src
        vid.play().catch(function () {})
      }
      return
    }
    // ---- 图片背景（原逻辑）----
    if (vid) { vid.style.display = 'none'; if (vid.pause) vid.pause() }
    if (!src) {
      if (img) img.classList.remove('show')
      return
    }
    if (!img) {
      img = document.createElement('img')
      bgLayer.appendChild(img)
    }
    if (img.getAttribute('data-src') !== src) {
      img.setAttribute('data-src', src)
      img.classList.remove('show')
      img.onload = function () { img.classList.add('show'); applyRenpyBgBox(img, bg) }
      img.src = src
    } else {
      img.classList.add('show')
    }
    // src 未变时也要同步 zoom / 取景焦点变化
    applyRenpyBgBox(img, bg)
  }

  /**
   * 按 Ren'Py 口径给背景定尺寸：原图像素 × zoom ÷ 工程分辨率，按舞台百分比定位。
   * 与编辑器一致——小尺寸背景写 zoom 2.0 是「原图 2 倍铺满」，而非「铺满再 2 倍」过度放大。
   */
  function applyRenpyBgBox(img, bg) {
    var baseW = (game && game.baseResolution && game.baseResolution.width) || 1920
    var baseH = (game && game.baseResolution && game.baseResolution.height) || 1080
    var zoom = (bg && bg.scale != null && bg.scale !== 1) ? bg.scale : 1
    var fx = (bg && bg.focus_x != null) ? bg.focus_x : 0.5
    var fy = (bg && bg.focus_y != null) ? bg.focus_y : 0.5
    function size() {
      if (!img.naturalWidth) return
      var wPct = (img.naturalWidth * zoom) / baseW * 100
      var hPct = (img.naturalHeight * zoom) / baseH * 100
      img.style.position = 'absolute'
      img.style.inset = 'auto'
      img.style.left = '50%'
      img.style.top = '50%'
      img.style.right = 'auto'
      img.style.bottom = 'auto'
      img.style.width = wPct + '%'
      img.style.height = hPct + '%'
      img.style.objectFit = 'fill'
      img.style.transform = 'translate(' + (-fx * 100) + '%, ' + (-fy * 100) + '%)'
    }
    if (img.complete && img.naturalWidth) size()
    else img.addEventListener('load', size, { once: true })
  }

  /**
   * 按 Ren'Py 口径给立绘定尺寸。
   * 引擎里的 zoom 是相对原图像素的倍率，一张 2000px 高的道具图写 zoom 0.2 只占 400px，
   * 所以必须拿到原图真实高度再折算成舞台百分比，不能用固定高度顶替。
   */
  function applyRenpyBox(wrap, img, zoom) {
    var baseH = (game && game.baseResolution && game.baseResolution.height) || 1080
    function size() {
      if (!img.naturalHeight) return
      // 高度挂在外层 wrap 上（它相对舞台层绝对定位，百分比才解析得出来）
      wrap.style.height = ((img.naturalHeight * zoom) / baseH * 100) + '%'
      img.style.height = '100%'
      img.style.width = 'auto'
    }
    if (img.complete && img.naturalHeight) size()
    else img.addEventListener('load', size, { once: true })
  }

  function renderCharacters(state) {
    charLayer.innerHTML = ''
    var chars = state.characters || {}
    Object.keys(chars).forEach(function (instId) {
      var ch = chars[instId]
      if (!ch || !ch.asset_id) return
      var am = assetMap[ch.asset_id]
      if (!am) return
      var slot = PRESET_SLOTS[ch.position_slot] || DEFAULT_SLOT
      var x = (ch.pos_x != null) ? ch.pos_x : slot.x
      var y = (ch.pos_y != null) ? ch.pos_y : slot.y
      var scale = (ch.scale != null && ch.scale > 0) ? ch.scale : 1
      // Ren'Py 锚点：图片上哪一点对准 (x, y)，缺省为底部居中
      var ax = (ch.anchor_x != null) ? ch.anchor_x : 0.5
      var ay = (ch.anchor_y != null) ? ch.anchor_y : 1
      var wrap = document.createElement('div')
      wrap.className = 'char show' + (ch.exiting ? ' leaving' : '')
      wrap.style.left = (x * 100) + '%'
      wrap.style.top = (y * 100) + '%'
      wrap.style.bottom = 'auto'
      wrap.style.transformOrigin = (ax * 100) + '% ' + (ay * 100) + '%'
      var img = document.createElement('img')
      img.src = am.src
      img.alt = ''
      if (ch.renpy_zoom != null) {
        // 导入自 Ren'Py：占屏高 = 原图高 × zoom ÷ 基准分辨率高，与引擎口径一致
        img.style.maxHeight = 'none'
        img.style.maxWidth = 'none'
        applyRenpyBox(wrap, img, ch.renpy_zoom)
        wrap.style.transform = 'translate(' + (-ax * 100) + '%, ' + (-ay * 100) + '%)'
      } else {
        wrap.style.transform =
          'translate(' + (-ax * 100) + '%, ' + (-ay * 100) + '%) scale(' + scale + ')'
      }
      wrap.appendChild(img)
      charLayer.appendChild(wrap)
    })
  }

  // ========================================================
  // 音频
  // ========================================================
  function stopTransientAudio() {
    if (voiceEl) { voiceEl.pause(); voiceEl = null }
    seEls.forEach(function (a) { a.pause() })
    seEls = []
  }

  function setLoopTrack(elRef, inst) {
    var el = elRef.el
    if (!inst || !inst.asset_id || !assetMap[inst.asset_id]) {
      if (el) { el.pause(); el.src = '' }
      return null
    }
    var src = assetMap[inst.asset_id].src
    if (!el) {
      el = new Audio()
      el.loop = true
      elRef.el = el
    }
    if (el.getAttribute('data-src') !== src) {
      el.pause()
      el.src = src
      el.setAttribute('data-src', src)
    }
    el.loop = !!inst.loop
    el.volume = (typeof inst.volume === 'number') ? Math.max(0, Math.min(1, inst.volume)) : 1
    var p = el.play()
    if (p && p.catch) p.catch(function () {})
    return el
  }

  function renderAudio(state) {
    stopTransientAudio()
    var au = state.audio || {}
    // BGM / 环境音（持续）
    bgmEl = setLoopTrack({ el: bgmEl }, au.bgm)
    ambientEl = setLoopTrack({ el: ambientEl }, au.ambient)
    // 语音
    if (au.voice && assetMap[au.voice]) {
      voiceEl = new Audio(assetMap[au.voice].src)
      voiceEl.volume = 1
      var vp = voiceEl.play()
      if (vp && vp.catch) vp.catch(function () {})
    }
    // 音效
    if (au.se && au.se.length) {
      au.se.forEach(function (id) {
        if (assetMap[id]) {
          var a = new Audio(assetMap[id].src)
          var p = a.play()
          if (p && p.catch) p.catch(function () {})
          seEls.push(a)
        }
      })
    }
  }

  // ========================================================
  // 对话框 / 打字机
  // ========================================================
  function showDialogue(state) {
    dialogueEl.classList.remove('hidden')
    // 说话人
    var speaker = state.speaker
    if (!speaker) {
      speakerEl.className = 'narrator'
      speakerEl.textContent = ''
      speakerEl.style.borderLeftColor = 'transparent'
    } else {
      speakerEl.className = ''
      speakerEl.textContent = speaker
      var meta = nameToMeta[speaker]
      speakerEl.style.borderLeftColor = (meta && meta.dialogueColor) ? meta.dialogueColor : 'var(--accent)'
    }
    // 打字机
    var full = state.dialogue || ''
    finishedTyping = false
    if (typeTimer) clearInterval(typeTimer)
    typing = true
    textEl.textContent = ''
    var i = 0
    typeTimer = setInterval(function () {
      if (i >= full.length) {
        clearInterval(typeTimer)
        typing = false
        finishedTyping = true
        return
      }
      textEl.textContent += full[i]
      i++
    }, 28)
  }

  function finishTyping() {
    if (typeTimer) clearInterval(typeTimer)
    var state = lines[currentIndex]
    textEl.textContent = state.dialogue || ''
    typing = false
    finishedTyping = true
  }

  // ========================================================
  // 选择支
  // ========================================================
  function showChoices(state) {
    choicesEl.classList.remove('hidden')
    choicesEl.innerHTML = ''
    if (state.prompt) {
      var p = document.createElement('div')
      p.className = 'choice-prompt'
      p.textContent = state.prompt
      choicesEl.appendChild(p)
    }
    var list = (state.choices || []).filter(function (c) {
      return evalCondition(c.condition)
    })
    if (list.length === 0) {
      // 无可选项时退化为点击继续
      return
    }
    list.forEach(function (c) {
      var btn = document.createElement('button')
      btn.className = 'choice-btn'
      btn.textContent = c.text
      btn.onclick = function (e) {
        e.stopPropagation()
        chooseOption(c)
      }
      choicesEl.appendChild(btn)
    })
  }

  function chooseOption(choice) {
    applyOps(choice.ops)
    choicesEl.classList.add('hidden')
    choicesEl.innerHTML = ''
    var target = choice.target_label
    var idx
    if (!target || !target.trim()) {
      idx = currentIndex + 1
    } else {
      idx = lines.findIndex(function (l) { return l.label && l.label === target })
      if (idx < 0) idx = currentIndex + 1
    }
    gotoLine(idx)
  }

  // ========================================================
  // 行推进
  // ========================================================
  function scheduleAdvance(state) {
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null }
    var stay = null
    var au = state.audio || {}
    if (au.voice && assetMap[au.voice] && assetMap[au.voice].duration > 0) {
      stay = assetMap[au.voice].duration * 1000 + 350
    } else if (autoMode) {
      stay = estimateMs(state.dialogue) + 250
    }
    if (stay != null) {
      advanceTimer = setTimeout(function () { advance() }, stay)
    }
  }

  function renderLine(index) {
    var state = lines[index]
    if (!state) { endGame(); return }
    // 应用本行变量操作
    applyOps(state.variableOps)
    renderBackground(state)
    renderCharacters(state)
    renderAudio(state)
    showDialogue(state)
    choicesEl.classList.add('hidden')
    choicesEl.innerHTML = ''
    if (state.line_type === 'choice') {
      showChoices(state)
      scheduleAdvance(state) // 仅用于语音时长吸附；无选项时退化为点击
    } else {
      scheduleAdvance(state)
    }
    autosave()
  }

  function advance() {
    if (mode !== 'play') return
    var state = lines[currentIndex]
    if (state && state.line_type === 'choice') {
      // 选择支行必须点选项
      return
    }
    if (typing || !finishedTyping) { finishTyping(); return }
    gotoLine(currentIndex + 1)
  }

  function gotoLine(index) {
    if (index >= lines.length) { endGame(); return }
    currentIndex = index
    renderLine(index)
  }

  function endGame() {
    mode = 'title'
    titleScreen.classList.remove('hidden')
    hud.classList.add('hidden')
    dialogueEl.classList.add('hidden')
    choicesEl.classList.add('hidden')
    stopTransientAudio()
    if (bgmEl) { bgmEl.pause(); bgmEl.src = '' }
    if (ambientEl) { ambientEl.pause(); ambientEl.src = '' }
    clearAutosave()
    refreshContinue()
    showToast('剧情已结束')
  }

  // ========================================================
  // 存读档（localStorage）
  // ========================================================
  function autosave() {
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ index: currentIndex, vars: variables, ts: Date.now() }))
    } catch (e) {}
  }
  function clearAutosave() {
    try { localStorage.removeItem(AUTOSAVE_KEY) } catch (e) {}
  }
  function loadAutosave() {
    try {
      var raw = localStorage.getItem(AUTOSAVE_KEY)
      if (!raw) return null
      return JSON.parse(raw)
    } catch (e) { return null }
  }
  function readSlot(i) {
    try { var r = localStorage.getItem(SLOT_KEY + i); return r ? JSON.parse(r) : null } catch (e) { return null }
  }
  function writeSlot(i) {
    try {
      localStorage.setItem(SLOT_KEY + i, JSON.stringify({ index: currentIndex, vars: variables, ts: Date.now() }))
      showToast('已保存到存档 ' + (i + 1))
    } catch (e) { showToast('保存失败') }
  }
  function deleteSlot(i) {
    try { localStorage.removeItem(SLOT_KEY + i); renderSaveSlots(currentSaveMode) } catch (e) {}
  }

  var currentSaveMode = 'save'
  function renderSaveSlots(mode) {
    currentSaveMode = mode
    $('save-title').textContent = (mode === 'save') ? '保存进度' : '读取进度'
    var box = $('save-slots')
    box.innerHTML = ''
    for (var i = 0; i < 3; i++) {
      (function (i) {
        var data = readSlot(i)
        var row = document.createElement('div')
        row.className = 'save-row'
        var name = document.createElement('div')
        name.className = 'slot-name'
        name.textContent = '存档 ' + (i + 1)
        var info = document.createElement('div')
        info.className = 'slot-info'
        info.textContent = data ? ('第 ' + (data.index + 1) + ' 行 · ' + new Date(data.ts).toLocaleString()) : '空'
        var act = document.createElement('button')
        if (mode === 'save') {
          act.textContent = '保存'
          act.onclick = function () { writeSlot(i); renderSaveSlots(mode) }
        } else {
          act.textContent = '读取'
          act.disabled = !data
          act.style.opacity = data ? '1' : '0.4'
          act.onclick = function () { if (data) { doLoad(data); closeSave() } }
        }
        row.appendChild(name)
        row.appendChild(info)
        row.appendChild(act)
        if (data) {
          var del = document.createElement('button')
          del.className = 'del'
          del.textContent = '删除'
          del.onclick = function () { deleteSlot(i) }
          row.appendChild(del)
        }
        box.appendChild(row)
      })(i)
    }
  }

  function doLoad(data) {
    if (!data) return
    variables = {}
    varDefs.forEach(function (v) { variables[v.name] = v.initial })
    if (data.vars) {
      Object.keys(data.vars).forEach(function (k) { if (Object.prototype.hasOwnProperty.call(variables, k)) variables[k] = data.vars[k] })
    }
    mode = 'play'
    titleScreen.classList.add('hidden')
    hud.classList.remove('hidden')
    currentIndex = data.index
    renderLine(currentIndex)
  }

  function openSave(mode) { renderSaveSlots(mode); saveOverlay.classList.remove('hidden') }
  function closeSave() { saveOverlay.classList.add('hidden') }

  function refreshContinue() {
    var sv = loadAutosave()
    var btn = $('btn-continue')
    if (sv) btn.classList.remove('hidden'); else btn.classList.add('hidden')
  }

  // ========================================================
  // Toast
  // ========================================================
  var toastTimer = null
  function showToast(msg) {
    toastEl.textContent = msg
    toastEl.classList.remove('hidden')
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(function () { toastEl.classList.add('hidden') }, 1800)
  }

  // ========================================================
  // 启动
  // ========================================================
  function startGame(fromAutosave) {
    variables = {}
    varDefs.forEach(function (v) { variables[v.name] = v.initial })
    mode = 'play'
    titleScreen.classList.add('hidden')
    hud.classList.remove('hidden')
    if (fromAutosave && fromAutosave.vars) {
      Object.keys(fromAutosave.vars).forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(variables, k)) variables[k] = fromAutosave.vars[k]
      })
      currentIndex = fromAutosave.index
    } else {
      currentIndex = 0
    }
    renderLine(currentIndex)
  }

  function initFromData(data) {
    game = data
    lines = data.lines || []
    assetMap = data.assetMap || {}
    varDefs = data.variables || []
    variables = {}
    varDefs.forEach(function (v) { variables[v.name] = v.initial })
    nameToMeta = {}
    var cm = data.charactersMeta || {}
    Object.keys(cm).forEach(function (k) { nameToMeta[cm[k].displayName] = cm[k] })
    // 画布比例
    var cr = data.canvasRatio || { w: 16, h: 9 }
    stageWrap.style.setProperty('--ar', (cr.w / cr.h))
    $('title-name').textContent = data.title || 'ScriptWeaver'
  }

  function bindUI() {
    $('btn-start').onclick = function () { startGame(null) }
    $('btn-continue').onclick = function () { startGame(loadAutosave()) }
    $('btn-auto').onclick = function () {
      autoMode = !autoMode
      this.classList.toggle('active', autoMode)
      if (autoMode) scheduleAdvance(lines[currentIndex])
      showToast(autoMode ? '自动播放：开' : '自动播放：关')
    }
    $('btn-save').onclick = function () { openSave('save') }
    $('btn-load').onclick = function () { openSave('load') }
    $('btn-title').onclick = function () { if (confirm('返回标题？当前进度已自动保存。')) endGame() }
    $('save-close').onclick = closeSave
    saveOverlay.onclick = function (e) { if (e.target === saveOverlay) closeSave() }

    // 点击舞台推进（打字机中先补全，否则下一行）
    dialogueEl.onclick = function (e) { e.stopPropagation(); advance() }
    stageWrap.onclick = function () { if (mode === 'play') advance() }
    // 防止点击选择支时穿透到舞台
    choicesEl.onclick = function (e) { e.stopPropagation() }

    document.addEventListener('keydown', function (e) {
      if (mode !== 'play') return
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); advance() }
    })
  }

  function boot() {
    fetch('./game.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('game.json 加载失败'); return r.json() })
      .then(function (data) {
        initFromData(data)
        bindUI()
        refreshContinue()
      })
      .catch(function (err) {
        titleScreen.querySelector('.title-card').innerHTML =
          '<h1 style="color:#ff8a8a">加载失败</h1><p style="margin-top:1em;color:#aeb4c2">' +
          String(err.message || err) + '<br/>请将本目录通过本地服务器或支持 fetch 的环境打开。</p>'
      })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
  } else {
    boot()
  }
})()

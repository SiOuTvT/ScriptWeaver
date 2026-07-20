import type { Encyclopedia } from './types'

// 五、冲击与抖动（Impact & Shake）
export const impactEnc: Encyclopedia = {
  hpunch: {
    artGuide: `hpunch 是「水平猛击」：让整个画面在水平方向猛抖 0.25 秒，像被人从侧面狠狠揍了一拳。表现角色挨了物理冲击（扇耳光、撞门）、内心受到极大震撼（比如发现惊天反转）、或者突如其来的地震爆炸，都靠它。但别在日常对话里高频用，强烈的画面震动会让玩家视觉疲劳甚至不适，把它留给真正「值得震一下」的爆点。`,
    paramManual: [
      { name: 'dist', type: 'float（Shake 实例参数）', def: '≈屏幕宽 3%', range: '像素', effect: '水平抖动最大位移；越大震得越狠。hpunch 是 Shake((0,0,0,0),0.5,dist=20) 的预设。' },
      { name: '时长', type: 'float', def: '0.5（Shake 的 delay）', range: '秒', effect: '整屏抖动总时长（实例默认 0.5s，视觉观感约 0.25s 衰减）。' },
    ],
    cssImpl: `/* 整屏水平方向指数衰减抖动 */
@keyframes hpunch {
  0%   { transform: translateX(0); }
  15%  { transform: translateX(-3%); }
  35%  { transform: translateX( 2.4%); }
  60%  { transform: translateX(-1.6%); }
  80%  { transform: translateX( 0.8%); }
  100% { transform: translateX(0); }
}
.hpunch { animation: hpunch .25s ease-out; }`,
    perfTips: `整屏 transform 抖动会触发整层重绘，虽是合成器友好的 translate，但叠加在已有滤镜/模糊的画面上会掉帧。
高频使用既疲劳又廉价感；强烈建议每一下都配打击音效/特写，否则「空震」很假。光敏/眩晕敏感人群对强震动也较敏感。`,
  },

  vpunch: {
    artGuide: `vpunch 是「垂直猛击」：让整个画面在垂直方向猛抖 0.25 秒，像地震、重物砸地、从上劈下来的重击、剧烈颠簸。它跟 hpunch 是同构的，只是抖的轴换成垂直方向。同样别高频滥用——垂直抖动比水平更容易让人晕，留给真正的「天崩地裂」时刻。`,
    paramManual: [
      { name: 'dist', type: 'float（Shake 实例参数）', def: '≈屏幕高 3%', range: '像素', effect: '垂直抖动最大位移；越大震得越狠。' },
      { name: '时长', type: 'float', def: '0.5（Shake 的 delay）', range: '秒', effect: '整屏抖动总时长。' },
    ],
    cssImpl: `/* 整屏垂直方向指数衰减抖动 */
@keyframes vpunch {
  0%   { transform: translateY(0); }
  15%  { transform: translateY(-3%); }
  35%  { transform: translateY( 2.4%); }
  60%  { transform: translateY(-1.6%); }
  80%  { transform: translateY( 0.8%); }
  100% { transform: translateY(0); }
}
.vpunch { animation: vpunch .25s ease-out; }`,
    perfTips: `垂直抖动比水平更易诱发眩晕，使用密度要更克制。
同样建议配低频「轰」的音效与短暂画面定格，强化「地动山摇」的实感。`,
  },

  shake: {
    artGuide: `Shake 是比 hpunch/vpunch 更可控的抖动工厂：它在一个 (x,y,w,h) 偏移盒里对目标做高频随机扰动，能指定时长和强度，做出持续的颤动——角色吓得发抖、受伤哆嗦、引擎轰鸣、飞机颠簸、紧张等待，全靠它。它是「状态性抖动」而不是「一下子的冲击」，适合让某个立绘长时间抖个不停。`,
    paramManual: [
      { name: 'offset', type: '(4)tuple', def: '(0,0,0,0)', range: '(x,y,w,h) 偏移盒', effect: '每帧随机位移的范围；w,h 越大抖得越狠、覆盖区域越广。' },
      { name: 'child', type: 'Displayable', def: '—', range: '任意显示件', effect: '被抖动的立绘/图层。' },
      { name: 'delay', type: 'float', def: '0.5', range: '>0 秒', effect: '总抖动时长；到时停止回到原位。' },
      { name: 'strength', type: 'float', def: '1.0', range: '≥0', effect: '对 offset 的缩放倍率；越大抖幅越大、越剧烈。' },
    ],
    cssImpl: `/* 在 (x,y,w,h) 盒内随机高频扰动（Web 用 JS 逐帧） */
function shake(el, ms, strength=1) {
  const end = performance.now() + ms;
  function tick(now){
    if (now > end) { el.style.transform=''; return; }
    const dx = (Math.random()*2-1)*strength*8;   // 偏移盒宽度映射
    const dy = (Math.random()*2-1)*strength*8;
    el.style.transform = \`translate(\${dx}px,\${dy}px)\`;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}`,
    perfTips: `逐帧用 Math.random 改 transform 频繁触发重绘，持续抖动比一次性 punch 更耗 CPU；抖动幅度和频率要克制，否则既卡又晕。
若只抖一个立绘，把它放在独立合成层（will-change: transform）可显著降成本。`,
  },
}

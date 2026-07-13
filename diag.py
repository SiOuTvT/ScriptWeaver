from playwright.sync_api import sync_playwright
import json

URL = 'http://localhost:5173'
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 1440, 'height': 900})
    pg.goto(URL)
    pg.wait_for_load_state('networkidle')
    pg.wait_for_timeout(800)

    data = pg.evaluate("""() => {
      const cs = getComputedStyle(document.documentElement);
      const v = n => cs.getPropertyValue(n).trim();
      const all = [...document.querySelectorAll('header, aside, main, section, div')];
      const pick = kw => all.filter(e => e.className && e.className.toString().includes(kw))
        .map(e => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), cls: e.className.toString().slice(0,70) }; });
      // 取主内容区直接子级宽度，看工作区分配
      const main = document.querySelector('div.relative.flex.flex-1');
      const kids = main ? [...main.children].map(c => { const r=c.getBoundingClientRect(); return { tag:c.tagName, w:Math.round(r.width), cls:c.className.toString().slice(0,50) }; }) : [];
      // 收集页面可见文本长度，判断空状态
      const txt = (document.body.innerText || '').replace(/\\s+/g,' ').trim();
      return {
        tokens: { surface:v('--c-surface'), canvas:v('--c-canvas'), fgFaint:v('--c-fg-faint'), fgSubtle:v('--c-fg-subtle') },
        header: pick('h-9'),
        sidebar: pick('w-40'),
        sceneNav: pick('w-56'),
        scriptDrawer: pick('w-80').concat(pick('w-[348px]')),
        mainKids: kids,
        txtLen: txt.length,
        txtHead: txt.slice(0,240)
      };
    }""")
    print(json.dumps(data, ensure_ascii=False, indent=2))
    b.close()

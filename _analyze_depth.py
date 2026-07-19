"""截取 ScriptWeaver 浅色模式空白场景导航完整界面 + DOM 结构分析"""
from playwright.sync_api import sync_playwright
import os, time, json

OUT = r'd:\ScriptWeaver\screenshots'
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    page.goto('http://localhost:5173')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(1500)

    # 确保浅色
    current_theme = page.evaluate("document.documentElement.getAttribute('data-theme')")
    if current_theme == 'dark':
        toggle = page.locator('[aria-label*="切换"], button[title*="切换"]')
        if toggle.count() > 0:
            toggle.first.click()
            page.wait_for_timeout(500)

    # 新建空白项目
    new_btn = page.get_by_text('新建', exact=False)
    if new_btn.count() > 0:
        try:
            new_btn.first.click()
            page.wait_for_timeout(300)
            confirm = page.get_by_text('确认新建')
            if confirm.count() > 0:
                confirm.click()
                page.wait_for_timeout(800)
        except:
            pass

    # 导航到场景导航
    chapters_nav = page.get_by_text('chapters', exact=True)
    if chapters_nav.count() == 0:
        nav_items = page.locator('nav a, [role="navigation"] button, aside button')
        for i in range(min(nav_items.count(), 8)):
            text = nav_items.nth(i).text_content() or ''
            if 'chapters' in text.lower() or '场景' in text or '导航' in text:
                nav_items.nth(i).click()
                page.wait_for_timeout(500)
                break

    page.wait_for_timeout(1000)

    ts = int(time.time())
    
    # 完整截图
    path_full = os.path.join(OUT, f'depth-full-{ts}.png')
    page.screenshot(path=path_full, full_page=False)
    print(f'FULL -> {path_full}')

    # 截取中间舞台区（核心问题区域）
    stage = page.evaluate("""
        () => {
            const main = document.querySelector('main');
            if (!main) return null;
            const rect = main.getBoundingClientRect();
            return {x: rect.x, y: rect.y, w: rect.width, h: rect.height,
                    classes: main.className};
        }
    """)
    print(f'STAGE -> {json.dumps(stage)}')

    # 分析三栏区域的背景和层级结构
    structure = page.evaluate("""
        () => {
            const container = document.querySelector('.relative.flex.flex-1.items-stretch');
            if (!container) return null;
            
            // 获取直接子元素及其样式
            const children = Array.from(container.children);
            return children.map((el, i) => {
                const cs = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                return {
                    idx: i,
                    tag: el.tagName,
                    cls: (el.className || '').toString().slice(0, 120),
                    bg: cs.backgroundColor,
                    border: cs.border,
                    boxShadow: cs.boxShadow,
                    borderRadius: cs.borderRadius,
                    pos: `${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.w)}x${Math.round(rect.h)}`
                };
            });
        }
    """)
    print(f'\nSTRUCTURE:')
    for s in (structure or []):
        print(json.dumps(s, ensure_ascii=False))

    browser.close()

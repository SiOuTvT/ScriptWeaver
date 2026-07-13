import os
from playwright.sync_api import sync_playwright

os.makedirs('shots', exist_ok=True)
URL = 'http://localhost:5173'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    page.goto(URL)
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(800)

    # 1 深色 场景导航（默认）
    page.screenshot(path='shots/01_dark_chapters.png')

    # 2 切浅色
    page.evaluate("document.documentElement.setAttribute('data-theme','light')")
    page.wait_for_timeout(500)
    page.screenshot(path='shots/02_light_chapters.png')

    # 用 JS 找侧栏按钮并点击（按 data 属性或位置，绕过编码问题）
    def click_sidebar_item(page, index):
        page.evaluate(f"""
            const btns = document.querySelectorAll('aside button');
            if (btns[{index}]) btns[{index}].click();
        """)

    # 3 素材管理 (第3个nav项 = aside内第3个button，index从折叠按钮算起=2...不对，折叠是单独button)
    # 实际结构：aside > [折叠button] + [nav > [6个button]] + [版本号div]
    # nav 内的 button 索引: 0=场景导航,1=剧本总览,2=素材管理,3=角色管理,4=导出设置,5=AI功能
    click_sidebar_item(page, 2)  # 素材管理
    page.wait_for_timeout(500)
    page.screenshot(path='shots/03_light_assets.png')

    # 4 角色管理
    click_sidebar_item(page, 3)
    page.wait_for_timeout(500)
    page.screenshot(path='shots/04_light_characters.png')

    browser.close()
    print('DONE')

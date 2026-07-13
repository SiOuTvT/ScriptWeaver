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

    # 1 深色 场景导航工作区
    page.screenshot(path='shots/01_dark_chapters.png')

    # 2 切浅色
    page.click('button[aria-label*="切换"]')
    page.wait_for_timeout(700)
    page.screenshot(path='shots/02_light_chapters.png')

    # 3 浅色 素材管理
    page.click('text=素材管理')
    page.wait_for_timeout(500)
    page.screenshot(path='shots/03_light_assets.png')

    # 4 浅色 角色管理
    page.click('text=角色管理')
    page.wait_for_timeout(500)
    page.screenshot(path='shots/04_light_characters.png')

    # 5 浅色 导出设置
    page.click('text=导出设置')
    page.wait_for_timeout(500)
    page.screenshot(path='shots/05_light_export.png')

    # 6 浅色 AI
    page.click('text=AI 功能')
    page.wait_for_timeout(500)
    page.screenshot(path='shots/06_light_ai.png')

    # 7 浅色 剧本总览
    page.click('text=剧本总览')
    page.wait_for_timeout(500)
    page.screenshot(path='shots/07_light_overview.png')

    # 8 回深色 素材管理
    page.click('button[aria-label*="切换"]')
    page.wait_for_timeout(600)
    page.click('text=素材管理')
    page.wait_for_timeout(500)
    page.screenshot(path='shots/08_dark_assets.png')

    # 9 深色 角色管理
    page.click('text=角色管理')
    page.wait_for_timeout(500)
    page.screenshot(path='shots/09_dark_characters.png')

    browser.close()
    print('DONE')

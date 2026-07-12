from playwright.sync_api import sync_playwright

def green(s): return f"\033[92m{s}\033[0m"
def red(s):   return f"\033[91m{s}\033[0m"
PASS = green("PASS")
FAIL = red("FAIL")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda err: errors.append(str(err)))

    page.goto('http://localhost:5173/', wait_until='networkidle', timeout=15000)
    page.wait_for_timeout(1500)

    # Find all nav buttons
    buttons = page.locator('nav button, [class*="sidebar"] button, [class*="nav"] button').all()
    nav_texts = []
    overview_btn = None
    for b in buttons:
        text = b.inner_text().strip()
        if text:
            nav_texts.append(text)
        if '\u5267\u672c\u603b\u89c8' in text:  # 剧本总览
            overview_btn = b

    print(f"Found nav items: {nav_texts}")

    if overview_btn is None:
        # Try clicking by nth - "剧本总览" should be 2nd
        # Actually let's just click the second nav button
        nav_items = page.locator('nav button').all()
        print(f"Nav buttons count: {len(nav_items)}")
        if len(nav_items) >= 2:
            overview_btn = nav_items[1]
            print(f"Using nav button[1]: {overview_btn.inner_text().strip()}")
            overview_btn.click()
    else:
        overview_btn.click()

    page.wait_for_timeout(1000)

    # ====== TEST 1: ScriptOverview loads content from mock deltas ======
    ta = page.locator('textarea')
    content = ta.input_value()

    has_mock_content = 'Alice:' in content and 'Bob:' in content
    line_count = len(content.split('\n'))
    print(f"TEST 1 - Load mock content: {PASS if has_mock_content else FAIL} ({line_count} lines)")
    if not has_mock_content:
        print(f"  Content ({len(content)} chars): {repr(content[:200])}")

    # ====== TEST 2: Edit + Ctrl+S preserves content ======
    original = content
    new_content = original + '\nCharlie: This is a new test line added'
    ta.fill(new_content)
    page.wait_for_timeout(200)

    # Verify typing worked
    typed = ta.input_value()
    has_new = 'Charlie: This is a new test line added' in typed
    print(f"  Pre-save content has new line: {PASS if has_new else FAIL}")

    # Ctrl+S
    page.keyboard.press('Control+s')
    page.wait_for_timeout(800)

    content_after = ta.input_value()
    has_saved = 'Alice:' in content_after and 'Charlie: This is a new test line added' in content_after
    not_empty = len(content_after.strip()) > 30
    n_after = len(content_after.split('\n'))
    print(f"TEST 2 - Ctrl+S preserves: {PASS if (has_saved and not_empty) else FAIL} ({n_after} lines)")
    if not has_saved:
        print(f"  After save ({len(content_after)} chars): {repr(content_after[:300])}")

    # ====== TEST 3: Navigate away and back ======
    # Go to assets page
    nav_btns = page.locator('nav button').all()
    assets_btn = None
    for b in nav_btns:
        if '\u7d20\u6750\u7ba1\u7406' in b.inner_text().strip():  # 素材管理
            assets_btn = b
            break
    if assets_btn is None and len(nav_btns) >= 3:
        assets_btn = nav_btns[2]  # 3rd button
    
    if assets_btn:
        assets_btn.click()
    page.wait_for_timeout(500)

    # Go back to overview
    nav_btns = page.locator('nav button').all()
    ov_btn = None
    for b in nav_btns:
        if '\u5267\u672c\u603b\u89c8' in b.inner_text().strip():
            ov_btn = b
            break
    if ov_btn is None and len(nav_btns) >= 2:
        ov_btn = nav_btns[1]
    
    if ov_btn:
        ov_btn.click()
    page.wait_for_timeout(1000)

    ta2 = page.locator('textarea')
    content_back = ta2.input_value()
    has_persisted = 'Charlie: This is a new test line added' in content_back and 'Alice:' in content_back
    num_lines = len(content_back.split('\n'))
    print(f"TEST 3 - Nav persist: {PASS if has_persisted else FAIL} ({num_lines} lines)")
    if not has_persisted:
        print(f"  After nav ({len(content_back)} chars): {repr(content_back[:300])}")

    # ====== TEST 4: JS errors ======
    print(f"JS errors: {len(errors)}")
    for e in errors[:5]:
        print(f"  {e[:200]}")

    browser.close()

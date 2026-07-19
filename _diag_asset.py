"""快速诊断素材系统三 bug 的实时状态"""
import subprocess, json, sys, os

# 启动 dev server（如未运行）
result = subprocess.run(['netstat', '-ano'], capture_output=True, text=True)
if ':5173' not in result.stdout:
    print("Vite dev server 未在 5173 运行，请先启动 npm run dev")
    sys.exit(1)

from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    
    # 捕获 console 错误和网络请求
    errors = []
    failed_urls = []
    page.on("console", lambda msg: errors.append(f"[{msg.type}] {msg.text}") if msg.type == "error" else None)
    page.on("request_failed", lambda req: failed_urls.append(f"FAIL {req.url} ({req.failure})"))
    
    # 监听所有图片请求的响应状态
    img_results = {}
    def on_response(resp):
        url = resp.url
        if any(ext in url for ext in ['.png', '.jpg', '.jpeg', '.webp', 'sw-asset']):
            img_results[url] = resp.status
    page.on("response", on_response)
    
    page.goto("http://localhost:5173", timeout=15000)
    page.wait_for_timeout(3000)
    
    # 截图看整体状态
    page.screenshot(path="d:/ScriptWeaver/screenshots/diag_full.png")
    
    # === 1. 检测素材列表中的预览图 ===
    print("\n=== 1. 素材预览图检测 ===")
    cards = page.query_selector_all("[draggable='true']")
    print(f"找到 {len(cards)} 个可拖拽素材卡片")
    
    for i, card in enumerate(cards[:10]):
        img = card.query_selector("img")
        if img:
            src = img.get_attribute("src") or ""
            natural_w = img.evaluate("el => el.naturalWidth")
            natural_h = img.evaluate("el => el.naturalHeight")
            display_w = img.evaluate("el => el.offsetWidth")
            display_h = img.evaluate("el.offsetHeight")
            
            status = "✅ OK" if natural_w > 0 else "❌ BROKEN"
            name_el = card.query_selector("[title]")
            name = name_el.get_attribute("title") if name_el else "?"
            print(f"  [{i}] {name}")
            print(f"      src={src[:80]}...")
            print(f"      natural={natural_w}x{natural_h} display={display_w}x{display_h} {status}")
        else:
            print(f"  [{i}] 无 img 标签（显示图标占位）")
    
    # === 2. 检测 sw-asset 协议请求 ===
    print("\n=== 2. sw-asset / 图片网络请求 ===")
    if img_results:
        for url, status in img_results.items():
            icon = "✅" if status == 200 else f"❌ {status}"
            print(f"  {icon} {status} {url[:100]}")
    else:
        print("  （无任何图片/sw-asset 请求记录）")
    
    if failed_urls:
        print("\n  失败的请求:")
        for u in failed_urls:
            print(f"    {u}")
    
    # === 3. 拖拽测试 ===
    print("\n=== 3. 拖拽测试 ===")
    if cards:
        card = cards[0]
        stage = page.query_selector('[ref="stageRef"]') or page.query_selector(".overflow-hidden.rounded-lg")
        
        # 找舞台区域（包含 onDragOver 的元素）
        stage_el = None
        candidates = page.query_selector_all("[ondragover], [onDragOver]")
        print(f"  注册了 dragover 的元素: {len(candidates)} 个")
        
        # 尝试从 SceneNavPanel 拖到舞台
        stage_area = page.query_selector("main")
        if stage_area and card:
            try:
                # 模拟拖动
                box = card.bounding_box()
                sbox = stage_area.bounding_box()
                if box and sbox:
                    cx = box['x'] + box['width'] / 2
                    cy = box['y'] + box['height'] / 2
                    sx = sbox['x'] + sbox['width'] / 2
                    sy = sbox['y'] + sbox['height'] / 2
                    
                    page.mouse.move(cx, cy)
                    page.mouse.down()
                    # 用 dispatch event 方式触发 HTML5 drag API
                    card.dispatch_event("dragstart")
                    
                    # 移到舞台中心并 drop
                    page.mouse.move(sx, sy, steps=10)
                    stage_area.dispatch_event("dragover")
                    stage_area.dispatch_event("drop")
                    page.mouse.up()
                    
                    page.wait_for_timeout(500)
                    print(f"  拖拽操作已执行 (card→stage center)")
                    
                    # 检查 toast 提示
                    toast = page.query_selector("[role='status']")
                    if toast:
                        txt = toast.inner_text()
                        print(f"  Toast: {txt}")
                else:
                    print("  无法获取边界框")
            except Exception as e:
                print(f"  拖拽异常: {e}")
    else:
        print("  无素材卡片，无法测试拖拽")
    
    # === 4. 控制台错误 ===
    print("\n=== 4. 控制台错误 ===")
    if errors:
        for e in errors[-15:]:
            print(f"  {e}")
    else:
        print("  无控制台错误")
    
    # 截图最终状态
    page.screenshot(path="d:/ScriptWeaver/screenshots/diag_after.png")
    browser.close()
    print("\n截图已保存到 screenshots/")

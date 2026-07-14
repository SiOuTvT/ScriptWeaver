import time
from playwright.sync_api import sync_playwright

URL = "http://localhost:5173/"

def set_all_asset_colors(pg, color):
    # 遍历三个素材 tab，把每个色块都设成 color
    for tab in ['背景', '立绘', '音频']:
        pg.evaluate("""(t) => {
            const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===t);
            if(b) b.click();
        }""", tab)
        time.sleep(0.4)
        pg.evaluate("""(c) => {
            const inp=document.querySelectorAll('input[type=color]');
            const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
            inp.forEach(el=>{ setter.call(el,c); el.dispatchEvent(new Event('input',{bubbles:true})); });
        }""", color)
        time.sleep(0.3)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    errors = []
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(URL, wait_until="networkidle")
    time.sleep(1.5)

    # 素材管理：把所有素材色块设绿
    pg.evaluate("""() => {
        const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='素材管理');
        if(b) b.click();
    }""")
    time.sleep(0.6)
    asset_count = pg.evaluate("""() => document.querySelectorAll('input[type=color]').length""")
    print("ASSET_COLOR_INPUTS:", asset_count)
    set_all_asset_colors(pg, '#00ff00')
    time.sleep(0.5)

    # 时间轴：统计绿色片段
    pg.evaluate("""() => {
        const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='时间轴');
        if(b) b.click();
    }""")
    time.sleep(0.9)
    green_tl = pg.evaluate("""() => {
        return [...document.querySelectorAll('*')].filter(el=>{
            const bg=el.style&&el.style.backgroundColor;
            return bg && bg.includes('0, 255, 0');
        }).length;
    }""")
    print("TIMELINE_GREEN_ELEMENTS:", green_tl)

    # 总览：统计绿色圆点
    pg.evaluate("""() => {
        const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='剧本总览');
        if(b) b.click();
    }""")
    time.sleep(0.9)
    green_ov = pg.evaluate("""() => {
        return [...document.querySelectorAll('*')].filter(el=>{
            const bg=el.style&&el.style.backgroundColor;
            return bg && bg.includes('0, 255, 0');
        }).length;
    }""")
    print("OVERVIEW_GREEN_ELEMENTS:", green_ov)
    print("ERRORS:", errors)
    b.close()

// 单位像素探针：只截 #ggb-element，红=1 x 单位、蓝=1 y 单位，测真实 px/unit
// 序列：①现状 shotA ②延迟 setCoordSystem 后 shotB，对比是否变正方形
const { chromium } = require('playwright-core');

async function measurePng(browser, pngPath) {
  const p2 = await browser.newPage();
  const url = 'file:///' + pngPath.replace(/\\/g, '/').replace(/ /g, '%20');
  await p2.goto(url, { waitUntil: 'load' });
  const res = await p2.evaluate(() => {
    let el = document.querySelector('img');
    if (!el) { el = new Image(); el.src = location.href; }
    if (!el.naturalWidth) return { err: 'no img' };
    const cv = document.createElement('canvas');
    cv.width = el.naturalWidth; cv.height = el.naturalHeight;
    const cx = cv.getContext('2d');
    cx.drawImage(el, 0, 0);
    const d = cx.getImageData(0, 0, cv.width, cv.height).data;
    const W = cv.width, H = cv.height;
    const red = [], blue = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (r > 245 && g < 25 && b < 25) red.push([x, y]);
      else if (b > 245 && r < 25 && g < 25) blue.push([x, y]);
    }
    const bb = (pts) => {
      if (!pts.length) return null;
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      return { w: x1 - x0 + 1, h: y1 - y0 + 1, n: pts.length };
    };
    return { W, H, red: bb(red), blue: bb(blue) };
  });
  await p2.close();
  return res;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const logs = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text().slice(0, 200)));
  page.on('pageerror', (e) => logs.push('PAGEERR: ' + String(e).slice(0, 200)));

  await page.goto('http://127.0.0.1:8123/gg/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  let ready = false;
  for (let i = 0; i < 90; i++) {
    const r = await page.evaluate(() => { const a = window.ggbApplet; return !!(a && typeof a.getObjectNumber === 'function'); });
    if (r) { ready = true; break; }
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(2500);

  // 注入单位探针（远离正方形：x=6..7 右侧空白区）
  await page.evaluate(() => {
    const a = window.ggbApplet;
    try { a.evalCommand('ph=Segment((6,0),(7,0))'); a.evalCommand('pv=Segment((6.5,0),(6.5,1))'); } catch (e) {}
    try { a.evalCommand('SetColor(ph,1,0,0)'); a.evalCommand('SetColor(pv,0,0,1)'); a.evalCommand('SetThickness(ph,5)'); a.evalCommand('SetThickness(pv,5)'); a.evalCommand('ShowLabel(ph,false)'); a.evalCommand('ShowLabel(pv,false)'); } catch (e) {}
  });
  await page.waitForTimeout(800);

  const snapVals = async () => page.evaluate(() => {
    const a = window.ggbApplet; const o = {};
    ['F', 'F0', 'E', 'ce', 'dCE', 'dCF', 'dAE', 'dAC', 'T1', 'T2', 'T3', 'T4'].forEach((k) => {
      try { o[k] = a.getValueString(k); } catch (e) { o[k] = 'ERR'; }
    });
    return o;
  });

  // shotA: 现状（页面自身 appletOnLoad 的 setCoordSystem 结果）
  const el = page.locator('#ggb-element');
  await el.screenshot({ path: "C:/Users/Curren Bouquetd'or/AppData/Local/Temp/gg_A.png" });
  const valsA = await snapVals();

  // 延迟 setCoordSystem（目标：x[-2,8] y[-0.29,6.89]，1:1 单位）
  const coord = await page.evaluate(() => {
    const a = window.ggbApplet;
    const el = document.getElementById('ggb-element');
    const cw = el.clientWidth, ch = el.clientHeight;
    const xr = 10;
    const yr = (cw > 0 && ch > 0) ? xr * (ch / cw) : 7.2;
    const box = { cw, ch, xr, yr, ymin: 3.3 - yr / 2, ymax: 3.3 + yr / 2, called: false };
    try { a.setCoordSystem(-2, 8, box.ymin, box.ymax); box.called = true; } catch (e) { box.err = String(e).slice(0, 120); }
    return box;
  });
  await page.waitForTimeout(1800);
  await el.screenshot({ path: "C:/Users/Curren Bouquetd'or/AppData/Local/Temp/gg_B.png" });
  const valsB = await snapVals();

  const A = await measurePng(browser, "C:/Users/Curren Bouquetd'or/AppData/Local/Temp/gg_A.png");
  const B = await measurePng(browser, "C:/Users/Curren Bouquetd'or/AppData/Local/Temp/gg_B.png");

  console.log('=== LOGS (tail) ==='); console.log(logs.slice(-6).join('\n'));
  console.log('=== COORD CALL ==='); console.log(JSON.stringify(coord, null, 1));
  console.log('=== VALUES A ==='); console.log(JSON.stringify(valsA, null, 1));
  console.log('=== VALUES B ==='); console.log(JSON.stringify(valsB, null, 1));
  console.log('=== SHOT A (现状) ==='); console.log(JSON.stringify(A, null, 1));
  const pxA = A.red && A.blue ? { x: A.red.w, y: A.blue.h, ratio: (A.red.w / A.blue.h).toFixed(3) } : null;
  console.log('A px/unit:', JSON.stringify(pxA));
  console.log('=== SHOT B (延迟setCoordSystem后) ==='); console.log(JSON.stringify(B, null, 1));
  const pxB = B.red && B.blue ? { x: B.red.w, y: B.blue.h, ratio: (B.red.w / B.blue.h).toFixed(3) } : null;
  console.log('B px/unit:', JSON.stringify(pxB));
  await browser.close();
})();
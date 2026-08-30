// 单位像素探针 v2：正确 255 色 + 探针放正方形内部 + XML grep 视口真相
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
  await page.goto('http://127.0.0.1:8123/gg/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  let ready = false;
  for (let i = 0; i < 90; i++) {
    const r = await page.evaluate(() => { const a = window.ggbApplet; return !!(a && typeof a.getObjectNumber === 'function'); });
    if (r) { ready = true; break; }
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(2500);

  await page.evaluate(() => {
    const a = window.ggbApplet;
    try {
      a.evalCommand('ph=Segment((2,0),(3,0))');   // 水平 1 单位（正方形内）
      a.evalCommand('pv=Segment((2,0),(2,1))');   // 垂直 1 单位
    } catch (e) {}
    try {
      a.evalCommand('SetColor(ph,255,0,0)');
      a.evalCommand('SetColor(pv,0,0,255)');
      a.evalCommand('SetThickness(ph,5)');
      a.evalCommand('SetThickness(pv,5)');
      a.evalCommand('ShowLabel(ph,false)');
      a.evalCommand('ShowLabel(pv,false)');
    } catch (e) {}
  });
  await page.waitForTimeout(800);

  const snap = () => page.evaluate(() => {
    const a = window.ggbApplet; const o = { vals: {}, xml: {} };
    ['F', 'F0', 'E', 'ce', 'dCE', 'dCF', 'dAE', 'dAC', 'ph', 'pv'].forEach((k) => {
      try { o.vals[k] = a.getValueString(k); } catch (e) { o.vals[k] = 'ERR'; }
    });
    try {
      const xml = a.getXML();
      ['coordSystem', 'euclidianView', 'xmin', 'xMin', 'ymin', 'yMin'].forEach((k) => {
        const i = xml.indexOf(k);
        o.xml[k] = i >= 0 ? xml.slice(Math.max(0, i - 120), i + 320) : 'NOT_FOUND';
      });
    } catch (e) { o.xml.err = String(e).slice(0, 100); }
    return o;
  });

  const el = page.locator('#ggb-element');
  await el.screenshot({ path: "C:/Users/Curren Bouquetd'or/AppData/Local/Temp/gg_A2.png" });
  const sA = await snap();

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
  await el.screenshot({ path: "C:/Users/Curren Bouquetd'or/AppData/Local/Temp/gg_B2.png" });
  const sB = await snap();

  console.log('=== COORD CALL ==='); console.log(JSON.stringify(coord, null, 1));
  console.log('=== SNAP A ==='); console.log(JSON.stringify(sA, null, 1));
  console.log('=== SNAP B (setCoordSystem 后) ==='); console.log(JSON.stringify(sB, null, 1));

  const A = await measurePng(browser, "C:/Users/Curren Bouquetd'or/AppData/Local/Temp/gg_A2.png");
  const B = await measurePng(browser, "C:/Users/Curren Bouquetd'or/AppData/Local/Temp/gg_B2.png");
  const fmt = (m) => (m.red && m.blue) ? { pxX: m.red.w, pxY: m.blue.h, ratio: (m.red.w / m.blue.h).toFixed(3), spanX: ((m.red.x1 - m.red.x0 + 1) || 0) } : null;
  console.log('=== SHOT A ==='); console.log(JSON.stringify(A, null, 1));
  console.log('A px/unit:', JSON.stringify(fmt(A)));
  console.log('=== SHOT B ==='); console.log(JSON.stringify(B, null, 1));
  console.log('B px/unit:', JSON.stringify(fmt(B)));
  await browser.close();
})();
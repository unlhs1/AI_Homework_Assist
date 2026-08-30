// 补偿法验证：从 XML 读真实视图 <size>，世界 Y 跨度按画布比例放大 → scale==yscale → 像素正方形
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

  // 读真实视图 size + 注入单位探针
  const pre = await page.evaluate(() => {
    const a = window.ggbApplet;
    const out = {};
    try {
      const xml = a.getXML();
      const ev = xml.match(/<euclidianView>([\s\S]*?)<\/euclidianView>/);
      if (ev) {
        const size = ev[1].match(/<size width="([\d.]+)" height="([\d.]+)"/);
        if (size) out.viewSize = { w: +size[1], h: +size[2] };
      }
    } catch (e) { out.err = String(e).slice(0, 100); }
    try {
      a.evalCommand('ph=Segment((2,0),(3,0))');
      a.evalCommand('pv=Segment((2,0),(2,1))');
      a.evalCommand('SetColor(ph,255,0,0)');
      a.evalCommand('SetColor(pv,0,0,255)');
      a.evalCommand('SetThickness(ph,5)');
      a.evalCommand('SetThickness(pv,5)');
      a.evalCommand('ShowLabel(ph,false)');
      a.evalCommand('ShowLabel(pv,false)');
    } catch (e) { out.probeErr = String(e).slice(0, 100); }
    return out;
  });
  await page.waitForTimeout(800);

  // 补偿法 setCoordSystem：spanY = spanX * h / w
  const coord = await page.evaluate(() => {
    const a = window.ggbApplet;
    let w = 458, h = 558;
    try {
      const xml = a.getXML();
      const ev = xml.match(/<euclidianView>([\s\S]*?)<\/euclidianView>/);
      if (ev) {
        const size = ev[1].match(/<size width="([\d.]+)" height="([\d.]+)"/);
        if (size) { w = +size[1]; h = +size[2]; }
      }
    } catch (e) {}
    const spanX = 10;
    const spanY = spanX * h / w;   // ≈ 12.18
    const ymid = 3.0;
    const box = { w, h, spanY, ymin: ymid - spanY / 2, ymax: ymid + spanY / 2 };
    try { a.setCoordSystem(-2, 8, box.ymin, box.ymax); box.called = true; } catch (e) { box.err = String(e).slice(0, 100); }
    return box;
  });
  await page.waitForTimeout(1800);

  const post = await page.evaluate(() => {
    const a = window.ggbApplet;
    const out = { vals: {} };
    ['F', 'E', 'dCE', 'dCF', 'dAE', 'dAC'].forEach((k) => {
      try { out.vals[k] = a.getValueString(k); } catch (e) { out.vals[k] = 'ERR'; }
    });
    try {
      const xml = a.getXML();
      const ev = xml.match(/<euclidianView>([\s\S]*?)<\/euclidianView>/);
      if (ev) {
        const cs = ev[1].match(/<coordSystem[^>]*scale="([\d.]+)" yscale="([\d.]+)"/);
        if (cs) out.coord = { scale: +cs[1], yscale: +cs[2], ratio: (+cs[1] / +cs[2]).toFixed(3) };
        const size = ev[1].match(/<size width="([\d.]+)" height="([\d.]+)"/);
        if (size) out.viewSize = { w: +size[1], h: +size[2] };
      }
    } catch (e) { out.err = String(e).slice(0, 100); }
    return out;
  });

  const el = page.locator('#ggb-element');
  await el.screenshot({ path: "C:/Users/Curren Bouquetd'or/AppData/Local/Temp/gg_comp.png" });
  const px = await measurePng(browser, "C:/Users/Curren Bouquetd'or/AppData/Local/Temp/gg_comp.png");

  console.log('=== PRE VIEW SIZE ===', JSON.stringify(pre));
  console.log('=== COMPENSATED COORD ===', JSON.stringify(coord, null, 1));
  console.log('=== POST ===', JSON.stringify(post, null, 1));
  console.log('=== PIXELS ===', JSON.stringify(px, null, 1));
  const r = px.red && px.blue ? { pxX: px.red.w, pxY: px.blue.h, ratio: (px.red.w / px.blue.h).toFixed(3) } : null;
  console.log('px/unit:', JSON.stringify(r), r ? (r.ratio > 0.97 && r.ratio < 1.03 ? '✅ SQUARE' : '❌ stretched') : '(no probe pixels)');
  await browser.close();
})();
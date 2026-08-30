// 终测：无参数 Point(path) 形式，headless 鼠标拖 F → F 值应变化
const { chromium } = require('playwright-core');

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
  await page.waitForTimeout(6000);

  const info = await page.evaluate(() => {
    const a = window.ggbApplet;
    const el = document.getElementById('ggb-element');
    const rect = el.getBoundingClientRect();
    const out = { rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height } };
    try {
      const xml = a.getXML();
      const ev = xml.match(/<euclidianView>([\s\S]*?)<\/euclidianView>/);
      const size = ev[1].match(/<size width="([\d.]+)" height="([\d.]+)"/);
      const cs = ev[1].match(/<coordSystem xZero="([\d.]+)" yZero="([\d.]+)" scale="([\d.]+)" yscale="([\d.]+)"/);
      const w = +size[1], h = +size[2], scale = +cs[3], yscale = +cs[4], xZero = +cs[1], yZero = +cs[2];
      out.view = { w, h, xmin: -xZero / scale, xmax: (w - xZero) / scale, ymin: -(h - yZero) / yscale, ymax: yZero / yscale };
    } catch (e) { out.err = String(e).slice(0, 100); }
    return out;
  });
  const getF = () => page.evaluate(() => { try { return window.ggbApplet.getValueString('F'); } catch (e) { return 'ERR'; } });
  console.log('info:', JSON.stringify(info));
  console.log('F before:', await getF());

  if (info.view && info.rect) {
    const g = info.view, r = info.rect;
    const px = (x, y) => [r.x + ((x - g.xmin) / (g.xmax - g.xmin)) * g.w, r.y + g.h - ((y - g.ymin) / (g.ymax - g.ymin)) * g.h];
    const [fx, fy] = px(4, 2);
    const [tx, ty] = px(4, 1);
    console.log('F px', fx.toFixed(1), fy.toFixed(1), '->', tx.toFixed(1), ty.toFixed(1));
    await page.mouse.move(fx, fy);
    await page.mouse.down();
    await page.waitForTimeout(400);
    await page.mouse.move(tx, ty, { steps: 15 });
    await page.mouse.up();
    await page.waitForTimeout(800);
    console.log('F after drag to y=1:', await getF());
  }
  console.log('LOGS:', logs.slice(-8).join(' | '));
  await browser.close();
})();
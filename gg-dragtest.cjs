// F 拖动实测：真实鼠标拖 F，读 F 值变化；附带工具/捕捉 API 探测
const { chromium } = require('playwright-core');

async function probe(app) {
  // F 的世界坐标 → 视图像素
  // 视图 770×558, x∈[-2,8], y∈[ymin,ymax]（从 XML 读）
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
  await page.waitForTimeout(6000);

  // 工具/捕捉相关 API
  const cap = await page.evaluate(() => {
    const a = window.ggbApplet;
    const out = { methods: {} };
    ['setTool', 'selectTool', 'getToolNumber', 'setMoveMode', 'getMoveMode', 'setActiveTool',
     'setPointCapturing', 'getPointCapturing', 'setGridVisible', 'getGridVisible'].forEach((m) => {
      try { out.methods[m] = typeof a[m]; } catch (e) { out.methods[m] = 'ERR'; }
    });
    try { out.pc = a.getPointCapturing(); } catch (e) {}
    try { out.tool = a.getToolNumber ? a.getToolNumber() : 'n/a'; } catch (e) {}
    // XML: pointCapturing 属性
    try {
      const xml = a.getXML();
      const ev = xml.match(/<euclidianView>([\s\S]*?)<\/euclidianView>/);
      if (ev) {
        const pc = ev[1].match(/pointCapturing="([\d.]+)"/);
        if (pc) out.xmlPC = pc[1];
      }
    } catch (e) {}
    return out;
  });
  console.log('=== CAP ===');
  console.log(JSON.stringify(cap, null, 1));

  // F 屏幕坐标
  const geo = await page.evaluate(() => {
    const a = window.ggbApplet;
    const out = { ymin: null, ymax: null, spanX: 10 };
    try {
      const xml = a.getXML();
      const ev = xml.match(/<euclidianView>([\s\S]*?)<\/euclidianView>/);
      if (ev) {
        const size = ev[1].match(/<size width="([\d.]+)" height="([\d.]+)"/);
        const cs = ev[1].match(/<coordSystem xZero="([\d.]+)" yZero="([\d.]+)" scale="([\d.]+)" yscale="([\d.]+)"/);
        if (size && cs) {
          out.w = +size[1]; out.h = +size[2];
          out.scale = +cs[3]; out.yscale = +cs[4];
          out.xZero = +cs[1]; out.yZero = +cs[2];
          out.xmin = -out.xZero / out.scale;
          out.xmax = (out.w - out.xZero) / out.scale;
          out.ymin = -(out.h - out.yZero) / out.yscale;
          out.ymax = out.yZero / out.yscale;
        }
      }
    } catch (e) { out.err = String(e).slice(0, 120); }
    return out;
  });
  console.log('=== VIEW GEO ===');
  console.log(JSON.stringify(geo, null, 1));

  const bb = await page.locator('#ggb-element').boundingBox();
  console.log('=== ELEMENT BB ===', JSON.stringify(bb));

  const getF = () => page.evaluate(() => { try { return window.ggbApplet.getValueString('F'); } catch (e) { return 'ERR'; } });
  const before = await getF();
  console.log('F before:', before);

  if (geo && bb) {
    const pxX = (x) => bb.x + ((x - geo.xmin) / (geo.xmax - geo.xmin)) * geo.w;
    const pxY = (y) => bb.y + geo.h - ((y - geo.ymin) / (geo.ymax - geo.ymin)) * geo.h;
    const [x0, y0] = [pxX(4), pxY(2)];   // F 起点 (4,2)
    const [x1, y1] = [pxX(4), pxY(1)];   // 目标 (4,1)（屏幕向下 → 世界 y 减小）
    console.log('F screen', x0, y0, '-> target', x1, y1);
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x1, y1, { steps: 12 });
    await page.waitForTimeout(400);
    const mid = await getF();
    console.log('F mid:', mid);
    await page.mouse.up();
    await page.waitForTimeout(600);
    const after = await getF();
    console.log('F after:', after);
  }
  console.log('=== LOGS ===');
  console.log(logs.slice(-8).join('\n') || '(none)');
  await browser.close();
})();
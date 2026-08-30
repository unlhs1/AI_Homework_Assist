// 终验证：页面自执行 setPerspective+setView 后，读 XML 视图尺寸/scale/yscale/对象值 + 截图
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
  await page.waitForTimeout(6000); // 等 setPerspective + 两次延迟 setView 全部执行完

  // 注入单位探针（若之前失败这次再试：纯色 255 + 无名线段避免保留字）
  await page.evaluate(() => {
    const a = window.ggbApplet;
    try {
      a.evalCommand('pH=Segment((2,0),(3,0))');
      a.evalCommand('pV=Segment((2,0),(2,1))');
    } catch (e) {}
    try {
      a.evalCommand('SetColor(pH,255,0,0)');
      a.evalCommand('SetColor(pV,0,0,255)');
      a.evalCommand('SetThickness(pH,5)');
      a.evalCommand('SetThickness(pV,5)');
    } catch (e) {}
  });
  await page.waitForTimeout(1000);

  const data = await page.evaluate(() => {
    const a = window.ggbApplet;
    const out = { vals: {} };
    ['F', 'F0', 'E', 'ce', 'dCE', 'dCF', 'dAE', 'dAC', 'pH', 'pV', 'T1', 'T2', 'T3', 'T4'].forEach((k) => {
      try { out.vals[k] = a.getValueString(k); } catch (e) { out.vals[k] = 'ERR'; }
    });
    try {
      const xml = a.getXML();
      const ev = xml.match(/<euclidianView>([\s\S]*?)<\/euclidianView>/);
      if (ev) {
        const size = ev[1].match(/<size width="([\d.]+)" height="([\d.]+)"/);
        const cs = ev[1].match(/<coordSystem[^>]*scale="([\d.]+)" yscale="([\d.]+)"/);
        if (size) out.viewSize = { w: +size[1], h: +size[2] };
        if (cs) {
          const c = { scale: +cs[1], yscale: +cs[2], ratio: (+cs[1] / +cs[2]).toFixed(3) };
          out.coord = c;
          out.verdict = Math.abs(c.scale - c.yscale) < 0.5 ? 'SQUARE ✓' : 'STRETCHED ✗';
        }
      }
    } catch (e) { out.err = String(e).slice(0, 120); }
    return out;
  });
  console.log('=== RESULTS ===');
  console.log(JSON.stringify(data, null, 1));
  console.log('=== LOGS ===');
  console.log(logs.slice(-8).join('\n') || '(none)');

  await page.locator('#ggb-element').screenshot({ path: "C:/Users/Curren Bouquetd'or/AppData/Local/Temp/gg_final.png", fullPage: false });
  console.log('=== SHOT gg_final saved ===');
  await browser.close();
})();
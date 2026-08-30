// 诊断：headless 打开 GG 演示页，读 GeoGebra API 真实状态
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const logs = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text().slice(0, 250)));
  page.on('pageerror', (e) => logs.push('PAGEERR: ' + String(e).slice(0, 250)));

  await page.goto('http://127.0.0.1:8123/gg/index.html', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });

  // 等 applet 就绪（轮询 window.ggbApplet）
  let ready = false;
  for (let i = 0; i < 60; i++) {
    const r = await page.evaluate(() => {
      const a = window.ggbApplet;
      return !!(a && typeof a.getObjectNumber === 'function');
    });
    if (r) { ready = true; break; }
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(3000); // 给 buildFigure 一点余量

  const data = await page.evaluate(() => {
    const a = window.ggbApplet;
    const out = { ready: !!a };
    if (!a) return out;
    try {
      out.nObj = a.getObjectNumber();
      const names = [];
      for (let i = 0; i < out.nObj; i++) names.push(a.getObjectName(i));
      out.names = names;
      ['A', 'B', 'C', 'D', 'F', 'F0', 'E', 'dCE', 'dCF', 'dAE', 'dAC', 'T1', 'T2', 'T3', 'T4'].forEach((k) => {
        try { out[k] = a.getValueString(k); } catch (e) { out[k] = 'ERR:' + String(e).slice(0, 60); }
      });
      ['getXmin', 'getXmax', 'getYmin', 'getYmax', 'getWidth', 'getHeight'].forEach((m) => {
        try { out[m] = typeof a[m] === 'function' ? a[m]() : 'n/a'; } catch (e) { out[m] = 'ERR'; }
      });
      const hasF = out.names.indexOf('F') !== -1;
      const hasF0 = out.names.indexOf('F0') !== -1;
      out.fHasF0 = hasF0;
    } catch (e) {
      out.fatal = String(e).slice(0, 200);
    }
    return out;
  });

  console.log('=== CONSOLE LOGS (top 25) ===');
  console.log(logs.slice(0, 25).join('\n') || '(none)');
  console.log('=== DATA ===');
  console.log(JSON.stringify(data, null, 1));
  try {
    await page.screenshot({ path: "C:/Users/Curren Bouquetd'or/AppData/Local/Temp/gg_headless.png", fullPage: true });
    console.log('=== SHOT saved ===');
  } catch (e) {
    console.log('shot fail', String(e).slice(0, 120));
  }
  await browser.close();
})();
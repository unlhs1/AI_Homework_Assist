// 诊断 geo3d shot 链路：THREE / 容器DOM / WebGL / run返回文案 / img增量
const { chromium } = require('E:/Applications/Claude_Code/logs/_e2etest/node_modules/playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1380, height: 940 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => errs.push('console(' + m.type() + '): ' + m.text().slice(0, 120)));
  await page.goto('http://127.0.0.1:8123/ai/index.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2500);
  const diag = await page.evaluate(() => {
    const d = {};
    d.three = typeof window.THREE;
    d.threeRev = window.THREE && window.THREE.REVISION;
    const el = document.getElementById('geo3d-element');
    d.elExists = !!el;
    if (el) { d.elDisplay = el.style.display || '(default)'; d.elW = el.clientWidth; d.elH = el.clientHeight; d.elChildren = el.children.length; }
    d.geo3dLoaded = typeof window.geo3d;
    d.postFigure = typeof window.postFigure;
    try { const c = document.createElement('canvas'); d.webgl = !!(c.getContext('webgl') || c.getContext('experimental-webgl')); } catch (e) { d.webgl = 'ERR:' + e.message; }
    try {
      const r1 = window.geo3d.run(JSON.stringify({ action: 'solid', kind: 'cube', top: '白', right: '绿', front: '黑' }));
      d.solid = String((r1 && r1.result) || r1).slice(0, 60);
      const before = document.querySelectorAll('#chat-scroll img.m-img').length;
      const r2 = window.geo3d.run(JSON.stringify({ action: 'shot' }));
      d.shot = String((r2 && r2.result) || r2).slice(0, 80);
      const after = document.querySelectorAll('#chat-scroll img.m-img').length;
      d.imgDelta = after - before;
      if (d.imgDelta > 0) {
        const img = document.querySelectorAll('#chat-scroll img.m-img')[after - 1];
        d.lastSrc = img.src.slice(0, 30);
      }
      if (el) { d.canvasInEl = el.querySelectorAll('canvas').length; }
    } catch (e) { d.runErr = e.message; }
    return d;
  });
  console.log('DIAG ' + JSON.stringify(diag, null, 1));
  console.log('PAGE ERRORS: ' + (errs.length ? '\n  ' + errs.slice(0, 10).join('\n  ') : 'none'));
  await browser.close();
})().catch(e => { console.error('crash: ' + e.message); process.exit(3); });

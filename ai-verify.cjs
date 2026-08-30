// AI 工作流页验证：打开 /ai/index.html → 载入内置演示 → 生成交互演示 → 读 GGB 状态 + 拖动 F 测试
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const logs = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text().slice(0, 200)));
  page.on('pageerror', (e) => logs.push('PAGEERR: ' + String(e).slice(0, 200)));

  await page.goto('http://127.0.0.1:8123/ai/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });

  // 等 GGB 就绪
  let ready = false;
  for (let i = 0; i < 90; i++) {
    const r = await page.evaluate(() => { const a = window.ggbApplet; return !!(a && typeof a.getObjectNumber === 'function'); });
    if (r) { ready = true; break; }
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(3000);
  console.log('applet ready:', ready);

  // 点「载入内置演示 JSON」
  await page.click('#btn-demo');
  await page.waitForTimeout(500);
  const btnBuildDisabled = await page.evaluate(() => document.getElementById('btn-build').disabled);
  console.log('btn-build disabled after demo load:', btnBuildDisabled);

  // 点「生成交互演示」
  await page.click('#btn-build');
  await page.waitForTimeout(6000); // 等 setView 延迟执行完

  const data = await page.evaluate(() => {
    const a = window.ggbApplet;
    const out = { vals: {} };
    ['A', 'B', 'C', 'D', 'F', 'F0', 'E', 'ce', 'dCE', 'dCF', 'dAE', 'dAC', 'T1', 'T2', 'T3', 'T4'].forEach((k) => {
      try { out.vals[k] = a.getValueString(k); } catch (e) { out.vals[k] = 'ERR'; }
    });
    try {
      const xml = a.getXML();
      const ev = xml.match(/<euclidianView>([\s\S]*?)<\/euclidianView>/);
      if (ev) {
        const size = ev[1].match(/<size width="([\d.]+)" height="([\d.]+)"/);
        const cs = ev[1].match(/<coordSystem[^>]*scale="([\d.]+)" yscale="([\d.]+)"/);
        if (size) out.viewSize = { w: +size[1], h: +size[2] };
        if (cs) out.coord = { scale: +cs[1], yscale: +cs[2], ratio: (+cs[1] / +cs[2]).toFixed(3) };
      }
    } catch (e) { out.err = String(e).slice(0, 120); }
    return out;
  });
  console.log('=== AI 页生成结果 ===');
  console.log(JSON.stringify(data, null, 1));
  console.log('=== LOGS ===');
  console.log(logs.slice(-10).join('\n') || '(none)');

  await page.locator('#ggb-element').screenshot({ path: "C:/Users/Curren Bouquetd'or/AppData/Local/Temp/gg_ai.png" });
  console.log('shot gg_ai saved');
  await browser.close();
})();
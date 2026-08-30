// 机制确认：setCoords 移动 F → E/dCE/dCF/dAE 是否联动更新（证明构造机制 OK，问题仅在鼠标交互）
const { chromium } = require('playwright-core');

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
  await page.waitForTimeout(6000);

  const snap = () => page.evaluate(() => {
    const a = window.ggbApplet;
    const o = {};
    ['F', 'F0', 'E', 'ce', 'dCE', 'dCF', 'dAE', 'dAC'].forEach((k) => {
      try { o[k] = a.getValueString(k); } catch (e) { o[k] = 'ERR'; }
    });
    return o;
  });

  console.log('before:', JSON.stringify(await snap()));
  const r1 = await page.evaluate(() => {
    const a = window.ggbApplet;
    const out = {};
    try { a.evalCommand('SetCoords(F, 4, 3)'); out.cmd = 'ok'; } catch (e) { out.cmd = 'ERR:' + String(e).slice(0, 100); }
    return out;
  });
  await page.waitForTimeout(800);
  console.log('setCoords(F,4,3):', JSON.stringify(r1));
  console.log('after move to y=3:', JSON.stringify(await snap()));

  const r2 = await page.evaluate(() => {
    const a = window.ggbApplet;
    try { a.evalCommand('SetCoords(F, 4, 2.928203230275509)'); return 'ok'; } catch (e) { return 'ERR:' + String(e).slice(0, 100); }
  });
  await page.waitForTimeout(800);
  console.log('setCoords to F\' y:', JSON.stringify(r2));
  console.log('after move to F\' pos:', JSON.stringify(await snap()));
  await browser.close();
})();
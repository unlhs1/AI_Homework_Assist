const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const p = await b.newPage();
  await p.goto('http://127.0.0.1:8123/ai/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(3000);
  const r = await p.evaluate(() => ({
    preset: document.getElementById('preset').value,
    protocol: document.getElementById('protocol').value,
    baseurl: document.getElementById('baseurl').value,
    model: document.getElementById('model').value
  }));
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();

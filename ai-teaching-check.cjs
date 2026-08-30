// 冒烟扩展：验证内置演示路径把 teaching 讲题块渲染出来
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
  });
  const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  await p.goto('http://127.0.0.1:8123/ai/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 50; i++) {
    const r = await p.evaluate(() => !!(window.ggbApplet && typeof window.ggbApplet.getObjectNumber === 'function'));
    if (r) break;
    await p.waitForTimeout(2000);
  }
  await p.click('#btn-demo');
  await p.waitForTimeout(3000);
  const out = await p.evaluate(() => ({
    teaching: document.querySelectorAll('.teaching').length,
    teachingHead: (document.querySelector('.teaching b') || {}).textContent || '',
    teachingLen: (document.querySelector('.teaching') || {}).textContent ? document.querySelector('.teaching').textContent.length : 0,
    condSrc: Array.from(document.querySelectorAll('.tip b')).map((x) => x.textContent),
    stems: document.querySelectorAll('.stem').length,
    steps: document.querySelectorAll('.steps li').length,
    answerBox: document.querySelectorAll('.answer-box').length
  }));
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
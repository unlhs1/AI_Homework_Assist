// 诊断：演示路径不渲染 teaching —— 抓 pageerror / console
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
  });
  const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  const logs = [];
  p.on('console', (m) => logs.push(m.type() + ': ' + m.text().slice(0, 300)));
  p.on('pageerror', (e) => logs.push('PAGEERR: ' + String(e).slice(0, 500)));
  await p.goto('http://127.0.0.1:8123/ai/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 50; i++) {
    const r = await p.evaluate(() => !!(window.ggbApplet && typeof window.ggbApplet.getObjectNumber === 'function'));
    if (r) break;
    await p.waitForTimeout(2000);
  }
  const pre = await p.evaluate(() => ({
    hasBtn: !!document.getElementById('btn-demo'),
    chatMsgs: document.querySelectorAll('.msg').length,
    sysChips: Array.from(document.querySelectorAll('.msg.sys')).map((e) => e.textContent.slice(0, 60))
  }));
  await p.click('#btn-demo');
  await p.waitForTimeout(4000);
  const post = await p.evaluate(() => ({
    teaching: document.querySelectorAll('.teaching').length,
    stems: document.querySelectorAll('.stem').length,
    steps: document.querySelectorAll('.steps li').length,
    answerBox: document.querySelectorAll('.answer-box').length,
    rawJson: document.querySelectorAll('.raw-json').length,
    msgs: document.querySelectorAll('.msg').length,
    lastChip: Array.from(document.querySelectorAll('.msg.sys')).slice(-2).map((e) => e.textContent.slice(0, 120))
  }));
  console.log('=== LOGS ===');
  console.log(logs.slice(0, 25).join('\n') || '(none)');
  console.log('=== PRE ===', JSON.stringify(pre, null, 1));
  console.log('=== POST ===', JSON.stringify(post, null, 1));
  await b.close();
})();
// 探针：ReAct 全流程中模型是否主动调用 student_calc/student_solve 草稿纸
const { chromium } = require('playwright-core');
const AI_KEY = process.env.AI_KEY || 'sk-REPLACE-WITH-YOUR-KEY';
(async () => {
  const b = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
  });
  const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  const calls = [];
  p.on('console', (m) => { const t = m.text(); if (/student_|草稿纸/.test(t)) calls.push(t.slice(0, 200)); });
  await p.goto('http://127.0.0.1:8123/ai/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 50; i++) {
    const r = await p.evaluate(() => !!(window.ggbApplet && typeof window.ggbApplet.getObjectNumber === 'function'));
    if (r) break;
    await p.waitForTimeout(2000);
  }
  await p.evaluate((key) => {
    const el = document.getElementById('apikey');
    el.value = key;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, AI_KEY);
  await p.fill('#input-text', '正方形ABCD边长4，F在CD上，DE∥AC且AE=AC，求F使CE=CF。请按流程：构造—验证—解方程（用草稿纸）—输出JSON');
  await p.click('#btn-send');
  // 观察 5 分钟
  let sawCalc = false, sawSolve = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 300000) {
    const st = await p.evaluate(() => ({
      cards: Array.from(document.querySelectorAll('.toolcard .tc-head b')).map((x) => x.textContent),
      chips: Array.from(document.querySelectorAll('.msg.sys')).slice(-3).map((x) => x.textContent.slice(0, 60)),
      done: !document.getElementById('btn-send').disabled && document.querySelectorAll('.stem').length > 0
    }));
    st.cards.forEach((c) => { if (c === 'student_calc') sawCalc = true; if (c === 'student_solve') sawSolve = true; });
    console.log('T+' + Math.round((Date.now() - t0) / 1000) + 's', JSON.stringify(st.cards.slice(-6)), st.chips.map((c) => c.slice(0, 40)).join('|'));
    if (st.done) { console.log('DONE'); break; }
    await p.waitForTimeout(10000);
  }
  console.log('=== SAW student_calc:', sawCalc, '| student_solve:', sawSolve);
  await b.close();
})();
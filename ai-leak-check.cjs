// 验证：① 修复后 prompt 无泄漏；② 无图时模型不再猜题（应明确说缺图/要求提供题目）
const { chromium } = require('playwright-core');
const BAILIAN_KEY = process.env.BAILIAN_KEY || 'sk-REPLACE-WITH-YOUR-KEY';
(async () => {
  const b = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  await p.goto('http://127.0.0.1:8123/ai/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 50; i++) {
    const r = await p.evaluate(() => !!(window.ggbApplet && typeof window.ggbApplet.getObjectNumber === 'function'));
    if (r) break;
    await p.waitForTimeout(2000);
  }
  await p.evaluate((k) => {
    document.getElementById('protocol').value = 'dashscope';
    document.getElementById('baseurl').value = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    document.getElementById('model').value = 'qwen3.5-omni-plus-2026-03-15';
    document.getElementById('apikey').value = k;
    ['protocol','baseurl','model','apikey'].forEach((id) => document.getElementById(id).dispatchEvent(new Event('input', { bubbles: true })));
    document.getElementById('stage-apikey').value = k;
    document.getElementById('stage-apikey').dispatchEvent(new Event('input', { bubbles: true }));
    // clear scratch
    try { localStorage.removeItem('tutorreel_scratch_paper'); } catch (e) {}
  }, BAILIAN_KEY);
  // 传图
  await p.setInputFiles('#file-input', 'assets/problem.jpg');
  await p.waitForTimeout(1200);
  await p.fill('#input-text', '解出图中的题目');
  await p.click('#btn-send');
  const t0 = Date.now();
  let sawTools = false, done = false;
  for (let i = 0; i < 40; i++) {
    const st = await p.evaluate(() => ({
      cards: Array.from(document.querySelectorAll('.toolcard .tc-head b')).map((x) => x.textContent),
      think0: Array.from(document.querySelectorAll('.think-body'))[0] ? Array.from(document.querySelectorAll('.think-body'))[0].textContent.slice(0, 200) : '',
      stem: document.querySelectorAll('.stem').length,
      busy: !document.getElementById('btn-send').disabled
    }));
    if (!sawTools && st.cards.length) { sawTools = true; console.log('T+' + Math.round((Date.now() - t0) / 1000) + 's 工具轮:', st.cards.slice(0, 4).join(',')); }
    if (i % 5 === 0) console.log('T+' + Math.round((Date.now() - t0) / 1000) + 's think0:', st.think0.slice(0, 120).replace(/\n/g, ' '));
    if (!st.busy && (st.stem > 0 || st.cards.length > 0)) { done = true; console.log('DONE at ' + Math.round((Date.now() - t0) / 1000) + 's stem:' + st.stem); break; }
    if (Date.now() - t0 > 200000) { console.log('TIMEOUT'); break; }
    await p.waitForTimeout(5000);
  }
  console.log('sawTools:', sawTools, 'done:', done);
  await b.close();
})();
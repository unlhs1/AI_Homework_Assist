// 验证图片转录层：传 problem.jpg → transcribe → 题干应含 AE=AC / 正方形等关键条件
const { chromium } = require('playwright-core');
const K = 'sk-REPLACE-WITH-YOUR-KEY';
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
  }, K);
  await p.setInputFiles('#file-input', 'assets/problem.jpg');
  await p.waitForTimeout(1200);
  await p.fill('#input-text', '解出图中的题目');
  await p.click('#btn-send');
  // 等转录 chip
  let trChip = null, t0 = Date.now();
  for (let i = 0; i < 40; i++) {
    const chips = await p.evaluate(() => Array.from(document.querySelectorAll('.msg.sys')).map((e) => e.textContent));
    trChip = chips.find((c) => c.includes('图片转录')) || null;
    if (trChip) break;
    if (Date.now() - t0 > 60000) break;
    await p.waitForTimeout(1500);
  }
  console.log('转录chip:', trChip);
  // 查看转录全文是否含 AE=AC
  const tr = await p.evaluate(() => (window.__figureTranscript ? window.__figureTranscript : null));
  console.log('转录 JSON:', JSON.stringify(tr, null, 1).slice(0, 800));
  console.log('含AE=AC?', tr && tr.question ? /AE\s*=\s*AC|AE=AC|AC=AE/.test(tr.question) : 'N/A');
  await b.close();
})();
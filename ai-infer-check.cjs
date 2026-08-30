// 验证反推隐含前提闭环：传原图（无 AE=AC 无标记）→ 转录空 marks → 模型构造发现矛盾 → 反推 AE=AC
const { chromium } = require('playwright-core');
const K = 'sk-REPLACE-WITH-YOUR-KEY';
(async () => {
  const b = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 150)));
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
  const t0 = Date.now();
  let trans = null, stageChip = null, done = false;
  for (let i = 0; i < 90; i++) {
    const st = await p.evaluate(() => {
      const chips = Array.from(document.querySelectorAll('.msg.sys')).map((e) => e.textContent);
      return {
        chips,
        cards: Array.from(document.querySelectorAll('.toolcard .tc-head b')).map((x) => x.textContent),
        think0: Array.from(document.querySelectorAll('.think-body'))[0] ? Array.from(document.querySelectorAll('.think-body'))[0].textContent.slice(0, 600) : '',
        stem: document.querySelectorAll('.stem').length,
        busy: !document.getElementById('btn-send').disabled
      };
    });
    if (!trans) {
      const c = st.chips.find((x) => x.includes('图片转录'));
      if (c && c.includes('完成')) { trans = true; console.log('T+' + Math.round((Date.now() - t0) / 1000) + 's 转录:', c.slice(0, 120)); }
    }
    if (!stageChip) { stageChip = st.chips.find((x) => x.includes('学段定性')) || null; if (stageChip) console.log('stageChip:', stageChip.slice(0, 90)); }
    if (i % 6 === 0 && st.cards.length) {
      console.log('T+' + Math.round((Date.now() - t0) / 1000) + 's cards:', st.cards.slice(-5).join(','), 'stem:', st.stem, 'think0:', st.think0.slice(0, 90).replace(/\n/g, ' '));
    }
    // 检测是否出现"反推/隐含/矛盾"等关键动作
    if (st.think0 && /反推|隐含|矛盾|AE=AC|必要|约束|特定位置/.test(st.think0)) {
      console.log('>>> 反推迹象@T+' + Math.round((Date.now() - t0) / 1000) + 's:', st.think0.slice(0, 260).replace(/\n/g, ' '));
    }
    if (!st.busy && st.stem > 0) { done = true; console.log('DONE@' + Math.round((Date.now() - t0) / 1000) + 's stem:', st.stem); break; }
    if (Date.now() - t0 > 300000) break;
    await p.waitForTimeout(5000);
  }
  console.log('== done:', done, 'errs:', errs.length ? errs.join('|') : '(无)');
  await b.close();
})();
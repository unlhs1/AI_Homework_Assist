// 端到端：百炼 key 支配（主模型 qwen3.5-omni-plus-2026-03-15 + stage 同通道）
// 验证：定性秒回、思考收敛、模型用草稿纸、最终 JSON
const { chromium } = require('playwright-core');
const BAILIAN_KEY = process.env.BAILIAN_KEY || 'sk-REPLACE-WITH-YOUR-KEY';
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
  // 主配置 = 百炼 qwen（协议 dashscope）
  await p.evaluate((k) => {
    document.getElementById('protocol').value = 'dashscope';
    document.getElementById('baseurl').value = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    document.getElementById('model').value = 'qwen3.5-omni-plus-2026-03-15';
    document.getElementById('apikey').value = k;
    ['protocol','baseurl','model','apikey'].forEach((id) => {
      document.getElementById(id).dispatchEvent(new Event('input', { bubbles: true }));
    });
    // stage 同 key
    document.getElementById('stage-apikey').value = k;
    document.getElementById('stage-apikey').dispatchEvent(new Event('input', { bubbles: true }));
  }, BAILIAN_KEY);

  await p.fill('#input-text', '正方形ABCD边长4，F在CD边上，DE∥AC且AE=AC，求证CE=CF。请按流程：构造—查询验证—需要代数时用草稿纸—输出JSON并讲题');
  const t0 = Date.now();
  await p.click('#btn-send');
  let stageChip = null, sawCalc = false, sawQuery = false, done = false;
  for (let i = 0; i < 60; i++) {
    const st = await p.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.toolcard .tc-head b')).map((x) => x.textContent);
      const chips = Array.from(document.querySelectorAll('.msg.sys')).map((x) => x.textContent);
      return {
        cards, chips,
        thk: Array.from(document.querySelectorAll('.think-body')).reduce((n, e) => n + e.textContent.length, 0),
        stem: document.querySelectorAll('.stem').length,
        busy: !document.getElementById('btn-send').disabled
      };
    });
    if (!stageChip) { stageChip = st.chips.find((c) => c.includes('学段定性')) || null; if (stageChip) console.log('stageChip(' + ((Date.now() - t0) / 1000).toFixed(1) + 's):', stageChip.slice(0, 90)); }
    st.cards.forEach((c) => { if (/student/.test(c)) sawCalc = true; if (c === 'ggb_query') sawQuery = true; });
    if (i % 6 === 0) {
      console.log('T+' + ((Date.now() - t0) / 1000).toFixed(0) + 's', 'cards:', st.cards.slice(-5).join(','), 'thinkChars:', st.thk, 'stem:', st.stem, 'busy:', st.busy);
    }
    if (!st.busy && st.stem > 0) { done = true; console.log('DONE at ' + ((Date.now() - t0) / 1000).toFixed(0) + 's'); break; }
    if (st.busy === false && st.stem === 0 && st.cards.length === 0 && i > 8) { console.log('EARLY-END(无工具无输出) at ' + ((Date.now() - t0) / 1000).toFixed(0) + 's'); break; }
    await p.waitForTimeout(10000);
  }
  console.log('=== sawCalc:', sawCalc, '| sawQuery:', sawQuery, '| done:', done);
  await b.close();
})();
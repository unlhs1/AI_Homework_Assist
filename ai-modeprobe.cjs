// 双模式验证（百炼）：文本模式 → 泛化解；图模式 → 特定解。每题发送前确保上一轮结束
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
  }, BAILIAN_KEY);

  const sendOne = async (title, text, watchSec) => {
    await p.fill('#input-text', text);
    await p.click('#btn-send');
    // 等模式 chip 出现
    let modeChip = null;
    for (let i = 0; i < 24; i++) {
      const chips = await p.evaluate(() => Array.from(document.querySelectorAll('.msg.sys')).map((e) => e.textContent));
      modeChip = chips.find((c) => c.includes('题型模式'));
      if (modeChip) break;
      await p.waitForTimeout(1500);
    }
    console.log('[' + title + '] modeChip:', modeChip);
    // 等这轮 API 出结果（busy→false）或超时
    const t0 = Date.now();
    while (Date.now() - t0 < watchSec * 1000) {
      const st = await p.evaluate(() => ({
        busy: !document.getElementById('btn-send').disabled,
        cards: Array.from(document.querySelectorAll('.toolcard .tc-head b')).map((x) => x.textContent),
        think: Array.from(document.querySelectorAll('.think-body')).reduce((n, e) => n + e.textContent.length, 0),
        stem: document.querySelectorAll('.stem').length
      }));
      if (!st.busy && (st.stem > 0 || st.cards.length > 0)) {
        console.log('[' + title + '] 完成@' + (Date.now() - t0) / 1000 + 's cards:', st.cards.slice(-4).join(','), 'thinkChars:', st.think, 'stem:', st.stem);
        break;
      }
      await p.waitForTimeout(5000);
    }
    // 等 runReAct 真正结束（btn-send 恢复可点）再清空
    for (let i = 0; i < 40; i++) {
      const busy = await p.evaluate(() => document.getElementById('btn-send').disabled);
      if (!busy) break;
      await p.waitForTimeout(3000);
    }
    await p.evaluate(() => { document.getElementById('btn-clear').click(); });
    await p.waitForTimeout(500);
  };

  await sendOne('文本三角题', '求 sin10°·sin30°·sin50°·sin70° 的值。', 90);
  await sendOne('如图几何题', '如图，F为正方形ABCD边CD上一点，连接AC、AF，延长AF交AC的平行线DE于点E，且AE=AC，连接CE。求证：CE=CF。', 120);
  await b.close();
})();
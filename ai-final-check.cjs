// 端到端：真实题目 → ReAct → 最终讲解正文渲染（Markdown+KaTeX）无异常
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
  await p.goto('http://127.0.0.1:8123/ai/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 50; i++) {
    const r = await p.evaluate(() => !!(window.ggbApplet && typeof window.ggbApplet.getObjectNumber === 'function'));
    if (r) break;
    await p.waitForTimeout(2000);
  }
  await p.evaluate(() => {
    document.getElementById('protocol').value = 'dashscope';
    document.getElementById('baseurl').value = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    document.getElementById('apikey').value = 'sk-REPLACE-WITH-YOUR-KEY';
    document.getElementById('model').value = 'qwen3.5-omni-plus-2026-03-15';
    document.getElementById('apikey').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('model').dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.fill('#input-text', '求 $\\sqrt{18}$ 的精确值，并写出化简过程（讲题稿格式）。');
  await p.click('#btn-send');
  await p.waitForTimeout(70000);
  const r = await p.evaluate(() => {
    const ans = document.querySelector('.answer .a-live');
    const katex = document.querySelectorAll('.answer .katex').length;
    const teachingText = ans ? ans.textContent.slice(0, 100) : '';
    return {
      hasAnswer: !!ans,
      katexN: katex,
      textHead: teachingText,
      sysDone: Array.from(document.querySelectorAll('.msg.sys')).map((d) => d.textContent).filter((t) => t.indexOf('✅ 完成') !== -1).length > 0
    };
  });
  console.log('最终渲染:', JSON.stringify(r));
  console.log('PAGEERRORS:', errs.length ? errs.join(' | ') : '(none)');
  await b.close();
})();

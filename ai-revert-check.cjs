// 撤销图旁面板后验证：面板已删、画布在、prompt 代数式/拖动规则保留、无 pageerror
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await p.goto('http://127.0.0.1:8123/ai/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 50; i++) {
    const r = await p.evaluate(() => !!(window.ggbApplet && typeof window.ggbApplet.getObjectNumber === 'function'));
    if (r) break;
    await p.waitForTimeout(2000);
  }
  const r = await p.evaluate(() => ({
    teachGone: !document.getElementById('teach-wrap'),
    ggbElement: !!document.getElementById('ggb-element'),
    algebraRule: SYSTEM_PROMPT.indexOf('代数式必须上图') !== -1,
    dragRule: SYSTEM_PROMPT.indexOf('可拖动演示') !== -1,
    mathSeg: typeof mathSegments === 'function',
    markdown: typeof renderMarkdownTo === 'function'
  }));
  console.log(JSON.stringify(r));
  console.log('PAGEERRORS:', errs.length ? errs.join(' | ') : '(none)');
  await b.close();
})();

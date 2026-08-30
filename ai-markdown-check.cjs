// 验证最终输出改造：讲解正文 Markdown+KaTeX 渲染、JSON 附注降级、无残留、无 pageerror
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
  const a = await p.evaluate(() => {
    const R = {};
    R.ms1 = mathSegments('设边长 $a$，构建坐标');
    // ① stripFencedJson
    const md = '### 解题思路\n\n设边长 $a$，构建坐标…\n\n```json\n{"answer":"CE=CF","ggb":{"view":{"xmin":-1,"xmax":3}}}\n```\n\n**结论**：$CE=CF$。';
    R.body = stripFencedJson(md);
    R.json = safeExtractJSON(md);
    // ② renderMarkdownTo
    const div = document.createElement('div');
    renderMarkdownTo(div, R.body);
    R.divHtml = div.innerHTML.slice(0, 240);
    R.h3 = !!div.querySelector('h3');
    R.b = !!div.querySelector('b');
    R.mathN = div.querySelectorAll('.math').length;
    R.mdDisplay = !!div.querySelector('.math.md');
    R.noRawJson = div.innerHTML.indexOf('"answer"') === -1;
    R.katexRendered = div.querySelectorAll('.katex').length;
    // ③ renderJsonAppendix（模拟 asst）
    const asst = { answerWrap: div };
    renderJsonAppendix(asst, R.json);
    R.appendix = div.querySelector('.answer-box') ? div.querySelector('.answer-box').textContent.slice(0, 20) : null;
    R.note = div.querySelector('.tip') ? div.querySelector('.tip').textContent.slice(0, 20) : null;
    // ④ 列表/块公式
    const div2 = document.createElement('div');
    renderMarkdownTo(div2, '- 第一步：$a^2+b^2$\n- 第二步：$c^2$\n\n$$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$\n\n然后继续。');
    R.ul = !!div2.querySelector('ul');
    R.liN = div2.querySelectorAll('li').length;
    R.blockMd = !!div2.querySelector('.math.md');
    return R;
  });
  console.log('渲染:', JSON.stringify(a, null, 1));
  console.log('PAGEERRORS:', errs.length ? errs.join(' | ') : '(none)');
  await b.close();
})();

// UI 级验证：图旁讲解面板（不依赖 API）——renderTeachPanel 模拟讲题稿 + 折叠 + KaTeX + prompt 规则存在性
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const p = await b.newPage({ viewport: { width: 1600, height: 950 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
  await p.goto('http://127.0.0.1:8123/ai/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 50; i++) {
    const r = await p.evaluate(() => !!(window.ggbApplet && typeof window.ggbApplet.getObjectNumber === 'function'));
    if (r) break;
    await p.waitForTimeout(2000);
  }
  const r = await p.evaluate(() => {
    const md = '### 解题思路\n\n设边长 $a$，建立坐标系…\n\n- $CE^2 = \\frac{(1-t)^2+(2t-1)^2}{t^2}$\n- 解得 $t=\\sqrt{3}-1$：**CF = (√3−1)·DC**\n\n$$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$\n\n画布读出 $dCE=0.73$，与定理一致 ✓';
    const json = { answer: 'CE=CF 当且仅当 CF=(√3−1)·DC', ggb: { note: '拖动 F 沿 CD 观察：仅在 CF=0.732 处 CE=CF' } };
    renderTeachPanel(md, json);
    const wrap = document.getElementById('teach-wrap');
    const body = document.getElementById('teach-body');
    const shown = wrap.classList.contains('show');
    // 折叠测试
    document.getElementById('teach-fold').click();
    const folded = body.style.display === 'none';
    document.getElementById('teach-fold').click();
    const unfolded = body.style.display !== 'none';
    return {
      shown,
      teachKatex: body.querySelectorAll('.katex').length,
      hasBlockMd: !!body.querySelector('.math.md'),
      hasAnswerBox: !!body.querySelector('.answer-box'),
      hasNote: body.textContent.indexOf('拖动 F') !== -1,
      folded, unfolded,
      ggbVisible: document.getElementById('ggb-element').clientWidth > 200,
      promptHasAlgebraText: SYSTEM_PROMPT.indexOf('代数式必须上图') !== -1,
      promptHasDraggable: SYSTEM_PROMPT.indexOf('可拖动演示') !== -1,
      promptHasPointRule: SYSTEM_PROMPT.indexOf('Point(路径,参数)') !== -1
    };
  });
  console.log('图旁讲解面板:', JSON.stringify(r, null, 1));
  console.log('PAGEERRORS:', errs.length ? errs.join(' | ') : '(none)');
  await b.close();
})();

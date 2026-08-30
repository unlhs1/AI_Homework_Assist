// 重现用户现象：LLM 生成的 Line(D, A+C) → 初始无 DE 线；拖 D 后线出现但不平行
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto('http://127.0.0.1:8123/gg/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  let ready = false;
  for (let i = 0; i < 90; i++) {
    const r = await page.evaluate(() => { const a = window.ggbApplet; return !!(a && typeof a.getObjectNumber === 'function'); });
    if (r) { ready = true; break; }
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(4000);

  // 用用户 AI 生成的 commands（去掉已存在的旧对象，先清空）
  await page.evaluate(() => {
    const a = window.ggbApplet;
    try {
      const names = a.getAllObjectNames();
      for (let i = 0; i < names.length; i++) { try { a.deleteObject(names[i]); } catch (e) {} }
    } catch (e) {}
  });

  const userCmds = [
    'A=(0,4)', 'B=(0,0)', 'C=(4,0)', 'D=(4,4)',
    'poly=Polygon(A,B,C,D)',
    'lineCD=Segment(C,D)',
    'F=Point(lineCD)',
    'lineAC=Line(A,C)',
    'lineDE=Line(D,A+C)',          // ← LLM 坏写法
    'rayAF=Ray(A,F)',
    'E=Intersect(rayAF,lineDE)',
    'segCE=Segment(C,E)',
    'dCE=Distance(C,E)', 'dCF=Distance(C,F)'
  ];
  const log = await page.evaluate((cmds) => {
    const a = window.ggbApplet;
    const out = { cmds: [] };
    cmds.forEach((c) => {
      try { a.evalCommand(c); out.cmds.push({ c, ok: true }); }
      catch (e) { out.cmds.push({ c, ok: false, err: String(e).slice(0, 80) }); }
    });
    const read = (k) => { try { return a.getValueString(k); } catch (e) { return 'ERR'; } };
    out.lineDE_def = (() => { try { return a.getDefinitionString('lineDE'); } catch (e) { return 'ERR'; } })();
    out.vals = { lineDE: read('lineDE'), E: read('E'), segCE: read('segCE'), dCE: read('dCE'), dCF: read('dCF') };
    return out;
  }, userCmds);
  console.log('=== 初始（LLM 坏写法）===');
  console.log(JSON.stringify(log, null, 1));

  // 拖动 D：D(4,4)→(5,4)，观察 lineDE
  const move = await page.evaluate(() => {
    const a = window.ggbApplet;
    try { a.evalCommand('SetCoords(D, 5, 4)'); } catch (e) {}
    return new Promise((r) => setTimeout(() => {
      const read = (k) => { try { return a.getValueString(k); } catch (e) { return 'ERR'; } };
      r({ lineDE: read('lineDE'), E: read('E'), D: read('D'), dCE: read('dCE') });
    }, 800));
  });
  console.log('=== 拖动 D 到 (5,4) 后 ===');
  console.log(JSON.stringify(move, null, 1));

  await browser.close();
})();
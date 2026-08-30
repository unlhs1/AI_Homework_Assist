// 验证：① 多个工具注册（含 scratch_paper/scratch_rollback）② 档案存/查/回滚链路 ③ 页面无报错
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  const bodies = [];
  p.on('request', (req) => { if (/chat\/completions/.test(req.url())) { try { bodies.push(JSON.parse(req.postData() || '{}')); } catch (e) {} } });
  await p.goto('http://127.0.0.1:8123/ai/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 50; i++) {
    const r = await p.evaluate(() => !!(window.ggbApplet && typeof window.ggbApplet.getObjectNumber === 'function'));
    if (r) break;
    await p.waitForTimeout(2000);
  }
  // 直接调用页面全局函数验证档案链路（不经 API 也测引擎）
  const chain = await p.evaluate(() => {
    try {
      scratchClear();
      var n1 = scratchSave('student_calc', '√18', '3√2');
      var n2 = scratchSave('student_solve', 'x^2-2=0', 'x=√2 或 -√2');
      var list = scratchListText();
      var left = scratchRollback(1); // 回滚到第1步，删除第2步
      var list2 = scratchListText();
      return { n1: n1, n2: n2, afterRollback: left, list0: list.split('\n').length, list2: list2, badge: document.getElementById('scratch-badge').textContent };
    } catch (e) { return { error: String(e.message || e) }; }
  });
  console.log('档案链路:', JSON.stringify(chain, null, 1));
  // 抓 tools
  await p.evaluate(() => { document.getElementById('apikey').value = 'sk-test'; document.getElementById('apikey').dispatchEvent(new Event('input', { bubbles: true })); });
  await p.fill('#input-text', '测试');
  await p.click('#btn-send');
  await p.waitForTimeout(6000);
  const last = bodies[bodies.length - 1];
  if (last) console.log('tools:', JSON.stringify((last.tools || []).map((t) => t.function.name)));
  if (errs.length) console.log('PAGEERRORS:', errs.join(' | '));
  await b.close();
})();
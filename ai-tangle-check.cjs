// tangle（矛盾纠结→特定解反推）检测单测 + prompt 更新回归
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
  const bodies = [];
  p.on('request', (req) => { if (/chat\/completions/.test(req.url())) { try { bodies.push(JSON.parse(req.postData() || '{}')); } catch (e) {} } });
  await p.goto('http://127.0.0.1:8123/ai/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 50; i++) {
    const r = await p.evaluate(() => !!(window.ggbApplet && typeof window.ggbApplet.getObjectNumber === 'function'));
    if (r) break;
    await p.waitForTimeout(2000);
  }
  const a = await p.evaluate(() => {
    const T = {};
    // ① 矛盾+纠结 → 触发
    T.t1 = !!auditDecide([], '验证发现 CE 不等于 CF，不成立……让我重新检查一遍题目和条件', false, false, null, {}, null).tangleMsg;
    // ② 本轮已调 student_solve → 豁免
    T.t2 = !auditDecide([{ name: 'student_solve', ok: true, result: 'x=4(√3-1)', cmd: '' }], '不成立？用反推解一下', false, false, null, {}, null).tangleMsg;
    // ③ 含"反推/隐含"（正确路径）→ 豁免
    T.t3 = !auditDecide([], '验证发现一般位置不成立，由结论反推隐含前提 t=4(√3−1)', false, false, null, {}, null).tangleMsg;
    // ④ 不成立但无纠结词（正常陈述）→ 不触发
    T.t4 = !auditDecide([], '当 t=2 时 CE≠CF，仅在 t=4(√3−1) 时成立', false, false, null, {}, null).tangleMsg;
    // ⑤ 纠结但无矛盾 → 不触发
    T.t5 = !auditDecide([], '让我重新读一遍题目，确认 F 在 CD 上', false, false, null, {}, null).tangleMsg;
    // 证据引用内容
    const v = auditDecide([], '验算得 CE=0.745，CF=0.75，两者不相等……奇怪，让我再检查一遍', false, false, null, {}, null);
    T.t6 = v.tangleMsg ? v.tangleMsg.slice(0, 80) : null;
    return T;
  });
  console.log('tangle 单测:', JSON.stringify(a));
  // 回归：system 含新规则
  await p.evaluate(() => {
    document.getElementById('protocol').value = 'dashscope';
    document.getElementById('baseurl').value = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    document.getElementById('apikey').value = 'sk-REPLACE-WITH-YOUR-KEY';
    document.getElementById('model').value = 'qwen3.5-omni-plus-2026-03-15';
    document.getElementById('apikey').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('model').dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.fill('#input-text', '1+1 等于几？直接回答');
  await p.click('#btn-send');
  await p.waitForTimeout(45000);
  const last = bodies.length ? bodies[bodies.length - 1] : null;
  const sys = last && last.messages && String(last.messages[0].content);
  console.log('回归:', JSON.stringify({
    requests: bodies.length,
    hasTools: !!(last && last.tools),
    sysHasDegenerateRule: !!sys && sys.indexOf('定理退化') !== -1,
    sysHasCoordRule: !!sys && sys.indexOf('坐标法') !== -1
  }));
  console.log('PAGEERRORS:', errs.length ? errs.join(' | ') : '(none)');
  await b.close();
})();

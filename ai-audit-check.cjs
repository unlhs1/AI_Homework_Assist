// 验证 DSH 式工具结果呈现 + 执行后审计（4.9 节）：
//  A) 纯函数单测：formatToolResult / extractQueryRefs / updateOpenFailures / auditDecide / calcTraceCheck
//  B) 真实最小流式回归（6 工具、无 pageerror）
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
    const R = {};
    // 1) 结果文本：状态前缀 + 失败引导 + (no output)
    R.f1 = formatToolResult('ggb_eval', { ok: false, result: '命令已执行但对象 B1 未定义（可能依赖对象缺失或语法不支持）：B1 = Intersect(l1, Ellipse)' });
    R.f2 = formatToolResult('student_calc', { ok: false, result: '表达式错误：未识别的符号' });
    R.f3 = formatToolResult('ggb_eval', { ok: true, result: 'OK · A=(0,0)（A 已定义 ✓）' });
    R.f4 = formatToolResult('ggb_query', { ok: true, result: '' });
    R.f5 = formatToolResult('ggb_query', { ok: false, result: '缺少 names 参数' });
    // 2) 引用提取
    R.q = extractQueryRefs('A=(0,0)；dAB=2.941；e1=(2, 3)；角ABC=45°');
    // 3) 计算痕迹：命中/误报控制
    R.c1 = calcTraceCheck('设 a=1，则 CF=√3-1 ≈ 0.732');       // true：≈/√
    R.c2 = calcTraceCheck('化简得 x^2+2x=0，代入 x=1 解得…');   // true：化简/代入/解得/^
    R.c3 = calcTraceCheck('由勾股定理得 a²+b²=c²，作垂线构造…'); // false：公式引用不触发
    R.c4 = calcTraceCheck('先构造正方形顶点 A B C D');          // false
    R.c5 = calcTraceCheck('5²=25，所以面积是 25');              // true：数字平方
    // 4) 未修复清单
    R.o1 = updateOpenFailures([], [{ name: 'ggb_eval', ok: false, result: '命令已执行但对象 B1 未定义（…）：B1 = Intersect(l1, Ellipse)', cmd: 'B1 = Intersect(l1, Ellipse)' }]);
    R.o2 = updateOpenFailures(R.o1, [{ name: 'ggb_eval', ok: true, result: 'OK · B2=(1,0)', cmd: 'B2=(1,0)' }]); // B1 仍在
    R.o3 = updateOpenFailures(R.o2, [{ name: 'ggb_query', ok: true, result: 'B1=(1, 2)；B2=(1, 0)' }]);           // B1 已确认存在 → 全清
    R.o4 = updateOpenFailures([], [{ name: 'ggb_query', ok: true, result: 'B1=未定义' }]);                          // 查询确认仍缺失 → 不登记（仅登记 eval 失败）
    // 5) 审计决策
    R.d1 = auditDecide([], '化简得 √3-1 ≈ 0.732 继续', false, false, null);                    // calc 违规
    R.d2 = auditDecide([], '化简得 √3-1 ≈ 0.732 继续', true, false, null);                     // 有草稿纸 → 免
    R.d3 = auditDecide([], '继续验证结论', false, false, { names: ['dAB'], values: ['2.941'] }); // 查询未引用 → 违规
    R.d4 = auditDecide([], '由画布读出 dAB=2.941，与定理一致', false, false, { names: ['dAB'], values: ['2.941'] }); // 已引用 → 免
    R.d5 = auditDecide([], '继续验证', false, true, { names: ['dAB'], values: [] });            // 本轮还在查询 → 免
    R.d6 = auditDecide([], '勾股定理 a²+b²=c²', false, false, null);                           // 公式引用 → 免（误报控制）
    return R;
  });
  console.log('单测:', JSON.stringify(a, null, 1));

  // ── B 真实最小流式回归 ──
  await p.evaluate(() => {
    document.getElementById('protocol').value = 'dashscope';
    document.getElementById('baseurl').value = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    document.getElementById('apikey').value = 'sk-REPLACE-WITH-YOUR-KEY';
    document.getElementById('model').value = 'qwen3.5-omni-plus-2026-03-15';
    document.getElementById('protocol').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('apikey').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('model').dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.fill('#input-text', '1+1 等于几？直接回答');
  await p.click('#btn-send');
  await p.waitForTimeout(45000);
  const last = bodies.length ? bodies[bodies.length - 1] : null;
  console.log('回归:', JSON.stringify({
    requests: bodies.length,
    hasTools: !!(last && last.tools && last.tools.length),
    msgCount: last && last.messages ? last.messages.length : null,
    sysHasNewRule: last && last.messages && String(last.messages[0].content).indexOf('工具结果是证据') !== -1
  }));
  console.log('PAGEERRORS:', errs.length ? errs.join(' | ') : '(none)');
  await b.close();
})();

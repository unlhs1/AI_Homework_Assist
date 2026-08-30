// 验证：DSH 式思考链回传 —— ① assistant 消息保留 content + reasoning_content ② qwen 兼容（400 降级）
// ③ 重复定义/缺边裁决单测 ④ 图片不重复发送
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

  // A) 纯函数单测
  const a = await p.evaluate(() => {
    const R = {};
    R.h1 = hasReasoningInMessages([{ role: 'assistant', content: 'x', reasoning_content: 'think' }]);
    R.h2 = hasReasoningInMessages([{ role: 'assistant', content: 'x' }]);
    R.s1 = stripReasoningFromMessages([{ role: 'assistant', content: 'x', reasoning_content: 't' }, { role: 'user', content: 'u' }]);
    // 重复定义：definedObjects 已有 A → 本轮再定义 A → redunMsg
    const rd = [{ name: 'ggb_eval', ok: true, result: 'OK · A=(0,4)', cmd: 'A=(0,4)' }];
    const v1 = auditDecide(rd, '继续验证', false, false, null, { A: true }, null);
    R.redun = v1.redunMsg ? v1.redunMsg.slice(0, 60) : null;
    // 缺边：快照 pts=4 sides=0 polys=0 + 本轮有成功构造 → canvasMsg
    const v2 = auditDecide([{ name: 'ggb_eval', ok: true, result: 'OK', cmd: 'D=(4,4)' }], '继续', false, false, null, { A: true, B: true, C: true, D: true }, { pts: 4, sides: 0, polys: 0 });
    R.canvas = v2.canvasMsg ? v2.canvasMsg.slice(0, 60) : null;
    // 已有边 → 不触发
    const v3 = auditDecide([{ name: 'ggb_eval', ok: true, result: 'OK', cmd: 'A=(0,4)' }], '继续', false, false, null, {}, { pts: 4, sides: 4, polys: 1 });
    R.noCanvas = !v3.canvasMsg && !v3.redunMsg;
    // 首定义（definedObjects 里没有）→ 不报重复
    const v4 = auditDecide([{ name: 'ggb_eval', ok: true, result: 'OK', cmd: 'A=(0,4)' }], '继续', false, false, null, {}, null);
    R.noRedun = !v4.redunMsg;
    return R;
  });
  console.log('A 单测:', JSON.stringify(a));

  // B) 真实流式：必须调工具的题 → 第二轮请求应带 assistant(reasoning_content+content)
  await p.evaluate(() => {
    document.getElementById('protocol').value = 'dashscope';
    document.getElementById('baseurl').value = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    document.getElementById('apikey').value = 'sk-REPLACE-WITH-YOUR-KEY';
    document.getElementById('model').value = 'qwen3.5-omni-plus-2026-03-15';
    document.getElementById('apikey').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('model').dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.fill('#input-text', '请用 ggb_eval 在画布上构造点 A=(1,2) 和点 B=(3,4)，然后 ggb_query 读 A 的坐标并告诉我结果。');
  await p.click('#btn-send');
  await p.waitForTimeout(80000);
  const info = bodies.map((bd, i) => {
    const asstMsgs = (bd.messages || []).filter((m) => m.role === 'assistant');
    return {
      i,
      nAsst: asstMsgs.length,
      asstWithReasoning: asstMsgs.map((m) => (m.reasoning_content ? 'R' : '-')).join(''),
      asstContentLen: asstMsgs.map((m) => (m.content ? m.content.length : 0)).join(','),
      imageCount: JSON.stringify(bd.messages || []).split('image_url').length - 1
    };
  });
  console.log('B 请求序列:', JSON.stringify(info));
  console.log('PAGEERRORS:', errs.length ? errs.join(' | ') : '(none)');
  await b.close();
})();

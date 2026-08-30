// 验证 DSH 式会话管理（照搬 dsh-compaction-basic）：
//  A) 无 API 单元：范围选择不拆 tool 对 / 工具结果修剪 / 模拟压缩替换 / 收敛校验拒收
//  B) 真实 API：compactSession 真调用（百炼）+ 页面最小真实流式（回归 streamChat 接线）
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

  // ── A1 范围选择 + 修剪（合成对话，形状与真实循环一致）──
  const a1 = await p.evaluate(() => {
    function fakeConv(rounds) {
      const msgs = [{ role: 'system', content: 'sys' },
        { role: 'user', content: [{ type: 'text', text: '题目：如图，正方形ABCD…' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,TOPICS' } }] }];
      for (let r = 0; r < rounds; r++) {
        msgs.push({ role: 'assistant', content: null, tool_calls: [{ id: 'call_' + r, type: 'function', function: { name: 'ggb_eval', arguments: '{"cmds":["A=(0,0)","B=(1,0)"]}' } }, { id: 'call2_' + r, type: 'function', function: { name: 'ggb_query', arguments: '{"names":"A","mode":"value"}' } }] });
        msgs.push({ role: 'tool', tool_call_id: 'call_' + r, content: '{"ok":true,"out":["A=(0,0)","B=(1,0)"]}' });
        msgs.push({ role: 'tool', tool_call_id: 'call2_' + r, content: '{"ok":true,"out":{"A":"(0, 0)"}}' });
        msgs.push({ role: 'assistant', content: '第' + r + '轮：构造完成，验证 d 是否等于 √5。' });
        msgs.push({ role: 'user', content: [{ type: 'text', text: '继续：用草稿纸 student_calc 精确化简后继续推导。' }] });
      }
      return msgs;
    }
    // 造一条超长工具结果验证修剪
    const big = fakeConv(2);
    big.push({ role: 'tool', tool_call_id: 'big', content: 'x'.repeat(30000) + '尾标记END' });
    const pruned = pruneSessionToolResults(big);
    const prunedMsg = pruned && pruned.msgs[pruned.msgs.length - 1];
    // 范围选择：retainTokens 中值 + retain 0（溢出场景）
    const conv = fakeConv(30);
    const selMid = selectCompactableRange(conv, 1600);
    const selZero = selectCompactableRange(conv, 0);
    return {
      total: estTokens(conv),
      pinIdx: pinnedUserIdx(conv),
      selMid: selMid ? { head: selMid.head, keepFrom: selMid.keepFrom, shadowed: selMid.shadowed.length } : null,
      midSplitsTool: selMid ? conv[selMid.keepFrom].role === 'tool' : null,
      selZero: selZero ? { head: selZero.head, keepFrom: selZero.keepFrom, shadowed: selZero.shadowed.length } : null,
      zeroSplitsTool: selZero ? conv[selZero.keepFrom].role === 'tool' : null,
      pruned: pruned ? { count: pruned.pruned, savedChars: pruned.savedChars, newLen: prunedMsg.content.length, hasMarker: prunedMsg.content.includes('middle pruned'), headOK: prunedMsg.content.startsWith('x'.repeat(4096)), tailOK: prunedMsg.content.endsWith('尾标记END') } : null,
      // JSON 感知修剪：大字符串字段被修剪但仍是合法 JSON
      jsonPrune: (function () {
        const m = { role: 'tool', tool_call_id: 'j', content: JSON.stringify({ ok: true, out: 'y'.repeat(20000), num: 42 }) };
        const pr = pruneToolResultMsg(m);
        if (!pr) return null;
        const parsed = JSON.parse(pr.content);
        return { valid: true, outLen: parsed.out.length, num: parsed.num, hasMarker: parsed.out.includes('middle pruned') };
      })()
    };
  });
  console.log('A1 选择/修剪:', JSON.stringify(a1, null, 1));

  // ── A2 模拟摘要：完整压缩事务替换 + 收敛校验拒收 ──
  const a2 = await p.evaluate(async () => {
    window.__origSummarize = window.summarizeForCompaction;
    const conv = (function () {
      const msgs = [{ role: 'system', content: 'sys' }, { role: 'user', content: [{ type: 'text', text: '题' }] }];
      for (let r = 0; r < 30; r++) {
        msgs.push({ role: 'assistant', content: null, tool_calls: [{ id: 'c' + r, type: 'function', function: { name: 'ggb_eval', arguments: '{}' } }] });
        msgs.push({ role: 'tool', tool_call_id: 'c' + r, content: '{"ok":true}' });
        msgs.push({ role: 'assistant', content: '第' + r + '轮思考内容，包含若干几何推理文字。' });
        msgs.push({ role: 'user', content: [{ type: 'text', text: '继续' }] });
      }
      return msgs;
    })();
    const chkText = '## 主要请求与意图 Primary Request and Intent\n- 证明 CE=CF\n\n## 关键技术概念 Key Technical Concepts\n- 全等/相似定理链\n\n## 当前工作 Current Work\n- 已构造正方形复刻\n\n## 关键上下文 Critical Context\n- 隐藏条件 AE=AC 由结论反推';
    window.summarizeForCompaction = async function (msgs, sel) { return chkText; };
    const beforeLen = conv.length;
    const stat = await compactSession(conv, 4500);
    const chkMsg = stat.msgs[2];
    return {
      totalBefore: estTokens(conv),
      beforeLen,
      afterLen: stat.msgs.length,
      shadowed: stat.shadowed,
      replacedByOne: stat.msgs.length === beforeLen - stat.shadowed + 1,
      checkpointRole: chkMsg && chkMsg.role,
      checkpointHasTag: chkMsg && chkMsg.content[0].text.includes('<compacted-summary>'),
      checkpointHasPreamble: chkMsg && chkMsg.content[0].text.includes('automatically generated checkpoint'),
      chkTokens: stat.chkTokens,
      shadowedTokens: stat.shadowedTokens,
      totalAfter: estTokens(stat.msgs)
    };
  });
  console.log('A2 模拟压缩:', JSON.stringify(a2, null, 1));

  const a3 = await p.evaluate(async () => {
    const conv = [{ role: 'system', content: 'sys' }, { role: 'user', content: '题' }];
    for (let r = 0; r < 10; r++) {
      conv.push({ role: 'assistant', content: null, tool_calls: [{ id: 'c' + r, type: 'function', function: { name: 'ggb_eval', arguments: '{}' } }] });
      conv.push({ role: 'tool', tool_call_id: 'c' + r, content: '{"ok":true}' });
    }
    window.summarizeForCompaction = async function () { return 'x'.repeat(200000); };
    try { await compactSession(conv, 1000); return "NO-THROW"; } catch (e) { return String(e.message || e).slice(0, 100); }
  });
  console.log('A3 收敛校验:', JSON.stringify(a3));

  // ── B1 真实 API：compactSession（百炼免费额度，小预算 30000 → 阈值 24000）──
  await p.evaluate(() => {
    document.getElementById('protocol').value = 'dashscope';
    document.getElementById('baseurl').value = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    document.getElementById('apikey').value = 'sk-REPLACE-WITH-YOUR-KEY';
    document.getElementById('model').value = 'qwen3.5-omni-plus-2026-03-15';
    document.getElementById('protocol').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('baseurl').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('apikey').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('model').dispatchEvent(new Event('input', { bubbles: true }));
  });
  const b1 = await p.evaluate(async () => {
    window.summarizeForCompaction = window.__origSummarize;
    const conv = [{ role: 'system', content: '你是数学教师助手，按题目要求解题。' }, { role: 'user', content: [{ type: 'text', text: '如图，正方形ABCD，F为CD上一点，连接AC、AF，延长AF交DE（AC的平行线）于点E。求证 CE=CF。' }] }];
    for (let r = 0; r < 60; r++) {
      conv.push({ role: 'assistant', content: null, tool_calls: [{ id: 'c' + r, type: 'function', function: { name: 'ggb_eval', arguments: '{"cmds":["A=(0,0)","B=(1,0)"]}' } }] });
      conv.push({ role: 'tool', tool_call_id: 'c' + r, content: '{"ok":true,"out":["A=(0,0)","B=(1,0)"]}' });
      conv.push({ role: 'assistant', content: '第' + r + '轮：我继续用画布验证距离与角度，采用定理链证明。' });
      conv.push({ role: 'user', content: [{ type: 'text', text: '继续推进：构造→查询→用 student_calc/student_solve 精确计算→定理链证明。' }] });
    }
    const beforeTotal = estTokens(conv);
    const beforeLen = conv.length;
    try {
      const stat = await compactSession(conv, 20000);
      const chk = stat.msgs[2];
      const chkText = chk && chk.content && chk.content[0] && chk.content[0].text || '';
      return {
        ok: true,
        beforeTotal, beforeLen,
        afterLen: stat.msgs.length,
        shadowed: stat.shadowed,
        totalAfter: estTokens(stat.msgs),
        threshold: 16000,
        chkTokens: stat.chkTokens,
        settledBelow: estTokens(stat.msgs) < 24000,
        chkHead: chkText.slice(0, 220),
        chkSections: (chkText.match(/#{2,3} [^\n]+/g) || []).slice(0, 12),
        tailKept: stat.msgs[stat.msgs.length - 1].role
      };
    } catch (e) {
      return { ok: false, error: String(e.message || e).slice(0, 300), beforeTotal, beforeLen };
    }
  });
  console.log('B1 真实压缩:', JSON.stringify(b1, null, 1));

  // ── B2 真实最小流式（回归：onRepaired 接线 / 工具 schema / 无 pageerror）──
  bodies.length = 0;
  await p.fill('#input-text', '1+1 等于几？直接回答');
  await p.click('#btn-send');
  await p.waitForTimeout(45000);
  const last = bodies.length ? bodies[bodies.length - 1] : null;
  console.log('B2 最小流式:', JSON.stringify({
    requests: bodies.length,
    hasTools: !!(last && last.tools && last.tools.length),
    toolNames: last && last.tools ? last.tools.map((t) => t.function.name) : null,
    msgCount: last && last.messages ? last.messages.length : null,
    msg0Role: last && last.messages ? last.messages[0].role : null
  }));
  console.log('PAGEERRORS:', errs.length ? errs.join(' | ') : '(none)');
  await b.close();
})();

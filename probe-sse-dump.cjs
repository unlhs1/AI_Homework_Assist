const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const p = await b.newPage();
  await p.goto('http://127.0.0.1:8123/ai/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  const out = await p.evaluate(async () => {
    const key = 'sk-REPLACE-WITH-YOUR-KEY';
    const url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
    const R = {};
    // ① 流式：完整 chunk 结构 dump（顶层 keys、choice keys、delta keys、文本长度）
    const body = {
      model: 'qwen3.5-omni-plus-2026-03-15',
      messages: [{ role: 'user', content: '请先认真思考问题：一个正方形边长是 2，求对角线长度。然后把思路完整写出来。' }],
      max_tokens: 600, stream: true, enable_thinking: true
    };
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body: JSON.stringify(body) });
    const chunks = [];
    let buf = '';
    if (r.ok) {
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n');
        buf = parts.pop();
        for (const line of parts) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const j = JSON.parse(payload);
            const ch = j.choices && j.choices[0];
            const d = (ch && ch.delta) || {};
            const dkeys = Object.keys(d);
            let txt = '';
            if (typeof d.content === 'string') txt = 'content=' + d.content.length;
            if (typeof d.reasoning_content === 'string') txt += '|reasoning=' + d.reasoning_content.length;
            chunks.push({ top: Object.keys(j).join(','), ck: ch ? Object.keys(ch).join(',') : '?', dk: dkeys.join('+'), txt });
          } catch (e) {}
        }
        if (chunks.length > 30) break;
      }
    } else chunks.push({ err: 'HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200) });
    R.streamChunks = chunks.slice(0, 30);
    // ② 非流式：对照
    const r2 = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body: JSON.stringify({ model: 'qwen3.5-omni-plus-2026-03-15', messages: [{ role: 'user', content: '请先认真思考问题：一个正方形边长是 2，求对角线长度。然后把思路完整写出来。' }], max_tokens: 600, stream: false, enable_thinking: true }) });
    if (r2.ok) {
      const j2 = await r2.json();
      const m = j2.choices && j2.choices[0] && j2.choices[0].message || {};
      R.nonStream = {
        keys: Object.keys(m),
        reasoningLen: (m.reasoning_content || '').length,
        contentLen: (m.content || '').length,
        reasoningHead: (m.reasoning_content || '').slice(0, 80),
        contentHead: (m.content || '').slice(0, 80)
      };
    } else R.nonStream = { err: 'HTTP ' + r2.status };
    return R;
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();

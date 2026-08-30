// 决定性：qwen DashScope compatible-mode + tools 的流式 chunk 全量 dump（delta keys + tool_calls 结构 + finish）
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const p = await b.newPage();
  await p.goto('http://127.0.0.1:8123/ai/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  const out = await p.evaluate(async () => {
    const key = 'sk-REPLACE-WITH-YOUR-KEY';
    const url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
    const tools = [{
      type: 'function',
      function: {
        name: 'ggb_eval',
        description: '执行一条 GeoGebra 构造命令',
        parameters: { type: 'object', properties: { command: { type: 'string', description: 'GGB 命令' } }, required: ['command'] }
      }
    }];
    const body = {
      model: 'qwen3.5-omni-plus-2026-03-15',
      messages: [{ role: 'user', content: '请先用 ggb_eval 构造点 A=(0,2)，告诉我结果。' }],
      max_tokens: 500, stream: true, tools, tool_choice: 'auto', enable_thinking: true
    };
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body: JSON.stringify(body) });
    const chunks = [];
    let buf = '';
    if (r.ok) {
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let count = 0;
      while (count < 40) {
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
            const tcs = d.tool_calls;
            chunks.push({
              fr: ch && ch.finish_reason ? ch.finish_reason : undefined,
              c: typeof d.content === 'string' && d.content.length ? d.content.length : 0,
              tc: tcs ? tcs.map((t) => ({
                idx: t.index,
                id: t.id ? String(t.id).slice(0, 10) : undefined,
                fn: t.function ? Object.keys(t.function).join('+') : undefined,
                argsLen: t.function && typeof t.function.arguments === 'string' ? t.function.arguments.length : undefined,
                argsHead: t.function && typeof t.function.arguments === 'string' ? t.function.arguments.slice(0, 30) : undefined
              })) : undefined
            });
            count++;
          } catch (e) {}
        }
        if (count >= 40) break;
      }
    } else chunks.push({ err: 'HTTP ' + r.status + ' ' + (await r.text()).slice(0, 300) });
    return chunks;
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();

// 验证思考强度作为 API 层参数真实进入请求体（off/max 两档），且 API 正常接受
const { chromium } = require('playwright-core');
const K = 'sk-REPLACE-WITH-YOUR-KEY';
(async () => {
  const b = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  const bodies = [];
  p.on('request', (req) => { if (/chat\/completions/.test(req.url())) { try { bodies.push(JSON.parse(req.postData() || '{}')); } catch (e) {} } });
  await p.goto('http://127.0.0.1:8123/ai/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 50; i++) {
    const r = await p.evaluate(() => !!(window.ggbApplet && typeof window.ggbApplet.getObjectNumber === 'function'));
    if (r) break;
    await p.waitForTimeout(2000);
  }
  await p.evaluate((k) => {
    document.getElementById('protocol').value = 'dashscope';
    document.getElementById('baseurl').value = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    document.getElementById('model').value = 'qwen3.5-omni-plus-2026-03-15';
    document.getElementById('apikey').value = k;
    ['protocol','baseurl','model','apikey'].forEach((id) => document.getElementById(id).dispatchEvent(new Event('input', { bubbles: true })));
    document.getElementById('stage-apikey').value = k;
    document.getElementById('stage-apikey').dispatchEvent(new Event('input', { bubbles: true }));
  }, K);
  // off 档
  await p.evaluate(() => { document.getElementById('think-strength').value = 'off'; document.getElementById('think-strength').dispatchEvent(new Event('change', { bubbles: true })); });
  await p.fill('#input-text', '1+1');
  await p.click('#btn-send');
  await p.waitForTimeout(8000);
  const offBody = bodies.find((x) => x.reasoning_effort);
  console.log('off 档请求体:', offBody ? JSON.stringify({ effort: offBody.reasoning_effort, eThinking: offBody.enable_thinking, maxTokens: offBody.max_tokens }) : '(未抓到)');
  // max 档
  for (let i = 0; i < 30; i++) { const busy = await p.evaluate(() => document.getElementById('btn-send').disabled); if (!busy) break; await p.waitForTimeout(2000); }
  await p.evaluate(() => { document.getElementById('think-strength').value = 'max'; document.getElementById('think-strength').dispatchEvent(new Event('change', { bubbles: true })); });
  await p.fill('#input-text', '2+2');
  await p.click('#btn-send');
  await p.waitForTimeout(8000);
  const maxBody = bodies.filter((x) => x.reasoning_effort === 'high').pop();
  console.log('max 档请求体:', maxBody ? JSON.stringify({ effort: maxBody.reasoning_effort, eThinking: maxBody.enable_thinking, maxTokens: maxBody.max_tokens }) : '(未抓到)');
  await b.close();
})();
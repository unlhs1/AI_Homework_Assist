// 验证：删视觉转录层后 —— ① 带图时 buildUserContent 直传 image_url ② 页面无 pageerror ③ 最小流式回归
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
  const u = await p.evaluate(() => {
    const noImg = buildUserContent('测试题目');
    globalThis.currentImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const withImg = buildUserContent('如图，正方形ABCD…');
    return {
      noImgParts: noImg.map((x) => x.type),
      noImgText: noImg[0].text,
      withImgTypes: withImg.map((x) => x.type),
      withImgFirstIsImage: withImg[0].type === 'image_url',
      withImgTextHasImage: withImg[1] && withImg[1].text.indexOf('如图') !== -1,
      transcriptFnGone: typeof window.transcribeFigure === 'undefined'
    };
  });
  console.log('消息结构:', JSON.stringify(u));
  // 真实最小流式回归（无图）
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
  console.log('回归:', JSON.stringify({ requests: bodies.length, hasTools: !!(last && last.tools), msg0: last && last.messages && last.messages[0].role }));
  console.log('PAGEERRORS:', errs.length ? errs.join(' | ') : '(none)');
  await b.close();
})();

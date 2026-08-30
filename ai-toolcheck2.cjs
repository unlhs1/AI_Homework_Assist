// 抓页面真正发给 API 的请求体：确认 tools 数组是否包含 student_calc / student_solve
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
  });
  const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  const bodies = [];
  p.on('request', (req) => {
    if (/chat\/completions/.test(req.url())) {
      try { bodies.push(JSON.parse(req.postData() || '{}')); } catch (e) {}
    }
  });
  await p.goto('http://127.0.0.1:8123/ai/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 50; i++) {
    const r = await p.evaluate(() => !!(window.ggbApplet && typeof window.ggbApplet.getObjectNumber === 'function'));
    if (r) break;
    await p.waitForTimeout(2000);
  }
  // 用假 key 触发一次请求（会失败但能抓到 tools 定义）
  await p.evaluate(() => {
    document.getElementById('apikey').value = 'sk-test-dummy';
    document.getElementById('apikey').dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.fill('#input-text', '测试题');
  await p.click('#btn-send');
  await p.waitForTimeout(6000);
  const last = bodies[bodies.length - 1];
  if (last) {
    const tools = (last.tools || []).map((t) => t.function.name);
    console.log('请求数:', bodies.length);
    console.log('发给 API 的 tools:', JSON.stringify(tools));
    console.log('student_calc 在 tools 里?', tools.includes('student_calc'));
    console.log('student_solve 在 tools 里?', tools.includes('student_solve'));
  } else {
    console.log('未抓到请求体（可能分类先失败或仍在思考）');
  }
  await b.close();
})();
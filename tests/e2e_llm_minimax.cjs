// MiniMax-M2.5 live 联调：第17题四棱锥全链路（poly建体+顶点字母+辅助线+shot 出图）
// key 从环境变量 DASHSCOPE_KEY 读取，本文件不含 key 可安全入库
const path = require('path');
const fs = require('fs');
const { chromium } = require('E:/Applications/Claude_Code/logs/_e2etest/node_modules/playwright-core');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'http://127.0.0.1:8123/ai/index.html';
const KEY = process.env.DASHSCOPE_KEY || '';
const MODEL = process.env.E2E_MODEL || 'MiniMax-M2.5';
const MAXMIN = parseInt(process.env.E2E_MAXMIN || '9', 10); // 轮询上限（分钟）：慢推理模型调大，如 E2E_MAXMIN=18
const OUT = path.join(__dirname, 'out');
const Q17 = '如图，四棱锥 P-ABCD 中，PA⊥底面 ABCD，PA=AC=2，BC=1，AB=√3。(1) 证明：AD⊥PB 时 AD∥平面PBC；(2) 若 AD⊥DC，且二面角 A-CP-D 的正弦值为 √42/7，求 AD。';

(async () => {
  if (!KEY) { console.log('FATAL: 未设置 DASHSCOPE_KEY'); process.exit(2); }
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1380, height: 940 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2500);
  // 配置：DashScope + MiniMax-M2.5（fill 触发 input 事件 → saveConfig 落 localStorage）
  await page.fill('#baseurl', 'https://dashscope.aliyuncs.com/compatible-mode/v1');
  await page.fill('#apikey', KEY);
  await page.fill('#model', MODEL);
  await page.selectOption('#think-strength', 'low');
  await page.fill('#input-text', Q17);
  await page.click('#btn-send');
  console.log('Q17 sent → ' + MODEL + ', waiting ReAct loop...');
  const t0 = Date.now();
  let finished = false;
  while (Date.now() - t0 < MAXMIN * 60 * 1000) {
    await page.waitForTimeout(5000);
    const st = await page.evaluate(() => ({
      running: document.getElementById('btn-stop').style.display !== 'none',
      imgs: document.querySelectorAll('#chat-scroll img.m-img').length,
      tools: document.querySelectorAll('.toolcard').length
    }));
    process.stdout.write('  [' + Math.round((Date.now() - t0) / 1000) + 's] tools=' + st.tools + ' imgs=' + st.imgs + (st.running ? ' running' : ' idle') + '\n');
    if (!st.running && (st.tools > 0 || Date.now() - t0 > 60000)) { finished = true; break; }
  }
  console.log('finished=' + finished + ' elapsed=' + Math.round((Date.now() - t0) / 1000) + 's');
  const res = await page.evaluate(() => {
    const cards = document.querySelectorAll('.toolcard');
    const imgs = document.querySelectorAll('#chat-scroll img.m-img');
    const blocks = [...document.querySelectorAll('#chat-scroll .msg.assistant')];
    return {
      fig: window.__geo3dFigure || 0,
      imgLast: imgs.length ? imgs[imgs.length - 1].src.slice(0, 22) : null,
      tools: [...cards].map(c => (c.querySelector('.tc-head b') || {}).textContent || '?').slice(0, 40),
      peeks: [...cards].filter(c => { const a = c.querySelector('.tc-args'); return a && a.textContent.indexOf('"peek"') >= 0; }).length,
      tail: blocks.length ? blocks[blocks.length - 1].textContent.replace(/\s+/g, ' ').slice(-500) : '(none)'
    };
  });
  console.log('geo3dFigure=' + res.fig);
  console.log('lastImg=' + res.imgLast);
  console.log('tools(' + res.tools.length + ')=' + JSON.stringify(res.tools));
  console.log('peekCalls=' + (res.peeks || 0));
  console.log('TAIL: ' + res.tail);
  if (res.imgLast && res.imgLast.startsWith('data:image')) {
    const dataUrl = await page.evaluate(() => {
      const imgs = document.querySelectorAll('#chat-scroll img.m-img');
      return imgs.length ? imgs[imgs.length - 1].src : null;
    });
    fs.writeFileSync(path.join(OUT, 'llm_q17_geo3d.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log('SAVED tests/out/llm_q17_geo3d.png');
  }
  if (errors.length) { console.log('PAGE ERRORS:'); errors.slice(0, 6).forEach(e => console.log('  ' + e)); }
  await browser.close();
  process.exit(res.fig ? 0 : 1);
})().catch(e => { console.error('crash: ' + e.message); process.exit(3); });

// geo3d v2 浏览器 E2E：headless Edge 真实渲染，验证 bug 修复/教材风/顶点标签/辅助元素/shot 出图
const path = require('path');
const fs = require('fs');
const { chromium } = require('E:/Applications/Claude_Code/logs/_e2etest/node_modules/playwright-core');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'http://127.0.0.1:8123/ai/index.html';
const OUT = path.join(__dirname, 'out');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1380, height: 940 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2500); // 等 GeoGebra/geo3d 脚本就绪

  const hasTool = await page.evaluate(() => typeof window.runGGBTool === 'function');
  console.log('runGGBTool available:', hasTool);
  if (!hasTool) { console.log('FATAL: runGGBTool 不存在'); await browser.close(); process.exit(2); }

  async function call(args) {
    return await page.evaluate(([n, a]) => window.runGGBTool(n, a), ['geo3d', typeof args === 'string' ? args : JSON.stringify(args)]);
  }
  async function doShot() { const r = await call({ action: 'shot' }); return !!(r && r.ok === true); }
  async function lastShot(name) {
    await page.waitForTimeout(900);
    const src = await page.evaluate(() => {
      const imgs = document.querySelectorAll('#chat-scroll img.m-img');
      return imgs.length ? imgs[imgs.length - 1].src : null;
    });
    if (!src || !src.startsWith('data:image')) { console.log('SHOT FAIL ' + name); return false; }
    fs.writeFileSync(path.join(OUT, name), Buffer.from(src.split(',')[1], 'base64'));
    console.log('SHOT OK ' + name + ' (' + Math.round(src.length / 1365) + 'KB approx)');
    return true;
  }

  let pass = 0, fail = 0;
  const T = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? '  | ' + String(d).slice(0, 80) : '')); };

  // T1 bug 现场：双重序列化的 verts/faces（第17题四棱锥，教材素净风）
  const v17 = [{ n: 'A', p: [0, 0, 0] }, { n: 'B', p: [1.5, 0.866, 0] }, { n: 'C', p: [2, 0, 0] }, { n: 'D', p: [1.5, -0.866, 0] }, { n: 'P', p: [0, 0, 2] }];
  const f17 = [['A', 'B', 'C', 'D'], ['P', 'A', 'B'], ['P', 'B', 'C'], ['P', 'C', 'D'], ['P', 'D', 'A']];
  const r1 = await call({ action: 'solid', kind: 'poly', verts: JSON.stringify(v17), faces: JSON.stringify(f17) });
  T('T1 double-stringified poly ok', r1 && r1.ok === true, r1 && r1.result);
  T('T1b shot', (await doShot()) && await lastShot('01_poly_textbook.png'));

  // T2 辅助元素：虚线棱 PD + 实线高 PO + 点标注
  const r2 = await call({ action: 'add', kind: 'segment', from: JSON.stringify([1.5, -0.866, 0]), to: JSON.stringify([0, 0, 2]), dashed: true, label: 'PD' });
  T('T2a add dashed PD', r2 && r2.ok === true, r2 && r2.result);
  const r3 = await call({ action: 'add', kind: 'segment', from: JSON.stringify([0, 0, 0]), to: JSON.stringify([0, 0, 2]), label: 'PA' });
  T('T2b add segment PA', r3 && r3.ok === true, r3 && r3.result);
  const r4 = await call({ action: 'add', kind: 'point', p: JSON.stringify([1.5, 0, 0]), label: 'H' });
  T('T2c add point H', r4 && r4.ok === true, r4 && r4.result);
  T('T2d shot with helpers', (await doShot()) && await lastShot('02_poly_helpers.png'));

  // T3 可选上色：palette 显式传入 → 低饱和教材色
  const r5 = await call({ action: 'solid', kind: 'poly', verts: v17, faces: [{ v: ['A', 'B', 'C', 'D'], name: '底面', color: '#aecbe8' }, { v: ['P', 'A', 'B'], name: 'PAB' }, { v: ['P', 'B', 'C'], name: 'PBC' }, { v: ['P', 'C', 'D'], name: 'PCD' }, { v: ['P', 'D', 'A'], name: 'PDA' }] });
  T('T3 colored poly ok', r5 && r5.ok === true, r5 && r5.result);
  T('T3b shot colored', (await doShot()) && await lastShot('03_poly_colored.png'));

  // T4 cube 六色（三视图题模式不回归）
  const r6 = await call({ action: 'solid', kind: 'cube', top: '白', right: '绿', front: '黑' });
  T('T4 cube six-color ok', r6 && r6.ok === true && /顶=白/.test(r6.result), r6 && r6.result);
  T('T4b shot cube', (await doShot()) && await lastShot('04_cube_colors.png'));

  // T7 peek 自查图：渲染当前画面回传给模型（不发进会话）——AI 看图修正细节用
  const imgsBefore7 = await page.evaluate(() => document.querySelectorAll('#chat-scroll img.m-img').length);
  const r8 = await call({ action: 'peek' });
  const peekImg = await page.evaluate(() => window.__geo3dPeekImage || null);
  T('T7a peek returns image', r8 && r8.ok === true && !!peekImg && /^data:image\/(jpeg|png)/.test(peekImg), r8 && r8.result);
  const imgsAfter7 = await page.evaluate(() => document.querySelectorAll('#chat-scroll img.m-img').length);
  T('T7b peek not posted to chat', imgsAfter7 === imgsBefore7, 'imgs ' + imgsBefore7 + '→' + imgsAfter7);

  // T7c/d peek 硬门禁：gate 开启时未 peek 的 shot 被拦（不出图），peek 后放行
  await page.evaluate(() => { window.__geo3dPeekGate = true; window.__geo3dPeekDone = false; window.__geo3dPeekImage = null; });
  const rGate = await call({ action: 'shot' });
  const gateImgs0 = await page.evaluate(() => document.querySelectorAll('#chat-scroll img.m-img').length);
  T('T7c gate blocks shot before peek', rGate && /peek/.test(String(rGate.result || '')), rGate && rGate.result);
  await call({ action: 'peek' });
  const rGate2 = await call({ action: 'shot' });
  const gateImgs1 = await page.evaluate(() => document.querySelectorAll('#chat-scroll img.m-img').length);
  T('T7d shot passes after peek', rGate2 && rGate2.ok === true && gateImgs1 === gateImgs0 + 1, 'imgs ' + gateImgs0 + '→' + gateImgs1);
  await page.evaluate(() => { window.__geo3dPeekGate = false; window.__geo3dPeekImage = null; }); // 清理，避免影响后续用例

  // T5 清理
  const r7 = await call({ action: 'clear' });
  T('T5 clear ok', r7 && r7.ok === true, r7 && r7.result);

  const figN = await page.evaluate(() => window.__geo3dFigure);
  T('T6 __geo3dFigure flag', figN === 1);

  console.log('\n== e2e geo3d v2: ' + pass + ' pass / ' + fail + ' fail ==');
  if (errors.length) { console.log('PAGE ERRORS:'); errors.slice(0, 8).forEach(e => console.log('  ' + e)); }
  else console.log('PAGE ERRORS: none');
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error('E2E crash:', e.message); process.exit(3); });

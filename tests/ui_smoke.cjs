// UI 交互 smoke：headless Edge 真实点击——全部可见 button 轮点、设置面板开合、输入/下拉可用性、脚本存活金丝雀
// 背景：09-07 单引号炸 script 后所有按钮都是死的（不止设置按钮），语法检查抓不到运行期交互问题 → 本文件补交互层
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
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push({ msg: e.message, stack: String(e.stack || '') }));

  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2500); // 等 GeoGebra/geo3d 脚本就绪

  let pass = 0, fail = 0;
  const T = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? '  | ' + String(d).slice(0, 100) : '')); };
  const alive = () => page.evaluate(() => typeof window.runGGBTool === 'function' && (1 + 1) === 2);

  // T1 页面加载 + 脚本存活金丝雀（09-07 事故：script 炸 → 所有按钮死）
  T('T1 load & script alive canary', await alive());

  // T2 交互控件清单
  const inv = await page.evaluate(() => ({
    buttons: [...document.querySelectorAll('button')].length,
    selects: [...document.querySelectorAll('select')].length,
    inputs: [...document.querySelectorAll('input')].length,
    textareas: [...document.querySelectorAll('textarea')].length,
    btnTexts: [...document.querySelectorAll('button')].map(b => (b.innerText || b.title || b.id || '?').replace(/\s+/g, ' ').slice(0, 20)).slice(0, 40)
  }));
  console.log('controls:', JSON.stringify(inv));
  T('T2 enough interactive controls', inv.buttons >= 6 && (inv.selects + inv.inputs + inv.textareas) >= 1, 'buttons=' + inv.buttons);

  // T3 全部可见 button 轮点：每次点击后金丝雀，任何未捕获异常即判负
  const before = pageErrors.length;
  const handles = await page.$$('button');
  let clicked = 0, skipped = 0;
  for (let i = 0; i < handles.length; i++) {
    const h = handles[i];
    const vis = await h.isVisible().catch(() => false);
    const en = await h.isEnabled().catch(() => false);
    if (!vis || !en) { skipped++; continue; }
    const txt = ((await h.textContent().catch(() => '')) || '');
    try { await h.click({ timeout: 1500 }); clicked++; } catch (e) { skipped++; continue; }
    // 载入内置演示会异步初始化 GeoGebra 3D（web3d-0.js）：220ms 快节奏轮点撞进初始化窗口会触发引擎内部偶发 TypeError(reading 'i')，与业务代码无关 → 点演示按钮后多等
    await page.waitForTimeout(/演示|demo/i.test(txt) ? 1800 : 220);
    await page.keyboard.press('Escape').catch(() => {}); // 复位抽屉/浮层（页面监听 Esc 关抽屉），避免遮挡后续按钮
    await page.waitForTimeout(250);
    if (!(await alive().catch(() => false))) { T('T3 alive after click #' + i, false); break; }
  }
  const newErrs = pageErrors.slice(before);
  // T3 判定本意：保护业务代码不死（09-07 事故）。第三方引擎内部偶发错误（如 GeoGebra web3d-0.js 在 demo 异步初始化窗口被 220ms 快速轮点+Esc 复位打断 → TypeError reading 'i'，二分定位见 09-09 探针）不判负，降级记录；业务回归由 e2e_geo3d_v2 全链路兜底
  const isOurs = er => /geo3d\.js|index\.html|tests\//.test(er.stack) || !/(web3d-0|three|ggb|\.min\.)/.test(er.stack);
  const bizErrs = newErrs.filter(isOurs);
  const thirdErrs = newErrs.filter(er => !isOurs(er));
  T('T3 click-through ' + clicked + ' buttons alive', bizErrs.length === 0, 'clicked=' + clicked + ' skipped=' + skipped + ' newPageErrors=' + newErrs.length + ' bizErrs=' + bizErrs.length);
  if (bizErrs.length) bizErrs.slice(0, 5).forEach(e => console.log('  BIZ pageerror: ' + e.msg + '\n' + e.stack.split('\n').slice(0, 3).join('\n')));
  if (thirdErrs.length) thirdErrs.slice(0, 5).forEach(e => console.log('  [third-party, non-fatal] ' + e.msg + ' @ ' + (e.stack.split('\n')[1] || '').trim().slice(0, 70)));

  // T4 设置抽屉开合：页面用 .open class + transform 滑入（非 display 切换），按 class+可视宽度判定
  const drawerState = () => page.evaluate(() => {
    const d = document.getElementById('drawer');
    if (!d) return null;
    const r = d.getBoundingClientRect();
    return { open: d.classList.contains('open'), onscreenW: Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0)) };
  });
  await page.keyboard.press('Escape').catch(() => {}); // 确保 T4 从关闭态开始（T3 可能开过抽屉）
  await page.waitForTimeout(300);
  const st0 = await drawerState();
  const setBtn = (await page.$('#btn-gear')) || (await page.$('button:has-text("设置")'));
  if (setBtn && st0) {
    await setBtn.click().catch(() => {});
    await page.waitForTimeout(500);
    const st1 = await drawerState();
    await page.screenshot({ path: path.join(OUT, 'ui_settings_open.png') });
    T('T4a settings drawer opens', !!st1 && st1.open === true && st1.onscreenW > 100, JSON.stringify(st0) + ' -> ' + JSON.stringify(st1));
    const closeBtn = (await page.$('#btn-drawer-close')) || (await page.$('button:has-text("关闭")'));
    if (closeBtn) await closeBtn.click().catch(() => {}); else await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(400);
    const st2 = await drawerState();
    T('T4b settings drawer closes back', !!st2 && st2.open === false, 'open=' + (st2 && st2.open));
  } else {
    T('T4 settings button found', false, 'no #btn-gear/drawer; see T2 btnTexts');
  }

  // T5 聊天输入框输入回环（页面无 textarea，聊天输入是 #input-text <input type=text>）
  const inp = (await page.$('#input-text')) || (await page.$('input[type=text]'));
  if (inp) {
    await inp.fill('测试输入 ABC');
    const v = await inp.inputValue();
    await inp.fill('');
    T('T5 chat input roundtrip', v.indexOf('测试输入') >= 0, 'value="' + v.slice(0, 20) + '"');
  } else T('T5 chat input roundtrip', false, 'no text input found');

  // T6 select 换挡
  const sels = await page.$$('select');
  let selOk = sels.length > 0, selDetail = 'selects=' + sels.length;
  for (const s of sels) {
    const opts = await s.$$('option');
    if (opts.length < 2) { selOk = false; selDetail += ' (thin options)'; continue; }
    const v0 = await s.inputValue();
    await s.selectOption({ index: 1 });
    const v1 = await s.inputValue();
    await s.selectOption({ index: 0 }).catch(() => {});
    if (v1 === v0 && opts.length > 1) { selOk = false; selDetail += ' (no change)'; }
  }
  T('T6 selects switchable', selOk, selDetail);
  await page.waitForTimeout(300);

  // T7 收尾金丝雀 + 截图
  T('T7 final canary', await alive());
  await page.screenshot({ path: path.join(OUT, 'ui_smoke_final.png') });

  console.log('\n== ui smoke: ' + pass + ' pass / ' + fail + ' fail ==');
  console.log('PAGE ERRORS: ' + (pageErrors.length ? pageErrors.map(e => 'pageerror: ' + e.msg).slice(0, 8).join(' | ') : 'none'));
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();

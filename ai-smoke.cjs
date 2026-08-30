// 冒烟：打开 AI 聊天工作台 → 等 GGB 就绪 → 载入内置演示 → 验证画布对象/视口比例/聊天结构
// 用法：node ai-smoke.cjs（workdir=tutor-demo）
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const logs = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text().slice(0, 200)));
  page.on('pageerror', (e) => logs.push('PAGEERR: ' + String(e).slice(0, 200)));

  await page.goto('http://127.0.0.1:8123/ai/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });

  // 等 GGB applet 就绪
  let ready = false;
  for (let i = 0; i < 60; i++) {
    const r = await page.evaluate(() => {
      const a = window.ggbApplet;
      return !!(a && typeof a.getObjectNumber === 'function');
    });
    if (r) { ready = true; break; }
    await page.waitForTimeout(2000);
  }
  console.log('ggb ready:', ready);

  // 测试设置抽屉开关
  await page.click('#btn-gear');
  await page.waitForTimeout(400);
  const drawerOpen = await page.evaluate(() => document.getElementById('drawer').classList.contains('open'));
  await page.click('#btn-drawer-close');
  await page.waitForTimeout(300);

  // 载入内置演示
  await page.click('#btn-demo');
  await page.waitForTimeout(4000);

  const data = await page.evaluate(() => {
    const a = window.ggbApplet;
    const out = { ready: !!a };
    if (!a) return out;
    try {
      const n = a.getObjectNumber();
      out.nObj = n;
      const names = [];
      for (let i = 0; i < n; i++) names.push(a.getObjectName(i));
      out.names = names;
      ['A', 'B', 'C', 'D', 'F', 'F0', 'E', 'dCE', 'dCF', 'dAE', 'dAC', 'T1', 'T4'].forEach((k) => {
        try { out[k] = a.getValueString(k); } catch (e) { out[k] = 'ERR:' + String(e).slice(0, 60); }
      });
      // 视口比例：从 XML 读真实 size + scale/yscale
      const xml = String(a.getXML() || '');
      const size = xml.match(/<size width="([\d.]+)" height="([\d.]+)"/);
      const cs = xml.match(/<coordSystem xZero="[^"]*" yZero="[^"]*" scale="([\d.]+)" yscale="([\d.]+)"/);
      out.size = size ? size[1] + 'x' + size[2] : null;
      out.scale = cs ? cs[1] : null;
      out.yscale = cs ? cs[2] : null;
      out.ratio = cs && parseFloat(cs[2]) ? (parseFloat(cs[1]) / parseFloat(cs[2])).toFixed(3) : null;
    } catch (e) { out.fatal = String(e).slice(0, 200); }
    // 聊天 DOM 结构
    const q = (s) => document.querySelectorAll(s).length;
    out.chat = {
      msgs: q('.msg'), users: q('.msg.user'), sys: q('.msg.sys'),
      thinks: q('.think'), tools: q('.toolcard'), answers: q('.answer'),
      stems: q('.stem'), jsonRaw: q('.raw-json'), rebuildBtn: q('#btn-rebuild')
    };
    out.drawerWasOpen = true; // 已在外部测
    return out;
  });
  data.drawerToggled = drawerOpen;

  console.log('=== CONSOLE (top 20) ===');
  console.log(logs.slice(0, 20).join('\n') || '(none)');
  console.log('=== DATA ===');
  console.log(JSON.stringify(data, null, 1));
  try {
    await page.screenshot({ path: 'C:/Users/Curren Bouquetd\'or/AppData/Local/Temp/ai_smoke.png', fullPage: false });
    console.log('=== SHOT saved ===');
  } catch (e) { console.log('shot fail', String(e).slice(0, 120)); }
  await browser.close();
})();
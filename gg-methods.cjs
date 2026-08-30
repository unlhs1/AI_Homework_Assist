// 探测 classic applet API：方法清单 + setAlgebraVisible/工具栏隐藏实验 + XML 布局段
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const logs = [];
  page.on('console', (m) => logs.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => logs.push('PAGEERR: ' + String(e).slice(0, 200)));

  await page.goto('http://127.0.0.1:8123/gg/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  let ready = false;
  for (let i = 0; i < 90; i++) {
    const r = await page.evaluate(() => { const a = window.ggbApplet; return !!(a && typeof a.getObjectNumber === 'function'); });
    if (r) { ready = true; break; }
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(2000);

  // 1) 方法清单（相关关键词）
  const methods = await page.evaluate(() => {
    const a = window.ggbApplet;
    const out = {};
    ['setAlgebraVisible', 'setToolbarVisible', 'setMenuVisible', 'setPerspective', 'setLayout',
     'setStylebarVisible', 'setShowToolbar', 'setShowAlgebraInput', 'evalCommand', 'setCoordSystem',
     'getXML', 'setGridVisible', 'setAxesVisible'].forEach((m) => {
      try { out[m] = typeof a[m]; } catch (e) { out[m] = 'ERR'; }
    });
    // 原型方法全名扫描（含 lgebr/oolbar/ayout）
    const names = [];
    let p = a;
    while (p && names.length < 400) {
      Object.getOwnPropertyNames(p).forEach((n) => { if (/lgebr|oolbar|ayout|ersp|Algebra|Toolbar/i.test(n)) names.push(n); });
      p = Object.getPrototypeOf(p);
    }
    out.matching = names.slice(0, 40);
    return out;
  });
  console.log('=== METHODS ===');
  console.log(JSON.stringify(methods, null, 1));

  // 2) XML 布局段（perspective pane）
  const layout = await page.evaluate(() => {
    const a = window.ggbApplet;
    try {
      const xml = a.getXML();
      const i = xml.indexOf('<perspective');
      const j = xml.indexOf('</perspective>');
      return { pane: xml.slice(i, Math.min(i + 900, j + 16)) };
    } catch (e) { return { err: String(e).slice(0, 120) }; }
  });
  console.log('=== LAYOUT XML ===');
  console.log(layout.pane);

  // 3) setAlgebraVisible(false) 实验
  const exp = await page.evaluate(async () => {
    const a = window.ggbApplet;
    const out = { called: false };
    const readSize = () => {
      try {
        const xml = a.getXML();
        const ev = xml.match(/<euclidianView>([\s\S]*?)<\/euclidianView>/);
        if (!ev) return null;
        const size = ev[1].match(/<size width="([\d.]+)" height="([\d.]+)"/);
        const cs = ev[1].match(/<coordSystem[^>]*scale="([\d.]+)" yscale="([\d.]+)"/);
        return size && cs ? { w: +size[1], h: +size[2], scale: +cs[1], yscale: +cs[2], ratio: (+cs[1] / +cs[2]).toFixed(3) } : null;
      } catch (e) { return 'ERR'; }
    };
    out.before = readSize();
    try { a.setAlgebraVisible(false); out.called = true; } catch (e) { out.called = false; out.err = String(e).slice(0, 100); }
    await new Promise((r) => setTimeout(r, 1800));
    out.after = readSize();
    return out;
  });
  console.log('=== setAlgebraVisible EXPERIMENT ===');
  console.log(JSON.stringify(exp, null, 1));
  console.log('=== LOGS ===');
  console.log(logs.slice(-8).join('\n') || '(none)');
  await browser.close();
})();
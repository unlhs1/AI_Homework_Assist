// F 拖动变体矩阵：单击选中 / 长按拖 / 双击 / 微移后拖 / 点上方空白拖，读 F 值
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const logs = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text().slice(0, 200)));
  page.on('pageerror', (e) => logs.push('PAGEERR: ' + String(e).slice(0, 200)));

  await page.goto('http://127.0.0.1:8123/gg/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  let ready = false;
  for (let i = 0; i < 90; i++) {
    const r = await page.evaluate(() => { const a = window.ggbApplet; return !!(a && typeof a.getObjectNumber === 'function'); });
    if (r) { ready = true; break; }
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(6000);

  // 选中状态读取
  const cap2 = await page.evaluate(() => {
    const a = window.ggbApplet;
    const out = { methods: {} };
    ['getSelectedObjectNames', 'getSelectedObjects', 'getSelectionOrder', 'deleteObject', 'setCoords', 'setValue'].forEach((m) => {
      try { out.methods[m] = typeof a[m]; } catch (e) { out.methods[m] = 'ERR'; }
    });
    return out;
  });
  console.log('=== CAP2 ==='); console.log(JSON.stringify(cap2, null, 1));

  const geo = await page.evaluate(() => {
    const a = window.ggbApplet;
    try {
      const xml = a.getXML();
      const ev = xml.match(/<euclidianView>([\s\S]*?)<\/euclidianView>/);
      const size = ev[1].match(/<size width="([\d.]+)" height="([\d.]+)"/);
      const cs = ev[1].match(/<coordSystem xZero="([\d.]+)" yZero="([\d.]+)" scale="([\d.]+)" yscale="([\d.]+)"/);
      const w = +size[1], h = +size[2], scale = +cs[3], yscale = +cs[4], xZero = +cs[1], yZero = +cs[2];
      return { w, h, scale, yscale, xZero, yZero, xmin: -xZero / scale, xmax: (w - xZero) / scale, ymin: -(h - yZero) / yscale, ymax: yZero / yscale };
    } catch (e) { return { err: String(e).slice(0, 100) }; }
  });
  const bb = await page.locator('#ggb-element').boundingBox();
  console.log('=== GEO ===', JSON.stringify(geo), ' BB=', JSON.stringify(bb));

  const getF = () => page.evaluate(() => { try { return window.ggbApplet.getValueString('F'); } catch (e) { return 'ERR'; } });
  const getSel = () => page.evaluate(() => {
    const a = window.ggbApplet;
    try { return (a.getSelectedObjectNames ? a.getSelectedObjectNames() : null) || (a.getSelectedObjects ? a.getSelectedObjects() : null); }
    catch (e) { return 'ERR:' + String(e).slice(0, 60); }
  });

  const px = (x, y) => [bb.x + ((x - geo.xmin) / (geo.xmax - geo.xmin)) * geo.w, bb.y + geo.h - ((y - geo.ymin) / (geo.ymax - geo.ymin)) * geo.h];
  const [fx, fy] = px(4, 2);          // F
  const [tx, ty] = px(4, 1);          // 目标 (4,1)
  console.log('F px', fx.toFixed(1), fy.toFixed(1), 'target', tx.toFixed(1), ty.toFixed(1));

  const v1 = async (label, fn) => {
    const before = await getF();
    await fn();
    await page.waitForTimeout(500);
    console.log(label, '| F:', before, '->', await getF(), '| sel:', await getSel());
  };

  // 1) 单击选中
  await v1('click-select', async () => { await page.mouse.click(fx, fy); });
  // 2) 长按 500ms 后拖
  await v1('long-press-drag', async () => {
    await page.mouse.move(fx, fy); await page.mouse.down(); await page.waitForTimeout(600);
    await page.mouse.move(tx, ty, { steps: 10 }); await page.mouse.up();
  });
  // 3) 双击
  await v1('double-click', async () => { await page.mouse.dblclick(fx, fy); });
  // 4) 微移 3px 再大步拖（按住点抖动）
  await v1('nudge-drag', async () => {
    await page.mouse.move(fx - 3, fy); await page.mouse.down(); await page.mouse.move(fx + 3, fy, { steps: 3 });
    await page.mouse.move(tx, ty, { steps: 10 }); await page.mouse.up();
  });
  // 5) 点偏上 8px（F 上方空白）按下拖到 (4,1)
  const [ux, uy] = px(4, 2.35);
  await v1('blank-above-drag', async () => {
    await page.mouse.move(ux, uy); await page.mouse.down(); await page.mouse.move(tx, ty, { steps: 10 }); await page.mouse.up();
  });
  // 6) 直接从 C 沿线拖到 F（测试线段 vs 点命中）：down 在 C(4,0) 上方即 F 处
  // 7) 拖 F0（(4,2.93)）验证路径点都可拖否
  const [gx, gy] = px(4, 2.93);
  await v1('drag-F0', async () => {
    await page.mouse.move(gx, gy); await page.mouse.down(); await page.mouse.move(px(4, 3.5)[0], px(4, 3.5)[1], { steps: 10 }); await page.mouse.up();
  });

  console.log('=== LOGS ==='); console.log(logs.slice(-10).join('\n') || '(none)');
  await browser.close();
})();
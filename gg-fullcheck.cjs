// 最终联动检查：gg 页初始 IsDefined 保护 + 拖动后联动 + AI 页生成
const { chromium } = require('playwright-core');

async function loadPage(browser, url, waitMs) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const logs = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text().slice(0, 150)));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  let ready = false;
  for (let i = 0; i < 90; i++) {
    const r = await page.evaluate(() => { const a = window.ggbApplet; return !!(a && typeof a.getObjectNumber === 'function'); });
    if (r) { ready = true; break; }
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(waitMs || 6000);
  return { page, ready, logs };
}

async function snapVals(page) {
  return page.evaluate(() => {
    const a = window.ggbApplet;
    const o = {};
    ['F', 'F0', 'E', 'ce', 'dCE', 'dCF', 'dAE', 'dAC', 'T1', 'T2', 'T3', 'T4'].forEach((k) => {
      try { o[k] = a.getValueString(k); } catch (e) { o[k] = 'ERR'; }
    });
    return o;
  });
}

async function viewInfo(page) {
  return page.evaluate(() => {
    const a = window.ggbApplet;
    try {
      const xml = a.getXML();
      const ev = xml.match(/<euclidianView>([\s\S]*?)<\/euclidianView>/);
      const size = ev[1].match(/<size width="([\d.]+)" height="([\d.]+)"/);
      const cs = ev[1].match(/<coordSystem[^>]*scale="([\d.]+)" yscale="([\d.]+)"/);
      return { w: +size[1], h: +size[2], scale: +cs[1], yscale: +cs[2], ratio: (+cs[1] / +cs[2]).toFixed(3) };
    } catch (e) { return { err: String(e).slice(0, 80) }; }
  });
}

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
  });

  // ── 1. gg 页：初始保护态 ──
  const gg = await loadPage(browser, 'http://127.0.0.1:8123/gg/index.html');
  console.log('=== GG 初始（IsDefined 保护）===');
  console.log(JSON.stringify(await snapVals(gg.page), null, 1));
  console.log('view:', JSON.stringify(await viewInfo(gg.page)));

  // ── 2. gg 页：拖动 F 到 F′（0.732a 位置附近 y≈2.93）→ 联动 + ✓ ──
  const info = await viewInfo(gg.page);
  const bb = await gg.page.locator('#ggb-element').boundingBox();
  if (info && info.w) {
    // 从 XML 反推世界坐标范围
    const geo = await gg.page.evaluate(() => {
      const a = window.ggbApplet;
      const xml = a.getXML();
      const ev = xml.match(/<euclidianView>([\s\S]*?)<\/euclidianView>/);
      const size = ev[1].match(/<size width="([\d.]+)" height="([\d.]+)"/);
      const cs = ev[1].match(/<coordSystem xZero="([\d.]+)" yZero="([\d.]+)" scale="([\d.]+)" yscale="([\d.]+)"/);
      const w = +size[1], h = +size[2], scale = +cs[3], yscale = +cs[4], xZero = +cs[1], yZero = +cs[2];
      return { w, h, xmin: -xZero / scale, xmax: (w - xZero) / scale, ymin: -(h - yZero) / yscale, ymax: yZero / yscale };
    });
    const px = (x, y) => [bb.x + ((x - geo.xmin) / (geo.xmax - geo.xmin)) * geo.w, bb.y + geo.h - ((y - geo.ymin) / (geo.ymax - geo.ymin)) * geo.h];
    // 当前 F 在 (4,0)，拖到 (4,2.93)（F′ 灰点位置）
    const [fx, fy] = px(4, 0);
    const [tx, ty] = px(4, 2.93);
    await gg.page.mouse.move(fx, fy);
    await gg.page.mouse.down();
    await gg.page.waitForTimeout(400);
    await gg.page.mouse.move(tx, ty, { steps: 20 });
    await gg.page.mouse.up();
    await gg.page.waitForTimeout(900);
    console.log('=== GG 拖动 F→F′ 后 ===');
    console.log(JSON.stringify(await snapVals(gg.page), null, 1));
  }

  await gg.page.screenshot({ path: "C:/Users/Curren Bouquetd'or/AppData/Local/Temp/gg_full.png", fullPage: false });
  console.log('shot gg_full saved');
  await gg.page.close();

  // ── 3. AI 页：载入内置演示 → 生成 → 检查 ──
  const ai = await loadPage(browser, 'http://127.0.0.1:8123/ai/index.html');
  await ai.page.click('#btn-demo');
  await ai.page.waitForTimeout(400);
  await ai.page.click('#btn-build');
  await ai.page.waitForTimeout(6000);
  console.log('=== AI 页生成后 ===');
  console.log(JSON.stringify(await snapVals(ai.page), null, 1));
  console.log('view:', JSON.stringify(await viewInfo(ai.page)));
  await ai.page.screenshot({ path: "C:/Users/Curren Bouquetd'or/AppData/Local/Temp/gg_ai2.png" });
  console.log('shot gg_ai2 saved');
  await ai.page.close();

  await browser.close();
})();
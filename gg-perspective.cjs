// setPerspective 实验：把 pane divider 改 0，看绘图视图是否占满 778 宽
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto('http://127.0.0.1:8123/gg/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  let ready = false;
  for (let i = 0; i < 90; i++) {
    const r = await page.evaluate(() => { const a = window.ggbApplet; return !!(a && typeof a.getObjectNumber === 'function'); });
    if (r) { ready = true; break; }
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(2500);

  const exp = await page.evaluate(async () => {
    const a = window.ggbApplet;
    const out = {};
    const readSize = () => {
      try {
        const xml = a.getXML();
        const ev = xml.match(/<euclidianView>([\s\S]*?)<\/euclidianView>/);
        if (!ev) return null;
        const size = ev[1].match(/<size width="([\d.]+)" height="([\d.]+)"/);
        const cs = ev[1].match(/<coordSystem[^>]*scale="([\d.]+)" yscale="([\d.]+)"/);
        return size && cs ? { w: +size[1], h: +size[2], scale: +cs[1], yscale: +cs[2], ratio: (+cs[1] / +cs[2]).toFixed(3) } : null;
      } catch (e) { return 'ERR:' + String(e).slice(0, 80); }
    };
    out.before = readSize();
    try {
      const px = a.getPerspectiveXML();
      out.perspBefore = px.slice(0, 500);
      const px2 = px.replace(/divider="0\.4"/, 'divider="0"');
      out.dividerChanged = px2 !== px;
      a.setPerspective(px2);
      out.called = true;
    } catch (e) { out.called = false; out.err = String(e).slice(0, 150); }
    await new Promise((r) => setTimeout(r, 2000));
    out.after = readSize();
    return out;
  });
  console.log('=== PERSPECTIVE EXPERIMENT ===');
  console.log(JSON.stringify(exp, null, 1));
  await browser.close();
})();
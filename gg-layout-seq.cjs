// 布局矩阵（顺序版）：逐 appName 单实例加载，读 XML 视图尺寸 + scale/yscale
const { chromium } = require('playwright-core');

const COMBOS = [
  { id: 'graphing', appName: 'graphing' },
  { id: 'geometry', appName: 'geometry' },
  { id: 'classicHideAlg', appName: 'classic', hideAlg: true },
];

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
  });
  const results = {};

  for (const combo of COMBOS) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await page.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
#gg{width:780px;height:560px;border:1px solid #ccc;overflow:hidden}
</style></head><body>
<div id="gg"></div>
<script src="https://www.geogebra.org/apps/deployggb.js"></script>
<script>
window.__r = { ready: false };
function build(api) {
  try { if (${combo.hideAlg ? 'true' : 'false'} && typeof api.setAlgebraVisible === 'function') api.setAlgebraVisible(false); } catch (e) {}
  ['A=(0,4)','B=(0,0)','C=(4,0)','D=(4,4)','sq=Polygon(A,B,C,D)'].forEach(c => { try { api.evalCommand(c); } catch (e) {} });
  try { api.setCoordSystem(-2, 8, -0.28611825192802076, 6.88611825192802); } catch (e) {}
}
var params = {
  appName: '${combo.appName}',
  width: 780, height: 560,
  showToolBar: false, showMenuBar: false, showAlgebraInput: false, showResetIcon: true,
  enableShiftDragZoom: true,
  appletOnLoad: function (api) { window.__r.ready = true; window.__r.api = api; build(api); }
};
new GGBApplet(params, true).inject('gg');
</script></body></html>`, { waitUntil: 'load' });

    let ready = false;
    for (let i = 0; i < 90; i++) {
      try {
        const r = await page.evaluate(() => !!window.__r && window.__r.ready);
        if (r) { ready = true; break; }
      } catch (e) {}
      await page.waitForTimeout(2000);
    }
    if (!ready) { results[combo.id] = { err: 'applet not ready (timeout)' }; await page.close(); continue; }
    await page.waitForTimeout(2500);

    const data = await page.evaluate(() => {
      const api = window.__r.api;
      const out = {};
      try {
        const xml = api.getXML();
        const ev = xml.match(/<euclidianView>([\s\S]*?)<\/euclidianView>/);
        if (ev) {
          const size = ev[1].match(/<size width="([\d.]+)" height="([\d.]+)"/);
          const cs = ev[1].match(/<coordSystem xZero="([\d.]+)" yZero="([\d.]+)" scale="([\d.]+)" yscale="([\d.]+)"/);
          if (size) out.viewSize = { w: +size[1], h: +size[2] };
          if (cs) {
            const c = { xZero: +cs[1], yZero: +cs[2], scale: +cs[3], yscale: +cs[4] };
            out.coord = c;
            out.unitRatio = (c.scale / c.yscale).toFixed(3); // 1 = 正方形单位
          }
        } else out.ev = 'not found';
      } catch (e) { out.err = String(e).slice(0, 120); }
      return out;
    });
    results[combo.id] = data;
    await page.close();
  }

  console.log('=== LAYOUT RESULTS ===');
  console.log(JSON.stringify(results, null, 1));
  await browser.close();
})();
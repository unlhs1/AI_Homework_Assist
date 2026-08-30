// 拖动对照矩阵：定位 F 拖不动的根因（build 本身 vs 我们的配置）
// M1 官方最小(showToolBar true, 无 perspective) | M2 无 perspective+无工具栏 | M3 当前完整 | M4 perspective 无 setView | M5 geometry
const { chromium } = require('playwright-core');

const COMBOS = [
  { id: 'M1_official_toolbar', appName: 'classic', showToolBar: true, persp: false },
  { id: 'M2_notoolbar_nopersp', appName: 'classic', showToolBar: false, persp: false },
  { id: 'M3_current', appName: 'classic', showToolBar: false, persp: true, setView: true },
  { id: 'M4_persp_noview', appName: 'classic', showToolBar: false, persp: true, setView: false },
  { id: 'M5_geometry', appName: 'geometry', showToolBar: false, persp: false },
];

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
  });
  const results = {};

  for (const combo of COMBOS) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
#gg{width:780px;height:560px;border:1px solid #ccc;overflow:hidden}
</style></head><body>
<div id="gg"></div>
<script src="https://www.geogebra.org/apps/deployggb.js"></script>
<script>
window.__r = { ready: false };
function build(api) {
  ${combo.persp ? `try { api.setPerspective(String(api.getPerspectiveXML() || '').replace(/divider="0\\.4"/, 'divider="0"')); } catch (e) {}` : ''}
  ['A=(0,4)','B=(0,0)','C=(4,0)','D=(4,4)','sq=Polygon(A,B,C,D)','F=Point(Segment(C,D), 0.5)','cf=Segment(C,F)'].forEach(c => { try { api.evalCommand(c); } catch (e) {} });
  ${combo.setView ? `try { api.setCoordSystem(-2,8,3.3-7.172/2,3.3+7.172/2); } catch (e) {}` : ''}
}
var params = {
  appName: '${combo.appName}',
  width: 780, height: 560,
  showToolBar: ${combo.showToolBar}, showMenuBar: false, showAlgebraInput: false, showResetIcon: true,
  enableShiftDragZoom: true,
  appletOnLoad: function (api) { window.__r.ready = true; window.__r.api = api; build(api); }
};
new GGBApplet(params, true).inject('gg');
</script></body></html>`, { waitUntil: 'load' });

    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        const r = await page.evaluate(() => !!window.__r && window.__r.ready);
        if (r) { ready = true; break; }
      } catch (e) {}
      await page.waitForTimeout(1500);
    }
    if (!ready) { results[combo.id] = { err: 'not ready' }; await page.close(); continue; }
    await page.waitForTimeout(2000);

    const geo = await page.evaluate(() => {
      const a = window.__r.api;
      try {
        const xml = a.getXML();
        const ev = xml.match(/<euclidianView>([\s\S]*?)<\/euclidianView>/);
        const size = ev[1].match(/<size width="([\d.]+)" height="([\d.]+)"/);
        const cs = ev[1].match(/<coordSystem xZero="([\d.]+)" yZero="([\d.]+)" scale="([\d.]+)" yscale="([\d.]+)"/);
        const w = +size[1], h = +size[2], scale = +cs[3], yscale = +cs[4], xZero = +cs[1], yZero = +cs[2];
        return { w, h, xmin: -xZero / scale, xmax: (w - xZero) / scale, ymin: -(h - yZero) / yscale, ymax: yZero / yscale, scale, yscale };
      } catch (e) { return { err: String(e).slice(0, 100) }; }
    });
    const bb = await page.locator('#gg').boundingBox();
    const getF = () => page.evaluate(() => { try { return window.__r.api.getValueString('F'); } catch (e) { return 'ERR'; } });
    const px = (x, y) => [bb.x + ((x - geo.xmin) / (geo.xmax - geo.xmin)) * geo.w, bb.y + geo.h - ((y - geo.ymin) / (geo.ymax - geo.ymin)) * geo.h];

    const [fx, fy] = px(4, 2);
    const [tx, ty] = px(4, 1);
    const before = await getF();
    await page.mouse.move(fx, fy);
    await page.mouse.down();
    await page.waitForTimeout(500);
    await page.mouse.move(tx, ty, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    const after = await getF();
    results[combo.id] = { geo, F_before: before, F_after: after, moved: before !== after, px: [fx.toFixed(0), fy.toFixed(0)] };
    await page.close();
  }

  console.log('=== DRAG MATRIX ===');
  console.log(JSON.stringify(results, null, 1));
  await browser.close();
})();
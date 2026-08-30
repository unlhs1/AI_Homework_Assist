// 布局矩阵 v2：4 种 appName/组合同页对比，读 XML 视图尺寸 + scale/yscale，找全宽等比的配置
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const logs = [];
  page.on('console', (m) => logs.push(m.text().slice(0, 200)));

  await page.setContent(`
<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:sans-serif}
.combo{border:1px solid #999;border-radius:8px;margin:8px;padding:8px;display:inline-block;vertical-align:top}
.combo h3{margin:0 0 6px;font-size:13px}
.gg{width:780px;height:560px;border:1px solid #ccc;overflow:hidden}
</style></head><body>
<div id="combos"></div>
<script src="https://www.geogebra.org/apps/deployggb.js"></script>
<script>
window.__ready = {};
window.__apis = {};
function build(api, comboId) {
  try { if (comboId === 'classicHideAlg' && typeof api.setAlgebraVisible === 'function') api.setAlgebraVisible(false); } catch (e) {}
  ['A=(0,4)','B=(0,0)','C=(4,0)','D=(4,4)','sq=Polygon(A,B,C,D)'].forEach(c => { try { api.evalCommand(c); } catch (e) {} });
  try { api.setCoordSystem(-2, 8, -0.28611825192802076, 6.88611825192802); } catch (e) {}
}
[['graphing','graphing'],['geometry','geometry'],['classicHideAlg','classic'],['suite','suite']].forEach(function (c) {
  var id = c[0], appName = c[1];
  var div = document.createElement('div');
  div.className = 'combo';
  div.innerHTML = '<h3>' + id + '</h3><div id="gg-' + id + '" class="gg"></div>';
  document.getElementById('combos').appendChild(div);
  var params = {
    appName: appName,
    width: 780, height: 560,
    showToolBar: false,
    showMenuBar: false,
    showAlgebraInput: false,
    showResetIcon: true,
    enableShiftDragZoom: true,
    appletOnLoad: function (api) { window.__ready[id] = true; window.__apis[id] = api; build(api, id); }
  };
  new GGBApplet(params, true).inject('gg-' + id);
});
</script></body></html>
`, { waitUntil: 'load' });

  for (let i = 0; i < 120; i++) {
    const r = await page.evaluate(() => {
      const k = Object.keys(window.__ready);
      return k.length >= 4 && k.every(x => window.__ready[x]);
    });
    if (r) break;
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(2500);

  const data = await page.evaluate(() => {
    const out = {};
    ['graphing', 'geometry', 'classicHideAlg', 'suite'].forEach((id) => {
      const api = window.__apis[id];
      out[id] = {};
      if (!api) { out[id].err = 'no api'; return; }
      try {
        const xml = api.getXML();
        out[id].xmlLen = xml.length;
        const ev = xml.match(/<euclidianView>([\s\S]*?)<\/euclidianView>/);
        if (ev) {
          const mSize = ev[1].match(/<size width="([\d.]+)" height="([\d.]+)"/);
          const mCS = ev[1].match(/<coordSystem xZero="([\d.]+)" yZero="([\d.]+)" scale="([\d.]+)" yscale="([\d.]+)"/);
          out[id].viewSize = mSize ? { w: +mSize[1], h: +mSize[2] } : null;
          out[id].coord = mCS ? { xZero: +mCS[1], yZero: +mCS[2], scale: +mCS[3], yscale: +mCS[4] } : null;
          if (out[id].coord && out[id].viewSize) {
            const c = out[id].coord, v = out[id].viewSize;
            out[id].unitPx = { x: c.scale, y: c.yscale, ratio: (c.scale / c.yscale).toFixed(3),
              spanX: (v.w / c.scale).toFixed(2), spanY: (v.h / c.yscale).toFixed(2) };
          }
        } else out[id].evTag = 'not found';
      } catch (e) { out[id].err = String(e).slice(0, 100); }
    });
    return out;
  });
  console.log('=== RESULT ===');
  console.log(JSON.stringify(data, null, 1));
  console.log('=== LOGS (8) ===');
  console.log(logs.slice(0, 8).join('\n') || '(none)');
  await browser.close();
})();
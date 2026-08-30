// 关键判定：去掉 setPerspective 后 F 能否拖？ 用 deployggb 从 https 加载 + ggbApplet 轮询（已验证方式）
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

  // 直接打开官方 deployggb 演示方式构造（无 setPerspective、无 setView）
  await page.goto('https://www.geogebra.org/apps/geogebra.html?ggbBase64=invalid', { waitUntil: 'domcontentloaded' }).catch(() => {});
  // 更可靠：用我们服务器上的 gg 页 + 注入式取消 perspective（页面已改版，直接改 DOM 变量？不——写独立 setContent 页面）
  await page.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>#gg{width:780px;height:560px;border:1px solid #ccc;overflow:hidden}</style></head><body>
<div id="gg"></div>
<script src="https://www.geogebra.org/apps/deployggb.js"></script>
<script>
var params = {
  appName: 'classic', width: 780, height: 560,
  showToolBar: false, showMenuBar: false, showAlgebraInput: false, showResetIcon: true,
  enableLabelDrags: false, enableShiftDragZoom: true, enableRightClick: false,
  showZoomButtons: false, language: 'zh', capture3DIcons: false,
  appletOnLoad: function (api) {
    try { api.setErrorDialogsActive(false); } catch (e) {}
    ['A=(0,4)','B=(0,0)','C=(4,0)','D=(4,4)','sq=Polygon(A,B,C,D)','F=Point(Segment(C,D), 0.5)','cf=Segment(C,F)'].forEach(function (c) { try { api.evalCommand(c); } catch (e) {} });
  }
};
new GGBApplet(params, true).inject('gg');
</script></body></html>`, { waitUntil: 'load' });

  let ready = false;
  for (let i = 0; i < 90; i++) {
    const r = await page.evaluate(() => { const a = window.ggbApplet; return !!(a && typeof a.getObjectNumber === 'function'); });
    if (r) { ready = true; break; }
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(3000);
  console.log('ready:', ready);

  const geo = await page.evaluate(() => {
    const a = window.ggbApplet;
    try {
      const xml = a.getXML();
      const ev = xml.match(/<euclidianView>([\s\S]*?)<\/euclidianView>/);
      const size = ev[1].match(/<size width="([\d.]+)" height="([\d.]+)"/);
      const cs = ev[1].match(/<coordSystem xZero="([\d.]+)" yZero="([\d.]+)" scale="([\d.]+)" yscale="([\d.]+)"/);
      const w = +size[1], h = +size[2], scale = +cs[3], yscale = +cs[4], xZero = +cs[1], yZero = +cs[2];
      return { w, h, xmin: -xZero / scale, xmax: (w - xZero) / scale, ymin: -(h - yZero) / yscale, ymax: yZero / yscale };
    } catch (e) { return { err: String(e).slice(0, 100) }; }
  });
  const bb = await page.locator('#gg').boundingBox();
  const getF = () => page.evaluate(() => { try { return window.ggbApplet.getValueString('F'); } catch (e) { return 'ERR'; } });
  const px = (x, y) => [bb.x + ((x - geo.xmin) / (geo.xmax - geo.xmin)) * geo.w, bb.y + geo.h - ((y - geo.ymin) / (geo.ymax - geo.ymin)) * geo.h];

  const [fx, fy] = px(4, 2);
  const [tx, ty] = px(4, 1);
  console.log('view:', JSON.stringify(geo), 'F px', fx.toFixed(1), fy.toFixed(1), '->', tx.toFixed(1), ty.toFixed(1));
  console.log('F before:', await getF());
  await page.mouse.move(fx, fy);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.move(tx, ty, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  console.log('F after:', await getF());
  console.log('LOGS:', logs.slice(-6).join(' | '));
  await browser.close();
})();
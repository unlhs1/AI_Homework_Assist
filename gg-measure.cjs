// 像素度量：从截图里量红/蓝单位线段的像素长度（read via canvas in headless page）
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
  });
  const page = await browser.newPage();
  const pngPath = process.argv[2];
  // file:// URL 安全转义
  const url = 'file:///' + pngPath.replace(/\\/g, '/').replace(/ /g, '%20');
  await page.goto(url, { waitUntil: 'load' });
  const res = await page.evaluate(async () => {
    const img = document.querySelector('img') || Object.assign(new Image(), { src: location.href });
    // 上面表达式可能拿到 img；兜底：直接读当前文档里的图片
    let el = document.querySelector('img');
    if (!el) {
      el = new Image();
      el.src = location.href;
      await el.decode();
    }
    const cv = document.createElement('canvas');
    cv.width = el.naturalWidth;
    cv.height = el.naturalHeight;
    const cx = cv.getContext('2d');
    cx.drawImage(el, 0, 0);
    const d = cx.getImageData(0, 0, cv.width, cv.height).data;
    const W = cv.width, H = cv.height;
    // 收集纯色像素
    const red = [], blue = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        if (r > 190 && g < 90 && b < 90) red.push([x, y]);
        else if (b > 190 && r < 90 && g < 90) blue.push([x, y]);
      }
    }
    const bbox = (pts) => {
      if (!pts.length) return null;
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (const [x, y] of pts) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, n: pts.length };
    };
    return { W, H, red: bbox(red), blue: bbox(blue) };
  });
  console.log(JSON.stringify(res, null, 1));
  await browser.close();
})();
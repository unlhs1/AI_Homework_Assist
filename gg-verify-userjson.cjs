// 验证：用户 AI 生成的 JSON（含 Line(D,A+C) 坏写法）→ 修正器 → 生成 → 平行线存在 + E 交点 + 拖 F 联动
const { chromium } = require('playwright-core');

const USER_JSON = {
  "subject": "数学",
  "question": "如图，F为正方形ABCD边CD上一点，连接AC、AF，延长AF交AC的平行线DE于点E，连接CE。求证：CE = CF",
  "ggb": {
    "commands": [
      "A=(0,4)", "B=(0,0)", "C=(4,0)", "D=(4,4)",
      "poly=Polygon(A,B,C,D)",
      "lineCD=Segment(C,D)",
      "F=Point(lineCD)",
      "lineAC=Line(A,C)",
      "lineDE=Line(D,A+C)",          // ← 用户 AI 生成的坏写法
      "rayAF=Ray(A,F)",
      "E=Intersect(rayAF,lineDE)",
      "segCE=Segment(C,E)",
      "dCE=Distance(C,E)", "dCF=Distance(C,F)"
    ],
    "readouts": []
  }
};

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const logs = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text().slice(0, 200)));
  page.on('pageerror', (e) => logs.push('PAGEERR: ' + String(e).slice(0, 200)));

  await page.goto('http://127.0.0.1:8123/ai/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  let ready = false;
  for (let i = 0; i < 90; i++) {
    const r = await page.evaluate(() => { const a = window.ggbApplet; return !!(a && typeof a.getObjectNumber === 'function'); });
    if (r) { ready = true; break; }
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(4000);
  console.log('applet ready:', ready);

  // 注入用户 JSON，走页面自己的 buildFromJson（含修正器）
  await page.evaluate((json) => { window.__testJson = json; buildFromJson(json); }, USER_JSON);
  await page.waitForTimeout(5000);

  const snap = () => page.evaluate(() => {
    const a = window.ggbApplet;
    const o = {};
    ['lineDE', 'E', 'segCE', 'dCE', 'dCF', 'dAE', 'dAC', 'F', 'D'].forEach((k) => {
      try { o[k] = a.getValueString(k); } catch (e) { o[k] = 'ERR'; }
    });
    return o;
  });

  console.log('=== 修正器处理后生成结果 ===');
  console.log(JSON.stringify(await snap(), null, 1));

  // 拖 F 验证联动：F 从 C(4,0) 拖到 (4,3)（远离 C）
  const info = await page.evaluate(() => {
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
  const bb = await page.locator('#ggb-element').boundingBox();
  if (info.w && bb) {
    const px = (x, y) => [bb.x + ((x - info.xmin) / (info.xmax - info.xmin)) * info.w, bb.y + info.h - ((y - info.ymin) / (info.ymax - info.ymin)) * info.h];
    const [fx, fy] = px(4, 0);
    const [tx, ty] = px(4, 3);
    await page.mouse.move(fx, fy);
    await page.mouse.down();
    await page.waitForTimeout(400);
    await page.mouse.move(tx, ty, { steps: 18 });
    await page.mouse.up();
    await page.waitForTimeout(900);
    console.log('=== 拖 F(4,0)→(4,3) 后联动 ===');
    console.log(JSON.stringify(await snap(), null, 1));
  }
  console.log('=== LOGS ===');
  console.log(logs.slice(-8).join('\n') || '(none)');
  await browser.close();
})();
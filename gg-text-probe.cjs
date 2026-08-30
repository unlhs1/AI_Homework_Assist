// 定位 T1/T2 空值：测 GGB Text 字符串拼接的几种写法
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
  await page.waitForTimeout(5000);

  const res = await page.evaluate(() => {
    const a = window.ggbApplet;
    const out = {};
    const variants = {
      V1: 'V1=Text("CE = " + Round(dCE,4), (-1, 5.0))',
      V2: 'V2=Text("CE = " + dCE, (-1, 5.1))',
      V3: 'V3=Text("CE=" + (Round(dCE,4)), (-1, 5.2))',
      V4: 'V4=Text("CE = " + dCE + "  CF = " + dCF, (-1, 5.3))',
      V5: 'V5=Text(FormulaText("CE=") + dCE, (-1, 5.4))',
      V6: 'V6=Text("CE = ", (-1, 5.5)) + Text(Round(dCE,4), (-1, 5.5))',
      V7: 'V7=Text(dCE, (-1, 5.6))',
      V8: 'V8=Text("纯文字测试", (-1, 5.7))',
    };
    Object.keys(variants).forEach((k) => {
      try { a.evalCommand(variants[k]); } catch (e) { out[k + '_cmd'] = 'FAIL:' + String(e).slice(0, 80); }
    });
    Object.keys(variants).forEach((k) => {
      try { out[k] = a.getValueString(k); } catch (e) { out[k] = 'ERR'; }
    });
    return out;
  });
  console.log('=== TEXT VARIANTS ===');
  console.log(JSON.stringify(res, null, 1));
  await browser.close();
})();
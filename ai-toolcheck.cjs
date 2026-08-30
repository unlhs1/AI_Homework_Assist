// 验证页面运行时 TOOLS 注册 & studentCalc 引擎可用（刚重启的服务，无缓存）
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
  });
  const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
  await p.goto('http://127.0.0.1:8123/ai/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForTimeout(3000);
  const r = await p.evaluate(() => {
    const t = (window.TOOLS_DEBUG || window.__toolNames || null);
    return {
      hasStudentCalcGlobal: typeof window.studentCalc === 'object' && !!window.studentCalc,
      engineCalc: (() => { try { return window.studentCalc ? window.studentCalc.calc('√18') : null; } catch (e) { return 'ERR ' + e.message; } })(),
      engineSolve: (() => { try { return window.studentCalc ? window.studentCalc.solve('x^2-2=0', 'x') : null; } catch (e) { return 'ERR ' + e.message; } })(),
    };
  });
  console.log('runtime TOOLS registry check:');
  console.log(JSON.stringify(r, null, 1));
  if (errs.length) console.log('PAGEERRORS:', errs.join(' | '));
  await b.close();
})();
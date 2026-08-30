// 深度探测 v2：读 window.ggbApplet 真实能力 + XML 视图坐标 + setCoordSystem 时序实验 + 单位线段
const { chromium } = require('playwright-core');

function extractView(xml) {
  // 从 GGB XML 提取 euclidianView 的坐标范围（真实权威值）
  const m = xml && xml.match(/<euclidianView[^>]*>/);
  if (!m) return null;
  const tag = m[0];
  const g = (k) => {
    const mm = tag.match(new RegExp(k + '="([^"]*)"'));
    return mm ? parseFloat(mm[1]) : null;
  };
  return { xmin: g('xmin'), xmax: g('xmax'), ymin: g('ymin'), ymax: g('ymax') };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const logs = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text().slice(0, 300)));
  page.on('pageerror', (e) => logs.push('PAGEERR: ' + String(e).slice(0, 300)));

  await page.goto('http://127.0.0.1:8123/gg/index.html', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });

  let ready = false;
  for (let i = 0; i < 90; i++) {
    const r = await page.evaluate(() => {
      const a = window.ggbApplet;
      return !!(a && typeof a.getObjectNumber === 'function');
    });
    if (r) { ready = true; break; }
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(2000);

  // 阶段1：API 能力 + 对象真相
  const cap = await page.evaluate(() => {
    const a = window.ggbApplet;
    const out = { ready: !!a, methods: {}, objs: {}, xmlLen: 0 };
    if (!a) return out;
    ['evalCommand', 'setCoordSystem', 'getXML', 'getXmin', 'getXmax', 'getYmin', 'getYmax',
     'getWidth', 'getHeight', 'getObjectType', 'getDefinitionString', 'getCommandString',
     'getAllObjectNames', 'setViewProperties', 'reload', 'getObjectNumber', 'getValueString',
     'evalCommandGetLabels', 'getGridVisible', 'setGridVisible'].forEach((m) => {
      try { out.methods[m] = typeof a[m]; } catch (e) { out.methods[m] = 'ERR'; }
    });
    ['F', 'F0', 'E', 'c', 'rAF', 'lDE', 'ce', 'sq', 'a', 'segAC', 'gAC'].forEach((k) => {
      try {
        out.objs[k] = {
          type: a.getObjectType(k),
          def: a.getDefinitionString(k),
          val: a.getValueString(k),
        };
      } catch (e) { out.objs[k] = 'ERR:' + String(e).slice(0, 80); }
    });
    try {
      const xml = a.getXML();
      out.xmlLen = xml.length;
      out.xmlHead = xml.slice(0, 900);
    } catch (e) { out.xml = 'ERR:' + String(e).slice(0, 120); }
    return out;
  });
  console.log('=== PHASE1 LOGS ===');
  console.log(logs.slice(0, 20).join('\n') || '(none)');
  console.log('=== PHASE1 CAPABILITY ===');
  console.log(JSON.stringify(cap, null, 1));

  // 阶段2：setCoordSystem 时序实验（appletOnLoad 后补设，隔 1.5s 读 XML）
  const timeline = await page.evaluate(async () => {
    const a = window.ggbApplet;
    const res = {};
    const snap = (k) => {
      try {
        const xml = a.getXML();
        res[k] = extractViewLocal(xml);
        res[k + '_head'] = xml.slice(0, 400);
      } catch (e) { res[k] = 'ERR:' + String(e).slice(0, 80); }
    };
    snap('initial');
    if (typeof a.setCoordSystem === 'function') {
      try { a.setCoordSystem(-2, 8, -0.8, 6.4); res.setCoord_call = 'ok'; }
      catch (e) { res.setCoord_call = 'THROW:' + String(e).slice(0, 120); }
    } else {
      res.setCoord_call = 'NOT_A_FUNCTION';
    }
    await new Promise((r) => setTimeout(r, 1500));
    snap('after_1500ms');
    // 再试一轮：更大差异，确认是否静默无视
    if (typeof a.setCoordSystem === 'function') {
      try { a.setCoordSystem(0, 4, 0, 4); res.setCoord2 = 'ok'; } catch (e) { res.setCoord2 = 'THROW'; }
    }
    await new Promise((r) => setTimeout(r, 1500));
    snap('after_2nd_1500ms');
    return res;
    function extractViewLocal(xml) {
      const m = xml && xml.match(/<euclidianView[^>]*>/);
      if (!m) return null;
      const tag = m[0];
      const g = (k) => {
        const mm = tag.match(new RegExp(k + '="([^"]*)"'));
        return mm ? parseFloat(mm[1]) : null;
      };
      return { xmin: g('xmin'), xmax: g('xmax'), ymin: g('ymin'), ymax: g('ymax') };
    }
  });
  console.log('=== PHASE2 setCoordSystem TIMELINE ===');
  console.log(JSON.stringify(timeline, null, 1));

  // 阶段3：构造命令路线（evalCommand 的 ZoomIn/SetActiveView + 单位线段探针）
  const cmdTest = await page.evaluate(() => {
    const a = window.ggbApplet;
    const out = {};
    const tryCmd = (k, cmd) => {
      try {
        const labels = a.evalCommandGetLabels ? a.evalCommandGetLabels(cmd) : null;
        out[k] = labels ? labels.join(',') : 'evalCommandGetLabels unsupported';
      } catch (e) {
        try { a.evalCommand(cmd); out[k] = 'evalCommand ok-ish'; } catch (e2) { out[k] = 'FAIL:' + String(e2).slice(0, 120); }
      }
    };
    tryCmd('ph', 'ph=Segment((0,0),(1,0))');
    tryCmd('pv', 'pv=Segment((0,0),(0,1))');
    try { a.evalCommand('SetColor(ph,1,0,0)'); } catch (e) {}
    try { a.evalCommand('SetColor(pv,0,0,1)'); } catch (e) {}
    try { a.evalCommand('SetThickness(ph,4)'); } catch (e) {}
    try { a.evalCommand('SetThickness(pv,4)'); } catch (e) {}
    out.phVal = a.getValueString('ph');
    out.pvVal = a.getValueString('pv');
    return out;
  });
  console.log('=== PHASE3 COMMAND PROBES ===');
  console.log(JSON.stringify(cmdTest, null, 1));
  await page.waitForTimeout(1500);

  await page.screenshot({ path: "C:/Users/Curren Bouquetd'or/AppData/Local/Temp/gg_probe2.png", fullPage: true });
  console.log('=== SHOT gg_probe2 saved ===');
  await browser.close();
})();
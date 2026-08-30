const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await p.goto('http://127.0.0.1:8123/ai/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  const r = await p.evaluate(() => {
    const defined = {};
    const played = [];
    const mock = {
      exists: (n) => !!defined[n],
      evalCommand: (c) => { played.push(String(c)); const m = /^\s*([A-Za-z]\w*)\s*=/.exec(String(c)); if (m) defined[m[1]] = true; },
      getAllObjectNames: () => Object.keys(defined),
      deleteObject: (n) => { delete defined[n]; },
      getValueString: (n) => (defined[n] ? 'v(' + n + ')' : '?')
    };
    ggbApi = mock;
    constructLog = ['A=(0,0)', 'B=(4,0)', 'F=Point(Segment(A,B))', 'd=Distance(A,F)'];
    updateRebuildBtn();
    const btnShown = document.getElementById('btn-rebuild-construct').style.display !== 'none';
    constructLog.forEach((c) => mock.evalCommand(c));
    const before = Object.keys(defined).join(',');
    mock.deleteObject('F'); mock.deleteObject('d');
    const afterDrag = Object.keys(defined).join(',');
    rebuildFromConstruct();
    const replay = played.slice(-constructLog.length);
    return {
      btnShown, before, afterDrag,
      afterRebuild: Object.keys(defined).join(','),
      replayOrder: replay.join(' | '),
      sysTip: Array.from(document.querySelectorAll('.msg.sys')).slice(-1)[0] ? Array.from(document.querySelectorAll('.msg.sys')).slice(-1)[0].textContent.slice(0, 50) : ''
    };
  });
  console.log('还原逻辑:', JSON.stringify(r, null, 1));
  console.log('PAGEERRORS:', errs.length ? errs.join(' | ') : '(none)');
  await b.close();
})();

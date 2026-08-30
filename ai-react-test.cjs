// 端到端：真实 DeepSeek ReAct 全流程（传题图 + 填 key + 发送 → 思考流/工具卡片/JSON 输出/画布联动）
// 用法：node ai-react-test.cjs（workdir=tutor-demo）
// 依赖：AI_KEY 环境变量或下方测试 key（记忆交接里的测试 key）
const { chromium } = require('playwright-core');

const AI_KEY = process.env.AI_KEY || 'sk-REPLACE-WITH-YOUR-KEY';

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const logs = [];
  const reqBodies = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text().slice(0, 200)));
  page.on('pageerror', (e) => logs.push('PAGEERR: ' + String(e).slice(0, 200)));
  page.on('request', (r) => {
    if (String(r.url()).indexOf('chat/completions') !== -1) {
      let pd = '';
      try { pd = r.postData() || ''; } catch (e) { pd = '<n/a>'; }
      reqBodies.push({ url: r.url().slice(0, 90), size: pd.length, head: pd.slice(0, 200), col: String(pd || '').charAt(50) + String(pd || '').charAt(51) });
    }
  });
  page.on('response', async (r) => {
    if (String(r.url()).indexOf('chat/completions') !== -1 && r.status() >= 400) {
      let t = '';
      try { t = (await r.text()).slice(0, 400); } catch (e) {}
      logs.push('RESP ' + r.status() + ': ' + t);
    }
  });

  await page.goto('http://127.0.0.1:8123/ai/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });

  // 等 GGB 就绪
  let ready = false;
  for (let i = 0; i < 60; i++) {
    const r = await page.evaluate(() => !!(window.ggbApplet && typeof window.ggbApplet.getObjectNumber === 'function'));
    if (r) { ready = true; break; }
    await page.waitForTimeout(2000);
  }
  console.log('ggb ready:', ready);

  // 填 API Key（其余预设已默认 DeepSeek）
  await page.evaluate((key) => {
    const el = document.getElementById('apikey');
    el.value = key;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, AI_KEY);

  // 上传题目图（真实文件 path）
  await page.setInputFiles('#file-input', 'assets/problem.jpg');
  await page.waitForTimeout(1200);
  const uploaded = await page.evaluate(() => !!document.querySelector('.msg.user img.m-img, .msg.sys'));
  console.log('image uploaded chip:', uploaded);

  // 输入文字并发送
  await page.fill('#input-text', '请先读图，按 ReAct 工具流程解题并构造验证');
  await page.click('#btn-send');

  // 轮询直到流结束（btn-send 恢复可用）
  let done = false;
  const t0 = Date.now();
  for (let i = 0; i < 600; i++) {
    const state = await page.evaluate(() => !document.getElementById('btn-send').disabled);
    if (state) { done = true; break; }
    await page.waitForTimeout(1000);
  }
  console.log('react finished:', done, 'elapsed:', ((Date.now() - t0) / 1000).toFixed(0) + 's');

  const data = await page.evaluate(() => {
    const a = window.ggbApplet;
    const out = {};
    const q = (s) => document.querySelectorAll(s).length;
    out.chat = {
      msgs: q('.msg'), users: q('.msg.user'), sys: q('.msg.sys'), errs: q('.msg.sys.err'),
      thinks: q('.think'), thinkChars: Array.from(document.querySelectorAll('.think-body')).reduce((n, el) => n + el.textContent.length, 0),
      tools: q('.toolcard'), toolsOk: q('.toolcard .tc-status.ok'), toolsErr: q('.toolcard .tc-status.err'),
      answers: q('.answer'), stems: q('.stem'), steps: q('.steps li'),
      answerBoxes: q('.answer-box'), jsonRaw: q('.raw-json'), rebuildBtn: q('#btn-rebuild')
    };
    // 最后一条 sys/err 文案（诊断信息）
    const chips = Array.from(document.querySelectorAll('.msg.sys')).map((el) => el.textContent);
    out.lastChips = chips.slice(-6);
    if (a) {
      try {
        const n = a.getObjectNumber();
        out.nObj = n;
        const names = [];
        for (let i = 0; i < n; i++) names.push(a.getObjectName(i));
        out.names = names;
        ['F', 'E', 'dCE', 'dCF', 'dAE', 'dAC', 'T1', 'T3', 'T4'].forEach((k) => {
          try { out[k] = a.getValueString(k); } catch (e) { out[k] = 'ERR'; }
        });
        const xml = String(a.getXML() || '');
        const cs = xml.match(/<coordSystem xZero="[^"]*" yZero="[^"]*" scale="([\d.]+)" yscale="([\d.]+)"/);
        out.scale = cs ? cs[1] : null;
        out.yscale = cs ? cs[2] : null;
        out.ratio = cs && parseFloat(cs[2]) ? (parseFloat(cs[1]) / parseFloat(cs[2])).toFixed(3) : null;
      } catch (e) { out.fatal = String(e).slice(0, 200); }
    }
    return out;
  });

  console.log('=== REQ BODIES ===');
  console.log(JSON.stringify(reqBodies, null, 1));
  console.log('=== CONSOLE (top 30) ===');
  console.log(logs.slice(0, 30).join('\n') || '(none)');
  console.log('=== DATA ===');
  console.log(JSON.stringify(data, null, 1));
  try {
    await page.screenshot({ path: 'C:/Users/Curren Bouquetd\'or/AppData/Local/Temp/ai_react.png', fullPage: false });
    console.log('=== SHOT saved ===');
  } catch (e) { console.log('shot fail', String(e).slice(0, 120)); }
  await browser.close();
})();
// 快速端到端：无图文本题 → ReAct 工具循环（ggb_eval/ggb_query）→ JSON 输出 → 画布重建
// 每 8s 打印一次进度（工具卡片数/轮次/运行状态），避免长推理静默
// 用法：node ai-react-fast.cjs（workdir=tutor-demo）
const { chromium } = require('playwright-core');
const AI_KEY = process.env.AI_KEY || 'sk-REPLACE-WITH-YOUR-KEY';

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 200)));

  await page.goto('http://127.0.0.1:8123/ai/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  let ready = false;
  for (let i = 0; i < 50; i++) {
    ready = await page.evaluate(() => !!(window.ggbApplet && typeof window.ggbApplet.getObjectNumber === 'function'));
    if (ready) break;
    await page.waitForTimeout(2000);
  }
  console.log('ggb ready:', ready);

  await page.evaluate((key) => {
    const el = document.getElementById('apikey');
    el.value = key;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, AI_KEY);

  // 无图文本题（短，快）
  await page.fill('#input-text',
    '正方形 ABCD（A(0,4) B(0,0) C(4,0) D(4,4)），F 为 CD 边一点，AE=AC，求证 CE=CF。' +
    '请按 ReAct 流程：逐步用 ggb_eval 构造并画图，用 ggb_query 验证，最后输出严格 JSON。');
  await page.click('#btn-send');

  // 每 10s 打进度；最多 60 轮 ≈ 10 分钟
  for (let i = 0; i < 60; i++) {
    const st = await page.evaluate(() => {
      const q = (s) => document.querySelectorAll(s).length;
      return {
        busy: !document.getElementById('btn-send').disabled,
        chips: Array.from(document.querySelectorAll('.msg.sys')).slice(-4).map((e) => e.textContent.slice(0, 90)),
        thinks: q('.think'), tools: q('.toolcard'), ok: q('.toolcard .tc-status.ok'), err: q('.toolcard .tc-status.err'),
        answers: q('.answer'), stem: q('.stem'), steps: q('.steps li'), rebuild: q('#btn-rebuild')
      };
    });
    if (st.rebuild || (st.busy && st.answers)) { console.log('DONE@' + i, JSON.stringify(st)); break; }
    console.log('T+' + (i * 10) + 's', JSON.stringify(st));
    await page.waitForTimeout(10000);
  }

  const data = await page.evaluate(() => {
    const a = window.ggbApplet;
    const out = {};
    const q = (s) => document.querySelectorAll(s).length;
    out.chat = {
      users: q('.msg.user'), sys: q('.msg.sys'), errs: q('.msg.sys.err'),
      thinks: q('.think'),
      thinkChars: Array.from(document.querySelectorAll('.think-body')).reduce((n, el) => n + el.textContent.length, 0),
      tools: q('.toolcard'), toolsOk: q('.toolcard .tc-status.ok'), toolsErr: q('.toolcard .tc-status.err'),
      answers: q('.answer'), stems: q('.stem'), steps: q('.steps li'), answerBoxes: q('.answer-box'),
      jsonRaw: q('.raw-json'), rebuildBtn: q('#btn-rebuild')
    };
    const chips = Array.from(document.querySelectorAll('.msg.sys')).map((el) => el.textContent);
    out.lastChips = chips.slice(-8);
    // 工具卡片结果明细
    out.cards = Array.from(document.querySelectorAll('.toolcard')).map((c) => ({
      name: (c.querySelector('.tc-head b') || {}).textContent,
      status: (c.querySelector('.tc-status') || {}).textContent,
      result: (c.querySelector('.tc-result') || {}).textContent
    }));
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

  console.log('=== DATA ===');
  console.log(JSON.stringify(data, null, 1));
  try {
    await page.screenshot({ path: 'C:/Users/Curren Bouquetd\'or/AppData/Local/Temp/ai_react_fast.png', fullPage: false });
  } catch (e) {}
  await browser.close();
})();
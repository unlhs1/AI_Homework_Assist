// 验证学段定性通道：页面填百炼 stage 配置 → 发送 → 定性 chip 应秒级出现（不再卡 1-2 分钟）
const { chromium } = require('playwright-core');
const STAGE_KEY = process.env.STAGE_KEY || 'sk-REPLACE-WITH-YOUR-KEY';
(async () => {
  const b = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
  });
  const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  await p.goto('http://127.0.0.1:8123/ai/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 50; i++) {
    const r = await p.evaluate(() => !!(window.ggbApplet && typeof window.ggbApplet.getObjectNumber === 'function'));
    if (r) break;
    await p.waitForTimeout(2000);
  }
  // 填 stage 通道（百炼）+ 主配置（DeepSeek 推理模型，证明 stage 不受主模型影响）
  await p.evaluate((k) => {
    document.getElementById('stage-apikey').value = k;
    document.getElementById('stage-apikey').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('apikey').value = 'sk-REPLACE-WITH-YOUR-KEY';
    document.getElementById('apikey').dispatchEvent(new Event('input', { bubbles: true }));
  }, STAGE_KEY);
  // 不传图，纯文本：验证定性不走主模型的卡顿路径
  await p.fill('#input-text', '正方形ABCD，F在CD上，DE∥AC且AE=AC，求证CE=CF');
  const t0 = Date.now();
  await p.click('#btn-send');
  // 等定性 chip 出现或超时 30s
  let stageChip = null;
  for (let i = 0; i < 30; i++) {
    const chips = await p.evaluate(() => Array.from(document.querySelectorAll('.msg.sys')).map((e) => e.textContent));
    stageChip = chips.find((c) => c.includes('学段定性'));
    if (stageChip) break;
    await p.waitForTimeout(1000);
  }
  console.log('定性 elapsed:', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  console.log('stageChip:', stageChip);
  await b.close();
})();
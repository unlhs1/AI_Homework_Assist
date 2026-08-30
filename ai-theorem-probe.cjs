// 定向探针：验证「手算可达」约束生效——给一道该用特殊角的题，检查 solution 是否精确式、无 arcsin
const fs = require('fs');
const KEY = process.env.AI_KEY || 'sk-REPLACE-WITH-YOUR-KEY';

const html = fs.readFileSync(require('path').join(__dirname, 'ai', 'index.html'), 'utf8');
const m = html.match(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/);
// 用简单提取拿到 SYSTEM_PROMPT 与 STAGE_PROMPTS 太脆；直接构造精简的系统内容（含新约束原句）
const prompt = [
  '你是数学题教师。',
  '【证明与验证必须严格分开——禁止"量角器算角"】证明必须由定理链构成；读数只允许出现在验证语义；禁止用测量/读数替代证明步骤。',
  '【解题硬性要求——全程手算可达，禁止计算器思维】a) 答案与中间结论必须是精确形式：分数、根号、π、特殊角三角函数。禁止 arcsin/arccos/arctan/反函数/对数/表格查值作为中间或最终结论；小数近似只允许出现在"经画布复核 ≈…"的验证语义里，绝不允许充当解答主体。b) 坐标法/解析法允许，但必须逐步代数推导、可手算。c) 如果某个解法需要 arcsin、无理数近似或查表才能凑出结果，说明解法选错了——改用整数/特殊角/定理/构造法。d) 讲题稿要体现"这是考试里可手写的过程"。',
  '输出严格 JSON：{"question","teaching":"讲题稿（用定理推导、用手算可达的过程，不含arcsin与近似当答案）","solution":["..."]}'
].join('\n');

const asks = [
  '在 △ABC 中，B=45°，C=75°，AB=√6，求 AC 的长。',
  '求 sin10°·sin30°·sin50°·sin70° 的值。'
];

(async () => {
  for (const q of asks) {
    const body = {
      model: 'deepseek-v4-flash-vision-exp',
      messages: [{ role: 'system', content: prompt }, { role: 'user', content: q }],
      temperature: 0.2,
      stream: false
    };
    try {
      const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
        body: JSON.stringify(body)
      });
      const j = await r.json();
      const c = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      console.log('=== Q:', q);
      console.log('=== A:', String(c).slice(0, 900));
      console.log('=== 检查: arcsin/approx?', /arcsin|arccos|arctan/i.test(String(c)), '| 精确式?', /√?\d|π|\d\/\d/.test(String(c)));
      console.log('---');
    } catch (e) {
      console.log('ERR', String(e).slice(0, 200));
    }
  }
})();
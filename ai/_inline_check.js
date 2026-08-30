
/*script 1*/
// ════════════════════════════════════════════════════════════
// AI 聊天工作台 · ReAct 工具循环（DSH 式交互形态）
// 左=聊天流（思考块折叠 + 工具调用卡片 + 流式回答 + KaTeX/JSON 结果）
// 右=GeoGebra 工具工作台；工具由浏览器本地执行（ggb_eval=evalCommand, ggb_query=读数）
// ════════════════════════════════════════════════════════════

// ── 1. 预设与配置 ────────────────────────────────────────────
var PRESETS = {
  deepseek:  { protocol:'openai', baseurl:'https://api.deepseek.com/v1',             model:'deepseek-v4-flash-vision-exp',   jsonmode:'json', note:'DeepSeek 多模态视觉（识图首选，流式+工具已实测）' },
  dashscope: { protocol:'dashscope', baseurl:'https://dashscope.aliyuncs.com/compatible-mode/v1', model:'qwen3.5-omni-plus-2026-03-15', jsonmode:'json', note:'阿里云 DashScope compatible-mode（备用）' },
  openai:    { protocol:'openai', baseurl:'https://api.openai.com/v1',               model:'gpt-4o',                          jsonmode:'json', note:'OpenAI 官方' },
  custom:    { protocol:'openai', baseurl:'',                                        model:'',                                jsonmode:'json', note:'任意兼容端点' }
};
var CFG_KEY = 'tutorreel_ai_cfg';
function saveConfig() {
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify(getConfig()));
  } catch (e) {}
}
function loadConfig() {
  try {
    var s = localStorage.getItem(CFG_KEY);
    if (s) return JSON.parse(s);
  } catch (e) {}
  return null;
}
function applyConfig(c) {
  if (!c) return;
  if (c.protocol) document.getElementById('protocol').value = c.protocol;
  if (c.baseurl !== undefined) document.getElementById('baseurl').value = c.baseurl;
  if (c.apikey !== undefined) document.getElementById('apikey').value = c.apikey;
  if (c.model) document.getElementById('model').value = c.model;
  if (c.jsonmode) document.getElementById('jsonmode').value = c.jsonmode;
}
function loadPreset(id) {
  var p = PRESETS[id] || PRESETS.custom;
  document.getElementById('protocol').value = p.protocol;
  document.getElementById('baseurl').value = p.baseurl;
  document.getElementById('model').value = p.model;
  document.getElementById('jsonmode').value = p.jsonmode;
}
function getConfig() {
  return {
    protocol: document.getElementById('protocol').value,
    baseurl: document.getElementById('baseurl').value.trim(),
    apikey: document.getElementById('apikey').value.trim(),
    model: document.getElementById('model').value.trim(),
    jsonmode: document.getElementById('jsonmode').value
  };
}
function buildRequestUrl(cfg) {
  var base = cfg.baseurl.replace(/\/+$/, '');
  if (cfg.protocol === 'dashscope') {
    return /compatible-mode/.test(base) ? base + '/chat/completions' : base + '/compatible-mode/v1/chat/completions';
  }
  return base + '/chat/completions';
}
(function initCfg() {
  var saved = loadConfig();
  if (saved) applyConfig(saved);
  else loadPreset('deepseek');
})();

// ── 2. 图片上传（压缩到 ~1400px JPEG，不离开浏览器）─────────
var currentImage = null; // dataURL
document.getElementById('btn-upload').addEventListener('click', function () { document.getElementById('file-input').click(); });
document.getElementById('file-input').addEventListener('change', function () {
  var f = document.getElementById('file-input').files[0];
  if (!f) return;
  var rd = new FileReader();
  rd.onload = function () {
    var img = new Image();
    img.onload = function () {
      var max = 1400;
      var scale = Math.min(1, max / Math.max(img.width, img.height));
      var c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      currentImage = c.toDataURL('image/jpeg', 0.88);
      addSys('🖼 已载入题目图（' + img.width + '×' + img.height + ' → ' + c.width + '×' + c.height + '，压缩后内嵌进请求）');
    };
    img.src = rd.result;
  };
  rd.readAsDataURL(f);
});

// ── 3. 工具定义（GGB 本地执行）────────────────────────────────
var TOOLS = [
  { type:'function', function:{ name:'ggb_eval',
    description:'在 GeoGebra 画布执行一条构造命令（evalCommand），用于逐步构造图形：点 A=(0,4)、面 Polygon(A,B,C,D)、线 Line(A,C)、平行线 Line(D,gAC)、动点 Point(Segment(C,D))、射线 Ray(A,F)、交点 Intersect(rAF,lDE)、线段 Segment(C,E)、距离 Distance(C,E)、动态文字 Text(...)、样式 SetColor/SetThickness/ShowLabel。每次一条命令。',
    parameters:{ type:'object', properties:{ command:{ type:'string', description:'要执行的 GeoGebra 命令，如 "E=Intersect(rAF,lDE)"' } }, required:['command'] } } },
  { type:'function', function:{ name:'ggb_query',
    description:'查询 GeoGebra 画布当前状态，用于验证构造结果。mode=value 返回对象数值（如 dCE 的距离值），mode=defined 返回对象是否已定义。',
    parameters:{ type:'object', properties:{ names:{ type:'string', description:'对象名，逗号分隔，如 "E,dCE,dCF,dAE,dAC"' }, mode:{ type:'string', enum:['value','defined'], description:'value=取数值（默认）；defined=是否已定义' } }, required:['names'] } } }
];

function runGGBTool(name, argsStr) {
  var args;
  try { args = JSON.parse(argsStr || '{}'); } catch (e) { return { ok:false, result:'工具参数 JSON 解析失败: ' + e.message }; }
  var api = ggbApi;
  if (!api) return { ok:false, result:'GeoGebra 尚未就绪，请稍候再试' };
  try {
    if (name === 'ggb_eval') {
      var cmd = String(args.command || '').trim();
      if (!cmd) return { ok:false, result:'缺少 command 参数' };
      var err = null;
      try { api.evalCommand(cmd); } catch (e) { err = e; }
      var m = /^\s*([A-Za-z][A-Za-z0-9]*)\s*=/.exec(cmd);
      if (m && !err) {
        // 对象级命令：确认对象已定义
        var defined = null;
        if (typeof api.exists === 'function') {
          try { defined = !!api.exists(m[1]); } catch (e) {}
        }
        if (defined === false) return { ok:false, result:'命令已执行但对象 ' + m[1] + ' 未定义（可能依赖对象缺失或语法不支持）：' + cmd };
      }
      if (err) return { ok:false, result:'evalCommand 异常: ' + String(err.message || err) };
      return { ok:true, result:'OK · ' + cmd + (m && defined === true ? '（' + m[1] + ' 已定义 ✓）' : '') };
    }
    if (name === 'ggb_query') {
      var names = String(args.names || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      if (!names.length) return { ok:false, result:'缺少 names 参数（逗号分隔对象名）' };
      var mode = args.mode || 'value';
      var parts = names.map(function (n) {
        if (mode === 'defined') {
          if (typeof api.exists === 'function') {
            try { return n + '=' + (api.exists(n) ? 'true' : 'false'); } catch (e) {}
          }
          try { return n + '=' + (api.getValueString(n) !== '?' ? 'true' : 'false'); } catch (e) {}
          return n + '=未知';
        }
        var v = null;
        try { v = api.getValueString(n); } catch (e) {}
        if (v === undefined || v === null || v === '') {
          try { v = String(api.getValue(n)); } catch (e2) {}
        }
        return n + '=' + (v === null || v === undefined || v === '' ? '未定义' : v);
      });
      return { ok:true, result: parts.join('；') };
    }
    return { ok:false, result:'未知工具 ' + name };
  } catch (e) {
    return { ok:false, result:'工具执行异常: ' + String(e.message || e) };
  }
}

// ── 4. 系统提示词（含全部防护，勿回退）───────────────────────
var SYSTEM_PROMPT = [
  '你是数学题教师。工作台里嵌入了 GeoGebra 交互画布（浏览器本地执行，无需额外权限）。',
  '【最重要】题目条件可能藏在图上标注/题干末尾（常见隐藏条件如"且 AE=AC"，它是结论成立的关键）——漏读=证错=0分。必须逐字读出图片上所有文字（题干行、图内标注、角落小字），完整抄进 question。若初读未发现能推出结论的条件，再次细看图片后再下结论，不要轻易判定"原命题不成立"。',
  '',
  '【工作方式：ReAct 工具循环】',
  '拿到题目后：1) 先思考解题思路；2) 把构造拆成可执行的 GeoGebra 命令序列，用工具在画布上【真的把图构造出来】；3) 用工具验证关键数值/对象是否已定义；4) 发现构造有问题就用工具修正并重新验证；5) 全部验证通过后，输出严格 JSON 作为最终回答（不要输出多余文字）。',
  '',
  '可用工具：',
  '- ggb_eval：执行一条构造命令（{"command":"..."}）。注意：关键动点必须用【无参数】Point(路径)（如 F=Point(Segment(C,D))）——Point(路径,参数) 是固定点拖不动、SetValue(F,数值) 会把路径点改写成复数致构造断裂，两者都禁用。',
  '- ggb_query：查询画布状态（{"names":"E,dCE,dCF","mode":"value|defined"}），验证构造与结论（如判断 abs(dCE-dCF)<0.05 是否成立）。',
  '',
  '【GeoGebra 构造要点】',
  '- 平行线必须"两件套"：先定义方向直线（gAC=Line(A,C)），再过点作平行线（lDE=Line(D,gAC)）。禁止 Line(D, A+C)（A+C 是点向量和，恰好等于两定点之和→线未定义或不平行）、禁止 Line(D, AC)（AC 未定义对象）。',
  '- 有 Distance 必须同时画对应 Segment（如 segCE=Segment(C,E)，否则图上没有连线）。',
  '- 动态读数：dCE=Distance(C,E) 等距离对象 + Text(If(IsDefined(dCE), "CE = " + dCE + "　CF = " + dCF, "先把 F 拖离 C 端"), 坐标) 形式的提示文字。提示必须是 Text(...) 对象（裸 If 表达式不会显示），必须用 If(IsDefined(...)) 保护初始退化态（动点在路径端点时相关对象未定义）；不要用 Round 参与字符串拼接（实测拼接会变空串）。',
  '- 结论判断容差 0.05（如 |dCE-dCF|<0.05 即成立）。坐标比例已在页面层修正（1:1 正方形），无需在命令里处理。',
  '',
  '【最终输出】工具调用不是最终回答。即使已用工具构造好图形，仍必须输出严格 JSON（ggb.commands 写全所有构造与样式命令供页面最终重建，ggb.readouts 写全部动态 Text 读数，ggb.view 写建议视口，ggb.note 写演示提示）。结构：',
  '{ "subject":"数学", "question":"题干完整文字（含隐藏条件）", "figureNote":"图形结构描述", "solution":["步骤1","步骤2",...], "answer":"结论", "ggb":{ "commands":["A=(0,4)", ...], "readouts":["T1=Text(...)", ...], "view":{"xmin":-2,"xmax":8}, "note":"演示提示" } }'
].join('\n');

// ── 5. 聊天渲染 ─────────────────────────────────────────────
var chatScroll = document.getElementById('chat-scroll');
var autoScroll = true;
chatScroll.addEventListener('scroll', function () {
  autoScroll = (chatScroll.scrollTop + chatScroll.clientHeight >= chatScroll.scrollHeight - 140);
});
function scrollBottom() {
  if (autoScroll) chatScroll.scrollTop = chatScroll.scrollHeight;
}
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function addSys(text, isErr) {
  var d = document.createElement('div');
  d.className = 'msg sys' + (isErr ? ' err' : '');
  d.textContent = text;
  chatScroll.appendChild(d);
  scrollBottom();
  return d;
}
function addErr(text) { return addSys(text, true); }
function addUser(text) {
  var d = document.createElement('div');
  d.className = 'msg user';
  if (currentImage) {
    var im = document.createElement('img');
    im.className = 'm-img';
    im.src = currentImage;
    d.appendChild(im);
  }
  if (text) {
    var span = document.createElement('span');
    span.textContent = text;
    d.appendChild(span);
  }
  chatScroll.appendChild(d);
  scrollBottom();
  return d;
}
// 创建 AI 消息容器，返回操作句柄
function beginAssistant() {
  var wrap = document.createElement('div');
  wrap.className = 'msg assistant';
  chatScroll.appendChild(wrap);
  var h = {
    wrap: wrap,
    thinkBody: null, thinkWrap: null, thinkDone: false,
    answerEl: null, answerGotText: false,
    toolCards: {} // id -> {wrap, statusEl, argsEl, resultEl}
  };
  function ensureThink() {
    if (h.thinkWrap) return;
    var t = document.createElement('div');
    t.className = 'think';
    var head = document.createElement('div');
    head.className = 'think-head';
    head.innerHTML = '<span>💭 思考</span><span class="togg">收起 ▾</span>';
    var body = document.createElement('div');
    body.className = 'think-body';
    t.appendChild(head); t.appendChild(body);
    wrap.appendChild(t);
    h.thinkWrap = t; h.thinkBody = body;
    head.addEventListener('click', function () {
      var collapsed = body.style.display === 'none';
      body.style.display = collapsed ? '' : 'none';
      head.querySelector('.togg').textContent = collapsed ? '收起 ▾' : '展开 ▸';
    });
    scrollBottom();
  }
  function finishThink() {
    if (h.thinkDone || !h.thinkWrap) { h.thinkDone = true; return; }
    h.thinkDone = true;
    h.thinkWrap.querySelector('.togg').textContent = '展开 ▸（思考完成）';
    // 思考较长时默认折叠，保持回答流整洁
    if (h.thinkBody && h.thinkBody.textContent.length > 400) h.thinkBody.style.display = 'none';
  }
  function ensureAnswer() {
    if (h.answerEl) return;
    finishThink();
    var a = document.createElement('div');
    a.className = 'answer';
    a.innerHTML = '<div class="a-live"></div>';
    wrap.appendChild(a);
    h.answerEl = a.querySelector('.a-live');
    scrollBottom();
  }
  // 工具卡片按【增量序号】键控（流式 tool_calls 同一条只有首块带 id，后续块只有 index）——避免增量块重复建卡
  function ensureToolCard(idx) {
    var key = 'i' + idx;
    if (h.toolCards[key]) return h.toolCards[key];
    var card = document.createElement('div');
    card.className = 'toolcard';
    card.innerHTML =
      '<div class="tc-head">🔧 <b>tool…</b>' +
      '<span class="tc-status run">构造中…</span></div>' +
      '<pre class="tc-args"></pre>' +
      '<div class="tc-result" style="display:none"></div>';
    wrap.appendChild(card);
    h.toolCards[key] = {
      card: card,
      statusEl: card.querySelector('.tc-status'),
      argsEl: card.querySelector('.tc-args'),
      resultEl: card.querySelector('.tc-result'),
      nameEl: card.querySelector('.tc-head b')
    };
    scrollBottom();
    return h.toolCards[key];
  }
  h.ensureThink = ensureThink; h.finishThink = finishThink;
  h.ensureAnswer = ensureAnswer; h.ensureToolCard = ensureToolCard;
  return h;
}

// ── 6. 流式 SSE 请求（OpenAI 兼容 /chat/completions）──────────
function streamChat(messages, onDelta, opts) {
  opts = opts || {};
  return new Promise(function (resolve, reject) {
    var cfg = getConfig();
    if (!cfg.baseurl || !cfg.model) { reject(new Error('请先配置 API（右上角 ⚙ 设置）')); return; }
    var url = buildRequestUrl(cfg);
    var body = {
      model: cfg.model,
      messages: messages,
      temperature: 0.2,
      stream: true,
      tools: TOOLS,
      tool_choice: 'auto'
    };
    if (opts.jsonMode && cfg.jsonmode === 'json') body.response_format = { type: 'json_object' };
    function doFetch(b) {
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apikey },
        body: JSON.stringify(b),
        signal: opts.signal || undefined
      });
    }
    doFetch(body).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          // json_object 不支持时（400/404）自动降级重试一次
          if (body.response_format && (r.status === 400 || r.status === 404)) {
            var b2 = JSON.parse(JSON.stringify(body));
            delete b2.response_format;
            onDelta && onDelta({ sys: 'json_object 不支持，降级为普通文本重试一次' });
            return doFetch(b2).then(function (r2) {
              if (!r2.ok) return r2.text().then(function (t2) { throw new Error('API ' + r2.status + ': ' + t2.slice(0, 400)); });
              return r2;
            });
          }
          throw new Error('API ' + r.status + ': ' + t.slice(0, 400));
        });
      }
      return r;
    }).then(function (r) {
      var acc = { content:'', toolCalls: [], finish: null };
      var reader = r.body.getReader();
      var decoder = new TextDecoder('utf-8');
      var buf = '';
      function handleEvent(line) {
        if (line.indexOf('data:') !== 0) return;
        var payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') return;
        var j;
        try { j = JSON.parse(payload); } catch (e) { return; }
        var ch = j.choices && j.choices[0];
        if (!ch) return;
        if (ch.finish_reason) acc.finish = ch.finish_reason;
        var d = ch.delta || {};
        if (d.content) { acc.content += d.content; onDelta && onDelta({ content: d.content }); }
        if (d.reasoning_content) { onDelta && onDelta({ reasoning: d.reasoning_content }); }
        if (Array.isArray(d.tool_calls)) {
          d.tool_calls.forEach(function (tc) {
            var i = tc.index || 0;
            if (!acc.toolCalls[i]) acc.toolCalls[i] = { id:'', name:'', arguments:'' };
            if (tc.id) acc.toolCalls[i].id = tc.id;
            if (tc.function) {
              if (tc.function.name) acc.toolCalls[i].name = tc.function.name;
              if (tc.function.arguments) acc.toolCalls[i].arguments += tc.function.arguments;
            }
            onDelta && onDelta({ toolDelta: tc, index: i });
          });
        }
      }
      function pump() {
        return reader.read().then(function (res) {
          if (res.done) {
            // 尾块
            if (buf.trim()) handleEvent(buf);
            return;
          }
          buf += decoder.decode(res.value, { stream: true });
          var parts = buf.split(/\r?\n\r?\n/);
          buf = parts.pop();
          parts.forEach(handleEvent);
          return pump();
        });
      }
      return pump().then(function () {
        var tcs = acc.toolCalls.filter(Boolean).map(function (tc, i) {
          if (!tc.id) tc.id = 'call_' + Date.now() + '_' + i;
          return { id: tc.id, name: tc.name, type:'function', function:{ name: tc.name, arguments: tc.arguments } };
        });
        resolve({ content: acc.content, toolCalls: tcs, finishReason: acc.finish });
      });
    }).catch(function (e) {
      if (e && (e.name === 'AbortError' || /aborted/i.test(String(e.message || e)))) reject(new Error('aborted'));
      else reject(e);
    });
  });
}

// ── 7. ReAct 主循环 ─────────────────────────────────────────
var history = [];          // OpenAI messages（含图 + 工具往返）
var ggbApi = null;
var running = false;
var abortCtrl = null;
var lastJson = null;
var MAX_TOOL_ROUNDS = 12;

function buildUserContent(text) {
  var c = [{ type:'text', text: text || '（未输入文字，请直接按图中题意解题）' }];
  if (currentImage) c.unshift({ type:'image_url', image_url:{ url: currentImage } });
  return c;
}

function formatArgs(argsStr) {
  try { return JSON.stringify(JSON.parse(argsStr || '{}'), null, 1); } catch (e) { return argsStr; }
}

function setBusy(b) {
  document.getElementById('btn-send').disabled = b;
  document.getElementById('btn-demo').disabled = b;
  document.getElementById('btn-upload').disabled = b;
  document.getElementById('btn-stop').style.display = b ? 'inline-block' : 'none';
}

async function runReAct(text) {
  if (running) return;
  running = true;
  abortCtrl = new AbortController();
  setBusy(true);
  var cfg = getConfig();
  if (!cfg.baseurl || !cfg.model) { addErr('未配置 API：点右上角 ⚙ 设置（或点「载入内置演示」无 Key 体验）'); running = false; setBusy(false); return; }
  if (!cfg.apikey) { addErr('未填 API Key（右上角 ⚙ 设置）'); running = false; setBusy(false); return; }

  addUser(text);
  history = [
    { role:'system', content: SYSTEM_PROMPT },
    { role:'user', content: buildUserContent(text) }
  ];
  var asst = beginAssistant();
  var t0 = Date.now();
  var tickChip = addSys('⏳ 正在连接 API…');
  var ticker = setInterval(function () {
    tickChip.textContent = '⏳ 思考中… 已等待 ' + Math.round((Date.now() - t0) / 1000) + 's（推理型模型正常需 1-2 分钟，已进入流式后每步实时可见）';
  }, 5000);

  var liveArgs = {}; // 工具实参增量累积（按 index）
  function onDelta(d) {
    if (d.sys) { addSys(d.sys); return; }
    if (d.reasoning) {
      if (!asst.thinkBody) asst.ensureThink();
      if (asst.thinkBody) asst.thinkBody.textContent += d.reasoning;
      scrollBottom();
      return;
    }
    if (d.content) {
      asst.ensureAnswer();
      if (asst.answerEl) asst.answerEl.textContent += d.content;
      scrollBottom();
      return;
    }
    if (d.toolDelta) {
      asst.finishThink();
      var idx = d.index || 0;
      if (!liveArgs[idx]) liveArgs[idx] = '';
      if (d.toolDelta.function && d.toolDelta.function.arguments) liveArgs[idx] += d.toolDelta.function.arguments;
      var card = asst.ensureToolCard(idx);
      if (d.toolDelta.function && d.toolDelta.function.name) card.nameEl.textContent = d.toolDelta.function.name;
      card.argsEl.textContent = formatArgs(liveArgs[idx]);
      scrollBottom();
    }
  }

  var toolRound = 0;
  var finalRes = null;
  try {
    while (true) {
      var res = await streamChat(history, onDelta, { signal: abortCtrl.signal });
      // 流结束：思考块收束
      asst.finishThink();
      if (res.finishReason === 'tool_calls' && res.toolCalls.length && toolRound < MAX_TOOL_ROUNDS) {
        history.push({ role:'assistant', content: null, tool_calls: res.toolCalls.map(function (tc) {
          return { id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.arguments } };
        }) });
        for (var i = 0; i < res.toolCalls.length; i++) {
          var tc = res.toolCalls[i];
          var card = asst.ensureToolCard(i);
          card.nameEl.textContent = tc.name;
          card.argsEl.textContent = formatArgs(tc.arguments);
          card.statusEl.textContent = '执行中…';
          card.statusEl.className = 'tc-status run';
          card.resultEl.style.display = ''; card.resultEl.className = 'tc-result';
          card.resultEl.textContent = '';
          await yieldTask(); // 让浏览器渲染
          var out = runGGBTool(tc.name, tc.arguments);
          history.push({ role:'tool', tool_call_id: tc.id, content: out.result });
          card.statusEl.textContent = out.ok ? '✓ 成功' : '✗ 失败';
          card.statusEl.className = 'tc-status ' + (out.ok ? 'ok' : 'err');
          card.resultEl.className = 'tc-result ' + (out.ok ? 'ok' : 'err');
          card.resultEl.textContent = out.result;
          scrollBottom();
        }
        addSys('🔧 工具调用完成（' + res.toolCalls.length + ' 条），继续推理…');
        toolRound++;
        continue;
      }
      if (toolRound >= MAX_TOOL_ROUNDS && res.finishReason === 'tool_calls') {
        addErr('⚠️ 工具调用轮次已达上限（' + MAX_TOOL_ROUNDS + '），终止循环'); 
      }
      finalRes = res;
      break;
    }
  } catch (e) {
    clearInterval(ticker);
    if (String(e.message || e) === 'aborted') {
      addErr('⏹ 已停止（当前进度保留在画布上）');
    } else {
      addErr('请求失败：' + String(e.message || e));
      asst.finishThink();
    }
    running = false; setBusy(false); abortCtrl = null;
    return;
  }
  clearInterval(ticker);
  tickChip.remove();

  // 最终回答 → JSON
  var text0 = (finalRes && finalRes.content) || '';
  var text = text0;
  if (text) { asst.ensureAnswer(); asst.answerEl.textContent = text; }
  var json = safeExtractJSON(text);
  if (!json && text) {
    addSys('回答中未解析出 JSON，向模型请求严格 JSON…');
    history.push({ role:'assistant', content: text0 || null });
    history.push({ role:'user', content:[{ type:'text', text:'以上是你的解答过程/总结。现在请只输出最终严格 JSON（不要解释、不要代码围栏以外的任何文字）。结构：{"subject","question","figureNote","solution":[...],"answer","ggb":{"commands":[...],"readouts":[...],"view":{"xmin":..,"xmax":..},"note":..}}' }] });
    var asst2 = beginAssistant();
    try {
      var res2 = await streamChat(history, function (d) {
        if (d.content) { asst2.ensureAnswer(); asst2.answerEl.textContent += d.content; }
        if (d.reasoning) { asst2.ensureThink(); asst2.thinkBody.textContent += d.reasoning; }
      }, { signal: abortCtrl.signal, jsonMode: true });
      asst2.finishThink();
      if (res2.content) { asst2.ensureAnswer(); asst2.answerEl.textContent = res2.content; }
      json = safeExtractJSON(res2.content || '');
    } catch (e2) {
      if (String(e2.message || e2) !== 'aborted') addErr('严格 JSON 请求失败：' + String(e2.message || e2));
      json = null;
    }
  }

  if (json) {
    lastJson = json;
    addSys('✅ 已解析最终 JSON，正在生成交互演示…');
    try {
      buildFromJson(json);
      renderJSONBlock(asst, json);
      addSys('✅ 完成：右侧画布已按 JSON 重建（思考 → 工具构造/验证 → 最终 JSON）');
    } catch (e) {
      addErr('生成交互演示失败：' + String(e.message || e));
    }
  } else {
    addErr('未能从回答中解析出 JSON。（如需手动构造，可查看上方工具卡片——工具已直接在画布上执行）');
  }

  running = false; setBusy(false); abortCtrl = null;
}
function yieldTask() { return new Promise(function (r) { setTimeout(r, 30); }); }

// ── 8. JSON 抽取 / 结果渲染 / GGB 重建（复用已验证修复）────────
function safeExtractJSON(text) {
  try {
    var t = String(text || '');
    var fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) t = fence[1];
    var start = t.indexOf('{');
    if (start === -1) return null;
    var end = t.lastIndexOf('}');
    t = t.slice(start, end + 1);
    var j = JSON.parse(t);
    return j && j.ggb ? j : null;
  } catch (e) {
    try {
      var t2 = String(text || '');
      var s2 = t2.indexOf('{'); var e2 = t2.lastIndexOf('}');
      t2 = t2.slice(s2, e2 + 1).replace(/,\s*([}\]])/g, '$1');
      var j2 = JSON.parse(t2);
      return j2 && j2.ggb ? j2 : null;
    } catch (e2) { return null; }
  }
}

function mathSegments(t) {
  var out = '', last = 0, m, tex, i;
  t = String(t || '');
  var re = /(\$\$[\s\S]*?\$\$|\$[^$\s][^$]*\$|\\\([\s\S]*?\\\))/g;
  while ((m = re.exec(t))) {
    out += esc(t.slice(last, m.index));
    tex = m[1];
    if (/^\$\$/.test(tex)) tex = tex.slice(2, -2);
    else if (/^\\\(/.test(tex)) tex = tex.slice(2, -2);
    else tex = tex.slice(1, -1);
    out += '<span class="math" data-tex="' + esc(tex) + '"></span>';
    last = m.index + m[1].length;
  }
  out += esc(t.slice(last));
  return out;
}
function renderKaTeX(blockEl) {
  if (!window.katex) return;
  blockEl.querySelectorAll('.math').forEach(function (el) {
    try { katex.render(el.dataset.tex || '', el, { throwOnError: false }); } catch (e) {}
  });
}

// 在 AI 消息容器里渲染结构化 JSON 块（题目/解析/结论 + 重建按钮 + 原始 JSON）
function renderJSONBlock(asst, json) {
  asst.ensureAnswer();
  var a = asst.answerEl;
  var h = '';
  if (json.question) h += '<div class="stem"><b>题目：</b>' + esc(json.question) + '</div>';
  if (json.figureNote) h += '<div class="tip"><b>图形结构：</b>' + esc(json.figureNote) + '</div>';
  if (json.solution && json.solution.length) {
    h += '<ol class="steps">';
    json.solution.forEach(function (s) { h += '<li>' + mathSegments(s) + '</li>'; });
    h += '</ol>';
  }
  if (json.answer) h += '<div class="answer-box">结论：' + esc(json.answer) + '</div>';
  if (json.ggb && json.ggb.note) h += '<div class="tip"><b>演示提示：</b>' + esc(json.ggb.note) + '</div>';
  h += '<div style="margin-top:8px;display:flex;gap:8px">' +
       '<button class="ghostc" id="btn-rebuild">↻ 按 JSON 重建画布</button>' +
       '<button class="ghostc" id="btn-toggle-json">原始 JSON</button></div>';
  h += '<pre class="raw-json">' + esc(JSON.stringify(json, null, 1)) + '</pre>';
  a.innerHTML = h;
  renderKaTeX(a);
  a.querySelector('#btn-rebuild').addEventListener('click', function () {
    try { buildFromJson(json); addSys('↻ 已按最后 JSON 重建画布'); } catch (e) { addErr('重建失败：' + e.message); }
  });
  a.querySelector('#btn-toggle-json').addEventListener('click', function (ev) {
    var rawEl = a.querySelector('.raw-json');
    var show = rawEl.style.display !== 'block';
    rawEl.style.display = show ? 'block' : 'none';
    ev.currentTarget.textContent = show ? '隐藏 JSON' : '原始 JSON';
  });
  scrollBottom();
}

// ── 9. GeoGebra：常驻 applet + 视口修正 + 构造重建 ───────────
// 坐标比例修复（勿回退）：classic 布局左侧代数面板占 40% 宽把绘图视图挤窄 → 1x≠1y。
// ① setPerspective(divider 0.4→0) 隐藏代数面板；② setView 从 XML 读真实视图 <size>，
//    世界 Y 跨度 = X 跨度 × h/w → scale≡yscale → 像素正方形。
function setView(api, view) {
  try {
    var w = 458, h = 558;
    var m = String(api.getXML() || '').match(/<euclidianView>[\s\S]*?<size width="([\d.]+)" height="([\d.]+)"/);
    if (m) { w = parseFloat(m[1]); h = parseFloat(m[2]); }
    var xmin = -2, xmax = 8, ymid = 3.3;
    if (view && typeof view.xmin === 'number') xmin = view.xmin;
    if (view && typeof view.xmax === 'number') xmax = view.xmax;
    if (view && typeof view.ymin === 'number' && typeof view.ymax === 'number') { ymid = (view.ymin + view.ymax) / 2; }
    var spanX = xmax - xmin;
    var spanY = spanX * h / w;
    var y0 = ymid - spanY / 2, y1 = ymid + spanY / 2;
    if (view && typeof view.ymin === 'number' && typeof view.ymax === 'number') { y0 = view.ymin; y1 = view.ymax; }
    api.setCoordSystem(xmin, xmax, y0, y1);
  } catch (e) {}
}
function clearConstruct(api) {
  try {
    var names = api.getAllObjectNames();
    for (var i = 0; i < names.length; i++) { try { api.deleteObject(names[i]); } catch (e) {} }
  } catch (e) {}
}
// 平行线写法自动修正（防 LLM 坏写法 Line(D,A+C)/Line(D,AC)，勿回退）
function fixParallelLines(cmds) {
  var defined = {};
  cmds.forEach(function (c) { var m = /^\s*([A-Za-z][A-Za-z0-9]*)\s*=/.exec(c); if (m) defined[m[1]] = true; });
  var dirLines = [];
  cmds.forEach(function (c) {
    var m = /^\s*([A-Za-z][A-Za-z0-9]*)\s*=\s*Line\(\s*\([^)]*\)\s*,\s*\([^)]*\)\s*\)/.exec(c);
    if (m) { dirLines.push(m[1]); return; }
    m = /^\s*([A-Za-z][A-Za-z0-9]*)\s*=\s*Line\(\s*([A-Za-z][A-Za-z0-9]*)\s*,\s*([A-Za-z][A-Za-z0-9]*)\s*\)/.exec(c);
    if (m) { dirLines.push(m[1]); return; }
  });
  var fixedN = 0;
  var out = cmds.map(function (c) {
    var m = c.match(/^\s*([A-Za-z][A-Za-z0-9]*)\s*=\s*Line\(\s*([A-Za-z][A-Za-z0-9]*)\s*,\s*((?:[A-Za-z][A-Za-z0-9]*[+\-\u2212])+[A-Za-z][A-Za-z0-9]*)\s*\)/);
    if (m && dirLines.length) { fixedN++; return m[1] + '=Line(' + m[2] + ',' + dirLines[0] + ')'; }
    m = c.match(/^\s*([A-Za-z][A-Za-z0-9]*)\s*=\s*Line\(\s*([A-Za-z][A-Za-z0-9]*)\s*,\s*([A-Z]{2})\s*\)$/);
    if (m && m[2].length === 2 && dirLines.length && !defined[m[3]]) { fixedN++; return m[1] + '=Line(' + m[2] + ',' + dirLines[0] + ')'; }
    return c;
  });
  return { cmds: out, fixed: fixedN };
}
// 线段自动补（有 Distance 无 Segment 时补画，勿回退）
function fixSegments(cmds) {
  var out = cmds.slice();
  var joined = cmds.join('\n');
  var added = 0;
  cmds.forEach(function (c) {
    var m = /Distance\(\s*([A-Za-z][A-Za-z0-9]*)\s*,\s*([A-Za-z][A-Za-z0-9]*)\s*\)/.exec(c);
    if (!m) return;
    var X = m[1], Y = m[2];
    var segName = 'seg' + X + Y;
    var hasSeg = out.some(function (x) { return x.indexOf(segName + '=') === 0; });
    if (hasSeg || joined.indexOf('Segment(' + X + ',' + Y + ')') !== -1) return;
    out.push(segName + '=Segment(' + X + ',' + Y + ')');
    out.push('ShowLabel(' + segName + ', false)');
    if (X === 'C' && Y === 'E') { out.push('SetColor(' + segName + ', 0.84, 0.2, 0.2)'); out.push('SetThickness(' + segName + ', 4)'); }
    if (X === 'C' && Y === 'F') { out.push('SetColor(' + segName + ', 0.16, 0.44, 0.86)'); out.push('SetThickness(' + segName + ', 4)'); }
    added++;
  });
  return { cmds: out, added: added };
}
function buildFromJson(json) {
  var api = ggbApi;
  if (!api) throw new Error('GeoGebra 尚未就绪，请稍候');
  var g = json.ggb || {};
  clearConstruct(api);
  var _fix = fixParallelLines([].concat(g.commands || []));
  var _seg = fixSegments(_fix.cmds);
  var cmds = _seg.cmds.concat(g.readouts || []);
  var _note = _seg.added ? _seg.added + ' 处已自动补画线段（Distance 不会自动画图）' : '';
  if (_fix.fixed) _note += (_note ? '；' : '') + _fix.fixed + ' 处平行线写法已自动修正';
  cmds.forEach(function (c) { try { api.evalCommand(c); } catch (e) { console.warn('cmd fail: ' + c, e); } });
  try { api.evalCommand('SetActiveView(1)'); } catch (e) {}
  var view = g.view || {};
  setView(api, view);
  setTimeout(function () { try { setView(api, view); } catch (e) {} }, 800);
  setTimeout(function () { try { setView(api, view); } catch (e) {} }, 2500);
  var note = g.note || '';
  var noteEl = document.getElementById('ggb-note');
  if (noteEl) {
    noteEl.innerHTML = '<b>演示提示：</b>' + esc(note) + (_note ? '（' + esc(_note) + '）' : '');
    noteEl.style.display = note || _note ? 'block' : 'none';
  }
}
function initApplet() {
  var parameters = {
    width: 780, height: 560,
    showToolBar: false, showMenuBar: false, showAlgebraInput: false,
    showResetIcon: true, enableLabelDrags: false, enableShiftDragZoom: true,
    enableRightClick: false, showZoomButtons: false, language: 'zh', capture3DIcons: false,
    appletOnLoad: function (api) {
      ggbApi = api;
      window.ggbApplet = api;
      try { if (typeof api.setErrorDialogsActive === 'function') api.setErrorDialogsActive(false); } catch (e) {}
      // 隐藏左侧代数窗面板（divider 0.4→0，实测生效）→ 绘图视图占满
      try { api.setPerspective(String(api.getPerspectiveXML() || '').replace(/divider="0\.4"/, 'divider="0"')); } catch (e) {}
      setTimeout(function () { try { setView(api, null); } catch (e) {} }, 800);
      setTimeout(function () { try { setView(api, null); } catch (e) {} }, 2500);
      addSys('📐 GeoGebra 画布就绪（工具工作台可用），可开始解题或载入内置演示');
    }
  };
  if (window.GGBApplet) {
    new GGBApplet(parameters, true).inject('ggb-element');
  } else {
    document.getElementById('ggb-element').innerHTML =
      '<p style="padding:24px;color:#d63c3c">GeoGebra 加载失败（deployggb.js 未就绪，网络受限时请稍后重试）</p>';
  }
}

// ── 10. 事件绑定 ────────────────────────────────────────────
document.getElementById('btn-send').addEventListener('click', function () {
  var t = document.getElementById('input-text').value.trim();
  if (!t && !currentImage) { addErr('请上传题目图片或输入题目文字'); return; }
  document.getElementById('input-text').value = '';
  runReAct(t);
});
document.getElementById('input-text').addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('btn-send').click(); }
});
document.getElementById('btn-stop').addEventListener('click', function () {
  if (abortCtrl) { try { abortCtrl.abort(); } catch (e) {} }
});
document.getElementById('btn-clear').addEventListener('click', function () {
  history = []; lastJson = null; currentImage = null;
  chatScroll.innerHTML = '';
  if (ggbApi) { try { clearConstruct(ggbApi); } catch (e) {} }
  document.getElementById('ggb-note').style.display = 'none';
  addSys('🔄 会话已清空');
});

// 内置演示（无 Key 可跑通完整工作流后半段）
var SAMPLE_JSON = {
  "subject":"数学",
  "question":"如图，F 为正方形 ABCD 边 CD 上一点，连接 AC、AF，延长 AF 交 AC 的平行线 DE 于点 E，且 AE=AC，连接 CE。求证：CE=CF。",
  "figureNote":"正方形 ABCD（A 左上、B 左下、C 右下、D 右上），F 在 CD 边上，DE 过 D 且平行于 AC，E 在 AF 延长线上。",
  "solution":[
    "设边长为 a，F=(a, x)，CF=x。DE ∥ AC 且 AC 斜率为 -1，故 DE: y = -X + 2a。",
    "E 在 AF 延长线上：E = (a²/x, 2a - a²/x)。",
    "条件 AE=AC：|AE|² = 2a² → x² + 2ax - 2a² = 0 → x = a(√3-1) ≈ 0.732a。",
    "验证 CE² = ((a²/x-a)² + (2a-a²/x)²) = a²((a-x)²+(2x-a)²)/x²，代入 x=a(√3-1) 化简得 CE² = x²。",
    "故 CE = CF，得证。"
  ],
  "answer":"CE = CF",
  "ggb":{
    "commands":[
      "A=(0,4)","B=(0,0)","C=(4,0)","D=(4,4)",
      "sq=Polygon(A,B,C,D)",
      "gAC=Line(A,C)","segAC=Segment(A,C)",
      "F=Point(Segment(C,D))",
      "F0=Point(Segment(C,D), 0.7320508075688773)",
      "rAF=Ray(A,F)",
      "lDE=Line(D,gAC)",
      "E=Intersect(rAF,lDE)",
      "ce=Segment(C,E)","cf=Segment(C,F)",
      "dCE=Distance(C,E)","dCF=Distance(C,F)",
      "dAE=Distance(A,E)","dAC=Distance(A,C)",
      "SetColor(ce, 0.84, 0.2, 0.2)","SetColor(cf, 0.16, 0.44, 0.86)",
      "SetThickness(ce, 4)","SetThickness(cf, 4)","SetThickness(segAC, 2)",
      "ShowLabel(gAC, false)","ShowLabel(sq, false)","ShowLabel(segAC, false)",
      "ShowLabel(lDE, false)","ShowLabel(rAF, false)","ShowLabel(ce, false)","ShowLabel(cf, false)",
      "SetColor(F0, 0.55, 0.55, 0.55)","SetPointSize(F0, 2)","SetCaption(F0, \"F′\")"
    ],
    "readouts":[
      "T4=Text(If(IsDefined(dAE), If(abs(dAE-dAC)<0.05, \"✓ AE = AC（条件满足）\", \"把 F 拖到 F′\"), \"目标：把 F 拖到灰色 F′\"), (-0.6, 6.1))",
      "T1=Text(If(IsDefined(dCE), \"CE = \" + dCE + \"　CF = \" + dCF, \"先把 F 沿 CD 拖离 C 端\"), (-0.6, 5.1))",
      "T2=Text(If(IsDefined(dAE), \"AE = \" + dAE + \"　AC = \" + dAC, \"\"), (-0.6, 5.6))",
      "T3=Text(If(IsDefined(dCE), If(abs(dCE-dCF)<0.05, \"✓ CE = CF　成立\", \"✗ CE ≠ CF\"), \"拖 F 生成图形\"), (-0.6, 4.6))"
    ],
    "view":{"xmin":-2,"xmax":8},
    "note":"拖动 F（CD 边上的点）沿边滑动：恰在 F′（AE=AC 精确位置）处读数变绿 ✓ CE=CF。"
  }
};
function loadDemo() {
  if (running) return;
  currentImage = null;
  addUser('载入内置演示 JSON（CE=CF 完整示例，无需 API Key）');
  var asst = beginAssistant();
  lastJson = SAMPLE_JSON;
  addSys('📦 已载入演示 JSON → 生成');
  try {
    buildFromJson(SAMPLE_JSON);
    renderJSONBlock(asst, SAMPLE_JSON);
    addSys('✅ 演示已生成：右侧画布可见正方形 + 可拖动 F，左侧为完整解析');
  } catch (e) {
    addErr('生成失败（GeoGebra 尚未就绪？）：' + String(e.message || e));
  }
}
document.getElementById('btn-demo').addEventListener('click', loadDemo);

// ── 11. 设置抽屉 ────────────────────────────────────────────
var drawer = document.getElementById('drawer');
var overlay = document.getElementById('drawer-overlay');
function openDrawer() { drawer.classList.add('open'); overlay.classList.add('open'); }
function closeDrawer() { drawer.classList.remove('open'); overlay.classList.remove('open'); }
document.getElementById('btn-gear').addEventListener('click', openDrawer);
document.getElementById('btn-drawer-close').addEventListener('click', closeDrawer);
overlay.addEventListener('click', closeDrawer);
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });
document.getElementById('btn-load-preset').addEventListener('click', function () {
  loadPreset(document.getElementById('preset').value);
  addSys('⚙ 已载入预设：' + (PRESETS[document.getElementById('preset').value] || {}).note || '');
  saveConfig();
});
['protocol','baseurl','apikey','model','jsonmode'].forEach(function (id) {
  document.getElementById(id).addEventListener('input', saveConfig);
  document.getElementById(id).addEventListener('change', saveConfig);
});
document.getElementById('btn-test-api').addEventListener('click', function () {
  var cfg = getConfig();
  var box = document.getElementById('api-test-result');
  box.style.display = 'block';
  box.className = '';
  box.textContent = '正在测试连接…';
  if (!cfg.baseurl || !cfg.apikey || !cfg.model) {
    box.className = 'err'; box.textContent = '请先填全 Base URL / Key / 模型';
    return;
  }
  fetch(buildRequestUrl(cfg), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apikey },
    body: JSON.stringify({ model: cfg.model, messages: [{ role:'user', content:'ping' }], max_tokens: 8, stream: false })
  }).then(function (r) {
    if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 200)); });
    return r.json();
  }).then(function (j) {
    var okText = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '(无内容)';
    box.className = 'ok';
    box.textContent = '✓ 连接成功：' + (j.model || cfg.model) + ' → ' + String(okText).slice(0, 60);
  }).catch(function (e) {
    box.className = 'err';
    box.textContent = '✗ 连接失败：' + String(e.message || e);
  });
});

initApplet();

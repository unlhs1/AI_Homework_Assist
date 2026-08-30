// ══════════════════════════════════════════════════════════════
// 学生草稿纸引擎（Student Calc）· 纯 JS 无依赖 · 模拟学生手算
//   · 一切结果保持"手写可表达"精确形式：分数 / √k（开不尽保留 √5）/ π / 字母幂
//   · 禁止：通用角三角函数、反三角函数、对数、无穷小数近似当答案
//   · 支持：表达式化简（展开/合并/有理化）、代入、一元一次/二次求根公式、
//           多元线性方程组（高斯消元）、可消元方程组、韦达对称型
// ══════════════════════════════════════════════════════════════
(function (global) {
  'use strict';

  // ---------- 有理数（BigInt 分数） ----------
  function gcbig(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { var t = a % b; a = b; b = t; } return a; }
  function fr(n, d) {
    if (d === undefined) d = 1n; if (n === undefined) n = 0n;
    n = BigInt(n); d = BigInt(d);
    if (d < 0n) { n = -n; d = -d; }
    if (n === 0n) return { n: 0n, d: 1n };
    var g = gcbig(n, d);
    return { n: n / g, d: d / g };
  }
  function frAdd(a, b) { return fr(a.n * b.d + b.n * a.d, a.d * b.d); }
  function frSub(a, b) { return fr(a.n * b.d - b.n * a.d, a.d * b.d); }
  function frMul(a, b) { return fr(a.n * b.n, a.d * b.d); }
  function frDiv(a, b) { if (b.n === 0n) throw new Error('除以 0'); return fr(a.n * b.d, a.d * b.n); }
  function frNeg(a) { return fr(-a.n, a.d); }
  function frAbs(a) { return fr(a.n < 0n ? -a.n : a.n, a.d); }
  function frIsZero(a) { return a.n === 0n; }
  function frStr(a) { return a.d === 1n ? a.n.toString() : (a.n.toString() + '/' + a.d.toString()); }

  // ---------- 数域项 ----------
  // Term = { c:分数, s:根号内被开方数(已无平方因子,1=无), p:π幂, v:{name:int 幂(可负=分母)} }
  function T(c, s, p, v) { return { c: c, s: s || 1, p: p || 0, v: v || {} }; }
  function vCopy(v) { var o = {}; Object.keys(v).forEach(function (k) { o[k] = v[k]; }); return o; }
  function vMul(a, b) {
    var o = vCopy(a);
    Object.keys(b).forEach(function (k) { o[k] = (o[k] || 0) + b[k]; });
    var out = {};
    Object.keys(o).forEach(function (k) { if (o[k] !== 0) out[k] = o[k]; });
    return out;
  }
  function vKey(v) {
    return Object.keys(v).sort().map(function (k) { return k + '^' + v[k]; }).join(',');
  }
  // 分解根号内 k：提出所有平方因子
  function sqfy(k) {
    var out = 1, rest = 1, x = k;
    for (var p = 2; p * p <= x; p++) {
      var e = 0;
      while (x % p === 0) { x = (x / p) | 0; e++; }
      for (var i = 0; i < (e >> 1); i++) out *= p;
      if (e % 2 === 1) rest *= p;
    }
    if (x > 1) rest *= x;
    return { c: fr(out), s: rest };
  }
  function mulS(k1, k2) { return sqfy(k1 * k2); }
  function tKey(t) { return (t.s || 1) + '|' + (t.p || 0) + '|' + vKey(t.v); }
  function tMul(a, b) {
    var s = mulS(a.s, b.s);
    return T(frMul(a.c, frMul1(s.c, b.c)), s.s, a.p + b.p, vMul(a.v, b.v));
  }
  function frMul1(a, b) { return frMul(a, b); }
  function tIsZero(t) { return t.c.n === 0n; }

  // ---------- 表达式 = Term 列表 ----------
  function E(terms) { return { terms: terms || [] }; }
  function eIsZero(e) { return e.terms.length === 0 || e.terms.every(tIsZero); }
  function eConst(n) { return E([T(fr(n), 1, 0, {})]); }
  function eVar(name, pow) { var v = {}; v[name] = pow === undefined ? 1 : pow; return E([T(fr(1), 1, 0, v)]); }
  function eConstCoeff(c) { return E([T(c, 1, 0, {})]); }
  function eNeg(e) { return E(e.terms.map(function (t) { return T(frNeg(t.c), t.s, t.p, vCopy(t.v)); })); }
  function eAdd(a, b) {
    var out = a.terms.map(function (t) { return T(t.c, t.s, t.p, vCopy(t.v)); });
    b.terms.forEach(function (t) {
      var k = tKey(t), hit = null;
      for (var i = 0; i < out.length; i++) { if (tKey(out[i]) === k) { hit = out[i]; break; } }
      if (hit) hit.c = frAdd(hit.c, t.c);
      else out.push(T(t.c, t.s, t.p, vCopy(t.v)));
    });
    return E(out.filter(function (t) { return t.c.n !== 0n; }));
  }
  function eSub(a, b) { return eAdd(a, eNeg(b)); }
  function eMul(a, b) {
    var res = [];
    a.terms.forEach(function (ta) {
      b.terms.forEach(function (tb) {
        var t = tMul(ta, tb);
        var k = tKey(t), hit = null;
        for (var i = 0; i < res.length; i++) { if (tKey(res[i]) === k) { hit = res[i]; break; } }
        if (hit) hit.c = frAdd(hit.c, t.c);
        else res.push(t);
      });
    });
    return E(res.filter(function (t) { return t.c.n !== 0n; }));
  }
  function eScale(e, c) { return eMul(e, eConstCoeff(c)); }
  function ePower(e, n) {
    n = Number(n);
    if (!Number.isInteger(n) || n < 0 || n > 8) throw new Error('幂次超出学生手算范围（仅支持非负整数幂 ≤ 8）');
    var out = eConst(1);
    for (var i = 0; i < n; i++) out = eMul(out, e);
    return out;
  }

  // ---------- 除法（学生手算口径） ----------
  // 分母为"单项式（无根号、无 π、变量幂任意）"或"纯数/根式"→ 可除；
  // 分母为多项式加法 → 报"通分超范围"
  function eDiv(a, b) {
    if (b.terms.length === 0) throw new Error('除以 0');
    if (b.terms.length === 1) {
      var d = b.terms[0];
      if (d.s === 1 && d.p === 0) {
        // 变量变负幂（若有），系数取倒数
        var v = {};
        Object.keys(d.v).forEach(function (k) { v[k] = -d.v[k]; });
        return eMul(a, E([T(fr(d.c.d, d.c.n), 1, 0, v)])); // 系数 1/d.c
      }
      // 1/(c·√k) → (1/c)·√k/k
      if (d.s !== 1 && d.p === 0 && Object.keys(d.v).length === 0) {
        var k = d.s;
        var cInv = fr(d.c.d, d.c.n);
        var num = eMul(a, E([T(cInv, k, 0, {})]));
        return eDiv(num, eConst(k));
      }
      if (d.p !== 0 && Object.keys(d.v).length === 0 && d.s === 1) {
        throw new Error('除以π：学生手算不使用π分母，请先用等价变换去掉π');
      }
    }
    // a + b√k 分母 → 乘共轭有理化
    if (b.terms.length === 2) {
      var t0 = b.terms[0], t1 = b.terms[1];
      if (t0.p === 0 && t1.p === 0 && Object.keys(t0.v).length === 0 && Object.keys(t1.v).length === 0) {
        var conjTerms;
        if ((t0.s === 1) ^ (t1.s === 1)) {
          // 一个是纯数、一个有 √k
          var pure = t0.s === 1 ? t0 : t1;
          var surd = t0.s === 1 ? t1 : t0;
          conjTerms = [T(pure.c, 1, 0, {}), T(frNeg(surd.c), surd.s, 0, {})];
          var conj = E(conjTerms);
          return eDiv(eMul(a, conj), eMul(b, conj));
        }
      }
    }
    throw new Error('分母含多项式/复合式，学生手算无法通分——请先用定理/因式分解消去分母');
  }
  function frInv(x) { return fr(x.d, x.n); }

  // ---------- 解析器 ----------
  function mkParser(s) {
    var i = 0;
    function sp() { while (i < s.length && /\s/.test(s[i])) i++; }
    function peek() { sp(); return s[i]; }
    function isMinus(ch) { return ch === '-' || ch === '−' || ch === '–'; }
    function readNum() {
      sp();
      var neg = false;
      if (isMinus(s[i])) { neg = true; i++; }
      var st = i;
      while (i < s.length && /[0-9.]/.test(s[i])) i++;
      var raw = s.slice(st, i);
      var n;
      if (raw === '') throw new Error('缺少数字');
      if (raw.indexOf('.') >= 0) {
        var parts = raw.split('.');
        n = fr(parts.join(''), '1' + '0'.repeat(parts[1].length));
      } else n = fr(raw);
      return neg ? frNeg(n) : n;
    }
    function readIdent() {
      sp(); var st = i;
      while (i < s.length && /[A-Za-zα-ωΑ-Ω]/.test(s[i])) i++;
      return s.slice(st, i);
    }
    function readSqrtNum() {
      sp(); var st = i;
      while (i < s.length && /[0-9.]/.test(s[i])) i++;
      return fr(s.slice(st, i) || '0');
    }
    // √ 被开方数：支持 √3 / √(3) / sqrt(3) / sqrt 3 写法（模型常见 sqrt( 格式；旧引擎把 sqrt 当变量 → 4*sqrt(3) 算成 12sqrt）
    function readSqrtRadicand() {
      sp();
      if (s[i] === '(') {
        i++;
        var kv = readSqrtNum();
        sp();
        if (s[i] === ')') i++;
        if (Number(kv.n) === 0 && Number(kv.d) === 1) throw new Error('√ 括号内缺少数字，如 √(3) 或 sqrt(3)');
        return kv;
      }
      var kk = readSqrtNum();
      if (Number(kk.n) === 0 && Number(kk.d) === 1) throw new Error('√ 后缺少数字，如 √3 或 sqrt(3)');
      return kk;
    }
    function parseAtom() {
      sp();
      var ch = peek();
      if (ch === '(') { i++; var e = parseAdd(); sp(); if (s[i] === ')') i++; return e; }
      if (isMinus(ch)) { i++; return eNeg(parseAtom()); }
      if (ch === '+') { i++; return parseAtom(); }
      if (/[0-9.]/.test(ch || '')) return eConstCoeff(readNum());
      if (ch === '√') {
        i++;
        var k = readSqrtRadicand();
        var sq = sqfy(Number(k.n) / Number(k.d));
        return E([T(sq.c, sq.s, 0, {})]);
      }
      if (ch === 'π') { i++; return E([T(fr(1), 1, 1, {})]); }
      var id = readIdent();
      if (id === 'pi' || id === 'π') return E([T(fr(1), 1, 1, {})]);
      if (id.toLowerCase() === 'sqrt') {
        var ks = readSqrtRadicand();
        var sqs = sqfy(Number(ks.n) / Number(ks.d));
        return E([T(sqs.c, sqs.s, 0, {})]);
      }
      if (id === 'e') throw new Error('自然常数 e：学生手算不可达，请用分数/√k 表达');
      if (id === 'ln' || id === 'lg' || id === 'log') throw new Error('对数：学生手算不可达（无计算器）');
      if (id === 'arcsin' || id === 'arccos' || id === 'arctan' || id === 'sin^{-1}' || id === 'sin-1')
        throw new Error('反三角函数：学生手算不可达，请改用特殊角/定理');
      if (id === 'sin' || id === 'cos' || id === 'tan' || id === 'cot') {
        sp(); if (s[i] === '(') { i++; var deg = readNum(); sp(); if (s[i] === ')') i++; return trig(id, deg); }
        throw new Error('三角函数缺少角度，如 sin(45)');
      }
      if (id.length === 0) throw new Error('无法解析：' + s.slice(i, i + 12));
      // 变量（可带 ^ 幂，幂可负）
      var p = 1;
      sp();
      if (peek() === '^') {
        i++;
        var pn = readNum();
        var pnV = Number(pn.n) / Number(pn.d);
        if (!Number.isInteger(pnV) || Math.abs(pnV) > 8) throw new Error('幂次超出学生手算范围（整数幂 |p|≤8）');
        p = pnV;
      }
      var v = {}; v[id] = p;
      return E([T(fr(1), 1, 0, v)]);
    }
    function parsePow() {
      var base = parseAtom();
      sp();
      if (peek() === '^') {
        i++;
        var ex = parseAtom(); // 指数只支持原子（整数）
        var exTerms = ex.terms;
        if (exTerms.length !== 1 || exTerms[0].s !== 1 || exTerms[0].p !== 0 || Object.keys(exTerms[0].v).length !== 0)
          throw new Error('指数必须是整数');
        return ePower(base, Number(exTerms[0].c.n) / Number(exTerms[0].c.d));
      }
      return base;
    }
    function startsAtom() {
      sp();
      var ch = s[i];
      if (ch === undefined) return false;
      if (/[0-9.(√]/.test(ch)) return true;
      if (ch === 'π') return true;
      if (/[A-Za-zα-ωΑ-Ω]/.test(ch)) return true;
      return false; // '-'/'+' 一律不隐式乘，留给加减法处理（防 1-2a 被误解析为 1×(-2a)）
    }
    function parseMul() {
      var left = parsePow();
      while (true) {
        sp();
        var ch = peek();
        if (ch === '*' || ch === '×' || ch === '·') { i++; left = eMul(left, parsePow()); }
        else if (ch === '/') { i++; left = eDiv(left, parsePow()); }
        else if (ch === '÷') { i++; left = eDiv(left, parsePow()); }
        else if (startsAtom()) { left = eMul(left, parsePow()); } // 隐式乘法：2x、2(x+1)、(a+b)(c+d)
        else break;
      }
      return left;
    }
    function parseAdd() {
      var left = parseMul();
      while (true) {
        sp();
        var ch = peek();
        if (ch === '+') { i++; left = eAdd(left, parseMul()); }
        else if (isMinus(ch)) { i++; left = eSub(left, parseMul()); }
        else break;
      }
      return left;
    }
    return { parse: parseAdd, pos: function () { return i; }, str: s };
  }
  function trig(fn, deg) {
    var d = (Number(deg.n) / Number(deg.d)) % 360; if (d < 0) d += 360;
    var SIN = { 0: '0', 15: '(√6-√2)/4', 30: '1/2', 45: '√2/2', 60: '√3/2', 75: '(√6+√2)/4', 90: '1',
      105: '(√6+√2)/4', 120: '√3/2', 135: '√2/2', 150: '1/2', 165: '(√6-√2)/4', 180: '0', 210: '-1/2', 225: '-√2/2', 240: '-√3/2', 270: '-1', 300: '-√3/2', 315: '-√2/2', 330: '-1/2', 360: '0' };
    var TAN = { 0: '0', 30: '√3/3', 45: '1', 60: '√3', 90: undefined, 120: '-√3', 135: '-1', 150: '-√3/3', 180: '0', 210: '√3/3', 225: '1', 240: '√3', 270: undefined, 300: '-√3', 315: '-1', 330: '-√3/3', 360: '0' };
    function v(s) { return mkParser(String(s)).parse(); }
    if (fn === 'sin') {
      if (SIN[String(d)] === undefined) throw new Error('sin' + frStr(deg) + '° 学生手算不可达：通用角无精确表值，请改用特殊角或定理');
      return v(SIN[String(d)]);
    }
    if (fn === 'cos') {
      // cos(θ)=sin(90−θ)
      var comp = (90 - d + 360) % 360;
      if (SIN[String(comp)] === undefined) throw new Error('cos' + frStr(deg) + '° 学生手算不可达：通用角无精确表值');
      return v(SIN[String(comp)]);
    }
    if (fn === 'tan') {
      if (TAN[String(d)] === undefined) throw new Error('tan' + frStr(deg) + '° 学生手算不可达：通用角无精确表值');
      return v(TAN[String(d)]);
    }
    throw new Error('cot 超出学生手算范围');
  }

  // ---------- 输出 ----------
  // termStr 输出"无前导符号"的正项文本（负值用 abs 系数，符号由 exprStr 决定）
  function termAbsStr(t) {
    var c = frAbs(t.c);
    var s = '';
    if (t.s !== 1) s += '√' + t.s;
    if (t.p > 0) s += (t.p === 1 ? 'π' : 'π^' + t.p);
    var pos = [], neg = [];
    Object.keys(t.v).forEach(function (k) {
      var p = t.v[k];
      if (p >= 0) pos.push(p === 1 ? k : k + '^' + p);
      else neg.push(p === -1 ? k : k + '^' + (-p));
    });
    var core = s + pos.join('');
    var coefStr = frStr(c);
    if (core === '' && neg.length === 0) return coefStr;
    var body = core + (neg.length ? '/' + neg.join('·') : '');
    if (coefStr === '1') return body;
    if (coefStr === '-1') return body; // 不会发生（abs）
    // 学生手写习惯：√k 前系数为 1/d 时写作 √k/d（如 1/2·√2 → √2/2）；无根号部分时保持分数系数
    if (s !== '' && c.n === 1n && neg.length === 0) {
      return body.split('√')[0] ? body : '√' + t.s + '/' + c.d; // √k/d
    }
    return coefStr + body;
  }
  function exprStr(e) {
    if (!e.terms.length) return '0';
    var terms = e.terms.filter(function (t) { return t.c.n !== 0n; });
    if (!terms.length) return '0';
    var out = terms.map(function (t, i) {
      var s = termAbsStr(t);
      var neg = t.c.n < 0n;
      if (i === 0) return (neg ? '−' : '') + s;
      return (neg ? ' − ' + s : ' + ' + s);
    }).join('');
    return out;
  }

  // 规约：合并同类项 + 去零 + 根式系数融合（(p/q)·√k → 提出平方因子，如 1/2·√2 → √2/2）
  function eCompact(e) {
    var map = {};
    e.terms.forEach(function (t) {
      if (t.c.n === 0n) return;
      var k = tKey(t);
      if (!map[k]) map[k] = T(t.c, t.s, t.p, vCopy(t.v));
      else map[k].c = frAdd(map[k].c, t.c);
    });
    var out = [];
    Object.keys(map).forEach(function (k) {
      var t = map[k];
      if (t.c.n === 0n) return;
      if (t.s !== 1 && t.p === 0 && Object.keys(t.v).length === 0 && t.c.n !== 0n && t.c.d !== 1n) {
        // (n/d)·√k → √(n²k)/d → (a/d)·√b（a=完全平方因子根，b=剩余无平方因子）
        var n2 = Number(t.c.n < 0n ? -t.c.n : t.c.n);
        var kk = n2 * n2 * t.s;
        var sq = sqfy(kk);
        var coefN = BigInt(sq.c.n);                   // a（完全平方开根后的整数，sq.c.d===1）
        var dqB = t.c.d;
        var g = gcbig(coefN, dqB);
        out.push(T(fr(coefN / g, dqB / g), sq.s, t.p, vCopy(t.v)));
        return;
      }
      out.push(t);
    });
    out = out.filter(function (t) { return t.c.n !== 0n; });
    return E(out);
  }

  // ---------- 表达式解析入口 ----------
  function parseE(s) {
    if (typeof s !== 'string' || !s.trim()) throw new Error('空表达式');
    var p = mkParser(s);
    var e = p.parse();
    p.pos(); // 允许尾部空白
    return e;
  }

  // ---------- 代入化简 ----------
  function replaceVar(e, name, sub) {
    var out = [];
    e.terms.forEach(function (t) {
      var p = t.v[name];
      if (!p) { out.push(T(t.c, t.s, t.p, vCopy(t.v))); return; }
      // 去掉该变量，乘 sub^p
      var v = vCopy(t.v); delete v[name];
      var subP = ePower(sub, Math.abs(p));
      if (p < 0) subP = eDiv(eConst(1), subP);
      var unit = E([T(t.c, t.s, t.p, v)]);
      out = out.concat(eMul(unit, subP).terms);
    });
    return eCompact(E(out));
  }

  // ---------- 一元求根（一次/二次，精确根式公式） ----------
  // 返回 [exactStr, exactStr2] 或 null（不可达）
  function powPoly(e, varName) {
    // 按 var 幂分组 → coef[deg] 是不含 var 的 Expr
    var by = {};
    e.terms.forEach(function (t) {
      var p = t.v[varName] || 0;
      var v = vCopy(t.v); delete v[varName];
      var unit = E([T(t.c, t.s, t.p, v)]);
      by[p] = eAdd(by[p] || E([]), unit);
    });
    return by;
  }
  function gcdBigInt(a, b) { return gcbig(a, b); }
  function sqrExpr(e) {
    // 单项式开方：√(c·√k·π^p·v)，返回近似表达式（精确化：c 提出完全平方因子，v 幂折半）
    if (e.terms.length !== 1) throw new Error('判别式含多项，√ 无法手算——请改用定理/构造法');
    var t = e.terms[0];
    // 系数 √c：c=p/q → √(pq)/q
    var c = t.c;
    var absN = c.n < 0n ? -c.n : c.n;
    var sq = sqfy(Number(absN));
    var coefOut = sq.c; // 提出整数部分
    var restN = sq.s; // 根号内剩余
    // 分母处理：√(p/q)=√(pq)/q
    // 简化：√(m/q) = √(mq)/q  —— m 余下部分
    var remNum = restN * Number(c.d);
    var remDen = c.d;
    var sRem = sqfy(remNum);
    coefOut = frMul(coefOut, sRem.c);
    var sqrtInside = sRem.s;
    // v 幂折半
    var v = {};
    var extra = [];
    Object.keys(t.v).forEach(function (k) {
      var p = t.v[k];
      var kk = p / 2, rr = p % 2;
      if (p < 0) throw new Error('判别式含负幂变量，不可手算');
      var ip = Math.floor(p / 2);
      if (ip >= 1) v[k] = ip;
      if (p % 2 === 1) {
        // √(k^1) 保留在根号内：sqrtInside 乘 k？不能（k 是名）—— 输出 √k 分子
        extra.push(k);
        v[k] = (v[k] || 0); // 不提出
      }
    });
    // 若 c 是负数 → 判别式为负（无实数解），提示
    if (c.n < 0n) throw new Error('判别式 < 0：方程无实数解（学生应说明无实根或复数超纲）');
    var coefE = eConstCoeff(frMul(coefOut, fr(1, remDen))); // 先放着
    // 组装：coefOut/remDen × √(sqrtInside) × 变量幂 × (extra 在根号内)
    var parts = [];
    var base = { c: frMul(coefOut, fr(1, remDen)), s: sqrtInside, p: t.p % 2, v: v };
    // extra 变量名的推出（奇数幂 → √VAR 作为根号部分附在表达式里）——学生手算可写 √(8a)=2√(2a)？√(k^1)=√k 不可化简，直接保留在根号里需要根号内能表示变量。简化：报错。
    if (extra.length) throw new Error('判别式含奇数幂变量（如 a^3），学生手算需先提取平方因子后再开方；建议用其他方法');
    var expr = E([base]);
    // 若 t.p 为奇数：√π 保留（罕见）
    if (t.p % 2 === 1) {
      // π^p → π^( (p-1)/2 ) * √π —— 近似视为不可达
      throw new Error('判别式含 π 的奇数幂，不可手算');
    }
    return expr;
  }
  function solveUnary(expr, varName) {
    // 去 varName 幂最高到 2
    var by = powPoly(expr, varName);
    var degs = Object.keys(by);
    if (degs.length === 0) return { ok: true, solutions: ['恒等式（任意该变量均可）'] };
    var maxDeg = Math.max.apply(null, degs.map(Number));
    if (maxDeg > 2) return { ok: false, error: '方程次数>2，超出学生手算范围（仅支持一次/二次求根公式）' };
    var a2 = by['2'] || E([]), a1 = by['1'] || E([]), a0 = by['0'] || E([]);
    if (eIsZero(a2)) {
      if (eIsZero(a1)) return { ok: true, solutions: ['恒等式（任意）'] };
      // x = −a0/a1，尽力精确化（含分数越约）：数值单分母时直接除
      var numL = eNeg(a0), denL = a1;
      if (denL.terms.length === 1 && Object.keys(denL.terms[0].v).length === 0 && denL.terms[0].s === 1 && denL.terms[0].p === 0) {
        var df = denL.terms[0].c;
        var x = eScale(numL, fr(df.d, df.n));
        x = eCompact(x);
        var xs = exprStr(x).replace(/\u2212/g, '-');
        return { ok: true, solutions: [xs], varName: varName };
      }
      return { ok: true, solutions: ['(' + exprStr(numL).replace(/\u2212/g, '-') + ')/(' + exprStr(denL).replace(/\u2212/g, '-') + ')'], varName: varName };
    }
    // 二次：x = (−b ± √(b²−4ac)) / (2a)
    var b = a1, c = a0, a = a2;
    var D = eSub(eMul(b, b), eMul(eConstCoeff(fr(4)), eMul(a, c)));
    var root;
    try { root = sqrExpr(D); }
    catch (err) { return { ok: false, error: String(err.message || err) }; }
    var num1 = eAdd(eNeg(b), root);
    var num2 = eSub(eNeg(b), root);
    var den = eScale(a, fr(2));
    // 学生手写约分：分子/分母提公因式后输出；分母为单项式时把 (k·m)/(k·n) 约成最简
    function fmtFrac(n, d) {
      var ns = exprStr(n).replace(/\u2212/g, '-');
      var ds = exprStr(d).replace(/\u2212/g, '-');
      var nE = eCompact(n), dE = eCompact(d);
      // 简单情况：分母是纯数字/单项式，分子每项的系数与分母有理数部分约分
      if (dE.terms.length === 1 && Object.keys(dE.terms[0].v).length === 0 && dE.terms[0].s === 1 && dE.terms[0].p === 0) {
        var df = dE.terms[0].c;
        var g = df.n !== 0n ? gcbig(df.n, df.d) : 1n;
        var numOut = nE.terms.map(function (t) {
          // 求 t.c 与 df 的 gcd（有理数取交叉 gcd）
          var g1 = gcbig(t.c.n, df.n), g2 = gcbig(t.c.d, df.d);
          var coef = fr(t.c.n / g1, t.c.d / g2);
          var dfNew = fr(df.n / g1, df.d / g2);
          return { c: coef, dfNew: dfNew };
        });
        if (numOut.length && numOut.every(function (x) { return frStr(x.dfNew) === frStr(numOut[0].dfNew); }) && frStr(numOut[0].dfNew) === '1') {
          var e2 = E(numOut.map(function (x) { return T(x.c, nE.terms[numOut.indexOf(x)].s, nE.terms[numOut.indexOf(x)].p, vCopy(nE.terms[numOut.indexOf(x)].v)); }));
          return exprStr(eCompact(e2)).replace(/\u2212/g, '-');
        }
      }
      return '(' + ns + ')/(' + ds + ')';
    }
    return { ok: true, solutions: [fmtFrac(num1, den), fmtFrac(num2, den)], varName: varName };
  }

  // ---------- 方程组 ----------
  // eqs: ["x+y=2","x-y=0"] 或 ["x+y-2","x-y"]（=0 隐含）
  // vars: ["x","y"]
  // 1) 尝试线性化 + 高斯消元；2) 否则尝试从某方程解出某变量代入消元；3) 韦达对称型
  function parseEq(raw) {
    var s = String(raw).replace(/\s+/g, '');
    var eq = s.split('=');
    var lhs, rhs;
    if (eq.length === 2) { lhs = parseE(eq[0]); rhs = parseE(eq[1]); }
    else if (eq.length > 2) throw new Error('等式出现多个 =');
    else { lhs = parseE(s); rhs = E([]); }
    return eSub(lhs, rhs);
  }
  function isLinearOn(e, varName) {
    var ok = true;
    e.terms.forEach(function (t) {
      var p = t.v[varName] || 0;
      if (p > 1) ok = false;
      // var×var 乘积（v 中至少两个 ≥1）→ 非线性
      var npos = 0;
      Object.keys(t.v).forEach(function (k) { if (t.v[k] > 0) npos++; });
      if (npos > 1) ok = false;
      if (Object.keys(t.v).some(function (k) { return t.v[k] < 0; })) ok = false;
    });
    return ok;
  }
  function solveLinearSystem(eqs, vars) {
    // coeff matrix: 各项为分数（线性 ⇒ 每项一个变量幂 =1）
    var n = vars.length, m = eqs.length;
    var M = [];
    for (var r = 0; r < m; r++) {
      var row = [];
      for (var c = 0; c < n; c++) row.push(fr(0));
      var constT = fr(0);
      eqs[r].terms.forEach(function (t) {
        var hit = -1;
        for (var c2 = 0; c2 < n; c2++) { if ((t.v[vars[c2]] || 0) === 1) { hit = c2; break; } }
        if (hit >= 0) row[hit] = frAdd(row[hit], t.c);
        else constT = frAdd(constT, t.c); // 常数项(c 不含变量) → 移到右边
      });
      row.push(frNeg(constT)); // 增广列： rhs = -const
      M.push(row);
    }
    // 高斯消元（分数精确）
    var pivot = [];
    var row = 0;
    for (var col = 0; col < n && row < m; col++) {
      var pr = -1;
      for (var rr = row; rr < m; rr++) if (M[rr][col].n !== 0n) { pr = rr; break; }
      if (pr < 0) continue;
      var tmp = M[row]; M[row] = M[pr]; M[pr] = tmp;
      var piv = M[row][col];
      for (var c3 = 0; c3 <= n; c3++) M[row][c3] = frDiv(M[row][c3], piv);
      for (var r2 = 0; r2 < m; r2++) {
        if (r2 === row || M[r2][col].n === 0n) continue;
        var f = M[r2][col];
        for (var c4 = 0; c4 <= n; c4++) M[r2][c4] = frSub(M[r2][c4], frMul(f, M[row][c4]));
      }
      pivot.push(col);
      row++;
    }
    if (pivot.length < n) return { ok: false, error: '方程组不满秩/有无穷多解，学生手算无法给出唯一解' };
    var sols = {};
    for (var i = 0; i < n; i++) sols[vars[i]] = M[i][n];
    var out = {};
    Object.keys(sols).forEach(function (k) { out[k] = frStr(sols[k]); });
    return { ok: true, solutions: out };
  }
  function trySubstitution(eqs, vars, depth) {
    if (vars.length === 1) return null; // 交给单元求解
    if (depth > vars.length) return null;
    // 找一方程、一变量，该方程对该变量线性且系数非零 → 解出代入
    for (var ei = 0; ei < eqs.length; ei++) {
      var e = eqs[ei];
      for (var vi = 0; vi < vars.length; vi++) {
        var vn = vars[vi];
        var by = powPoly(e, vn);
        var a1 = by['1'], a0 = by['0'];
        if (!a1 || eIsZero(a1)) continue;
        var hasHigher = Object.keys(by).some(function (k) { return Number(k) > 1; });
        if (hasHigher) continue;
        // x = -a0/a1
        var xExpr;
        try { xExpr = eDiv(eNeg(a0), a1); } catch (err) { continue; }
        if (eIsZero(eAdd(by['2'] || E([]), by['1'] || E([])))) continue;
        // 代入其余方程与其余变量（替换 vn）
        var rest = [];
        var restVars = vars.filter(function (v) { return v !== vn; });
        var subOk = true;
        eqs.forEach(function (ee, idx) {
          if (idx === ei) return;
          try { rest.push(replaceVar(ee, vn, xExpr)); } catch (err) { subOk = false; }
        });
        if (!subOk) continue;
        if (restVars.length === 1) {
          var un = solveUnary(rest[0], restVars[0]);
          if (!un.ok || un.solutions.length === 0 || un.solutions[0] === '恒等式（任意该变量均可）') continue;
          // 回代得到 vn
          var sols = [];
          un.solutions.forEach(function (solS) {
            var solE = parseE(solS.replace(/−/g, '-'));
            var vnE = replaceVar(xExpr, restVars[0], solE);
            var so = {}; so[restVars[0]] = solS; so[vn] = exprStr(vnE);
            sols.push(so);
          });
          return { ok: true, solutions: sols };
        }
        // 更多变量：递归
        var sub = trySubstitution(rest, restVars, depth + 1);
        if (sub && sub.ok) {
          var out2 = [];
          sub.solutions.forEach(function (s0) {
            var e2 = xExpr;
            Object.keys(s0).forEach(function (k) { if (k !== vn && restVars.indexOf(k) >= 0) e2 = replaceVar(e2, k, parseE(s0[k].replace(/−/g, '-'))); });
            var s1 = {}; Object.keys(s0).forEach(function (k) { s1[k] = s0[k]; }); s1[vn] = exprStr(e2);
            out2.push(s1);
          });
          return { ok: true, solutions: out2 };
        }
      }
    }
    return null;
  }
  function tryVieta(eqs, vars) {
    // {x+y=s, xy=p}（或加符号变化）→ t²−st+p=0
    if (vars.length !== 2) return null;
    var e0 = eqs[0], e1 = eqs[1];
    function checkPair(a, b) {
      // a: 线性 x+y = s（常数项 s 已到 rhs：a = x+y−s）
      var byX = powPoly(a, vars[0]), byY = powPoly(a, vars[1]);
      var isSum = !eIsZero(byX['1'] || E([])) && !eIsZero(byY['1'] || E([]))
        && eIsZero(byX['2'] || E([])) && eIsZero(byY['2'] || E([]))
        && byX['1'] && byY['1']
        && frAdd(byX['1'].cDiff, byY['1'].cDiff) !== null; // 占位；下方直接判断
      return null;
    }
    // 简判：各方程是否形如 xy−p=0 或 x+y−s=0
    function shape(e, kind) {
      var byX = powPoly(e, vars[0]);
      var byY = powPoly(e, vars[1]);
      var t0 = e.terms[0] || T(fr(0), 1, 0, {});
      if (kind === 'prod') {
        // 单项 xy + 常数
        var has = e.terms.some(function (t) { return (t.v[vars[0]] || 0) === 1 && (t.v[vars[1]] || 0) === 1; });
        var consts = findConst(e);
        if (has && consts !== null && e.terms.every(function (t) {
          return ((t.v[vars[0]] || 0) === 1 && (t.v[vars[1]] || 0) === 1) || (Object.keys(t.v).length === 0 && t.s === 1 && t.p === 0);
        })) {
          return eNeg(consts); // xy = p
        }
        return null;
      }
      if (kind === 'sum') {
        var hasX = e.terms.some(function (t) { return (t.v[vars[0]] || 0) === 1 && Object.keys(t.v).length === 1; });
        var hasY = e.terms.some(function (t) { return (t.v[vars[1]] || 0) === 1 && Object.keys(t.v).length === 1; });
        var consts = findConst(e);
        if (hasX && hasY && consts !== null && e.terms.every(function (t) {
          return ((t.v[vars[0]] || 0) === 1 && Object.keys(t.v).length === 1)
            || ((t.v[vars[1]] || 0) === 1 && Object.keys(t.v).length === 1)
            || (Object.keys(t.v).length === 0 && t.s === 1 && t.p === 0);
        })) {
          return eNeg(consts); // x+y = s（常数移到右侧）
        }
        return null;
      }
      return null;
    }
    function findConst(e) {
      var cs = e.terms.filter(function (t) {
        return Object.keys(t.v).length === 0 && t.s === 1 && t.p === 0;
      });
      if (cs.length === 1) { var c = cs[0].c; return E([T(c, 1, 0, {})]); }
      if (cs.length === 0) return E([]);
      return null;
    }
    var p = shape(e0, 'prod') || shape(e1, 'prod');
    var s = shape(e0, 'sum') || shape(e1, 'sum');
    if (p && s) {
      // t²−s·t+p=0
      var poly = eAdd(ePower(eVar(vars[0], 2), 1), eSub(E([]), eMul(eVar(vars[0]), s)));
      poly = eAdd(poly, p);
      var un = solveUnary(poly, vars[0]);
      if (un.ok && un.solutions.length === 2) {
        // 两组解：{vars[0]=r1, vars[1]=r2} / {vars[0]=r2, vars[1]=r1}
        var r1 = parseE(un.solutions[0].replace(/−/g, '-'));
        var r2 = parseE(un.solutions[1].replace(/−/g, '-'));
        var s1 = {}; s1[vars[0]] = exprStr(r1); s1[vars[1]] = exprStr(r2);
        var s2 = {}; s2[vars[0]] = exprStr(r2); s2[vars[1]] = exprStr(r1);
        return { ok: true, solutions: [s1, s2] };
      }
    }
    return null;
  }
  function solveSystem(eqStrs, vars) {
    try {
      if (!Array.isArray(eqStrs) || eqStrs.length < 1) throw new Error('方程组不能为空');
      if (!Array.isArray(vars) || vars.length < 1) throw new Error('变量列表不能为空');
      var eqs = eqStrs.map(parseEq);
      // 1) 全线性 → 高斯
      var allLinear = true;
      eqs.forEach(function (e) { vars.forEach(function (v) { if (!isLinearOn(e, v)) allLinear = false; }); });
      if (allLinear && eqs.length === vars.length) {
        var lin = solveLinearSystem(eqs, vars);
        if (lin.ok) return { ok: true, solutions: [lin.solutions], method: '线性方程组（高斯消元）' };
      }
      // 2) 韦达对称型
      var vt = tryVieta(eqs, vars);
      if (vt) return { ok: true, solutions: vt.solutions, method: '对称方程组（韦达定理）' };
      // 3) 消元代入
      var sub = trySubstitution(eqs, vars, 0);
      if (sub) return { ok: true, solutions: sub.solutions, method: '代入消元法' };
      // 4) 一元兜底
      if (vars.length === 1 && eqs.length >= 1) {
        var un = solveUnary(eqs[0], vars[0]);
        if (un.ok && un.solutions[0] !== '恒等式（任意该变量均可）')
          return { ok: true, solutions: un.solutions.map(function (s0) { var o = {}; o[vars[0]] = s0; return o; }), method: '一元求根公式' };
      }
      return { ok: false, error: '该方程组形式超出学生手算范围（仅支持：线性方程组/可代入消元/对称韦达/一元一次·二次）' };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  // ---------- 对外 API ----------
  var api = {
    // 表达式化简/精确计算
    calc: function (exprStr0) {
      try {
        var e = eCompact(parseE(exprStr0));
        return { ok: true, exact: exprStr(e), approx: approxOnly(e) };
      } catch (err) {
        return { ok: false, error: String(err.message || err) };
      }
    },
    // 代入 vars = {x: 'a(√3-1)', a: '4'}
    substitute: function (exprStr0, vars) {
      try {
        var e = parseE(exprStr0);
        Object.keys(vars || {}).forEach(function (k) {
          e = replaceVar(e, k, parseE(String(vars[k])));
          e = eMul(eConst(1), e); // 触发合并（该乘法会重排但可能仍不合并同类；用 compact 兜底）
        });
        e = eCompact(e);
        return { ok: true, exact: exprStr(e), approx: approxOnly(e) };
      } catch (err) {
        return { ok: false, error: String(err.message || err) };
      }
    },
    // 一元求根
    solve: function (exprStr0, varName) {
      try {
        var e;
        var s0 = String(exprStr0).replace(/\s+/g, '');
        if (s0.indexOf('=') >= 0) { var pp = s0.split('='); e = eSub(parseE(pp[0]), parseE(pp[1])); }
        else e = parseE(s0);
        var un = solveUnary(e, varName || 'x');
        if (!un.ok) return un;
        return { ok: true, exact: '求解 ' + (varName || 'x') + '：' + un.solutions.map(function (sx) { return (varName || 'x') + ' = ' + sx; }).join('  或  '), solutions: un.solutions };
      } catch (err) {
        return { ok: false, error: String(err.message || err) };
      }
    },
    // 方程组
    system: function (eqs, vars) {
      return solveSystem(eqs, vars);
    }
  };
  // approxOnly：无变量→近似值（仅供验证对照），有变量→null
  function approxOnly(e) {
    var hasVar = false; var val = 0;
    e.terms.forEach(function (t) {
      if (Object.keys(t.v).length) { hasVar = true; return; }
      var v = 1;
      if (t.s !== 1) v *= Math.sqrt(t.s);
      if (t.p) v *= Math.pow(Math.PI, t.p);
      val += (Number(t.c.n) / Number(t.c.d)) * v;
    });
    if (hasVar) return null;
    return Math.round(val * 100000) / 100000;
  }

  global.studentCalc = api;
})(typeof window !== 'undefined' ? window : globalThis);

module.exports = require.cache ? module.exports || {} : {};

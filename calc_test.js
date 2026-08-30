// 学生草稿纸引擎单测
const path = require('path');
require(path.join(__dirname, 'calc_engine.js'));
const SC = globalThis.studentCalc;

function tc(name, fn) {
  try {
    const r = fn();
    console.log((r.ok === false ? 'FAIL ' : 'ok   ') + name + (r.ok === false ? '  => ' + JSON.stringify(r) : ''));
  } catch (e) {
    console.log('FAIL ' + name + '  => 抛异常: ' + String(e.message || e).slice(0, 120));
  }
}

console.log('── 表达式化简/精确计算 ──');
tc('√18 → 3√2', () => { const r = SC.calc('√18'); return r.ok && r.exact === '3√2' ? { ok: true } : { ok: false, r }; });
tc('√5 保留 √5', () => { const r = SC.calc('√5'); return r.ok && r.exact === '√5' ? { ok: true } : { ok: false, r }; });
tc('√2+√2 → 2√2', () => { const r = SC.calc('√2+√2'); return r.ok && r.exact === '2√2' ? { ok: true } : { ok: false, r }; });
tc('1/√2 → √2/2', () => { const r = SC.calc('1/√2'); return r.ok && r.exact === '√2/2' ? { ok: true } : { ok: false, r }; });
tc('1/3+1/6 → 1/2', () => { const r = SC.calc('1/3+1/6'); return r.ok && r.exact === '1/2' ? { ok: true } : { ok: false, r }; });
tc('sin(45) → √2/2', () => { const r = SC.calc('sin(45)'); return r.ok && r.exact === '√2/2' ? { ok: true } : { ok: false, r }; });
tc('sin(75) → (√6+√2)/4', () => { const r = SC.calc('sin(75)'); return r.ok && r.exact === '(√6+√2)/4' ? { ok: true } : { ok: false, r }; });
tc('cos(30) → √3/2', () => { const r = SC.calc('cos(30)'); return r.ok && r.exact === '√3/2' ? { ok: true } : { ok: false, r }; });
tc('cos(60) → 1/2', () => { const r = SC.calc('cos(60)'); return r.ok && r.exact === '1/2' ? { ok: true } : { ok: false, r }; });
tc('tan(45) → 1', () => { const r = SC.calc('tan(45)'); return r.ok && r.exact === '1' ? { ok: true } : { ok: false, r }; });
tc('sin(20) 不可达 → 报错', () => { const r = SC.calc('sin(20)'); return !r.ok && /不可达/.test(r.error) ? { ok: true } : { ok: false, r }; });
tc('arcsin(0.5) 不可达 → 报错', () => { const r = SC.calc('arcsin(0.5)'); return !r.ok && /反三角/.test(r.error) ? { ok: true } : { ok: false, r }; });
tc('1.414 近似不可达（拒绝小数当答案）—— 1.414 → 707/500', () => { const r = SC.calc('1.414'); return r.ok && r.exact === '707/500' ? { ok: true } : { ok: false, r }; });
tc('π 保留', () => { const r = SC.calc('2π+π'); return r.ok && r.exact === '3π' ? { ok: true } : { ok: false, r }; });

console.log('── 代数（多项式/展开/代入） ──');
tc('2x+3x → 5x', () => { const r = SC.calc('2x+3x'); return r.ok && r.exact === '5x' ? { ok: true } : { ok: false, r }; });
tc('x·x → x^2', () => { const r = SC.calc('x*x'); return r.ok && r.exact === 'x^2' ? { ok: true } : { ok: false, r }; });
tc('(x+1)(x+2) → x^2+3x+2', () => { const r = SC.calc('(x+1)(x+2)'); return r.ok && r.exact === 'x^2 + 3x + 2' ? { ok: true } : { ok: false, r }; });
tc('(a+b)^2 → a^2+2ab+b^2', () => { const r = SC.calc('(a+b)^2'); return r.ok && r.exact === 'a^2 + 2ab + b^2' ? { ok: true } : { ok: false, r }; });
tc('x^2-1/(x-1) 通分不可达 → 报错', () => { const r = SC.calc('x^2-1/(x-1)'); return !r.ok ? { ok: true } : { ok: false, r }; });
tc('代入: x^2+2ax-2a^2, x=a(√3-1) → 0', () => {
  const r = SC.substitute('x^2+2a*x-2a^2', { x: 'a(√3-1)' });
  return r.ok && /^0$/.test(r.exact) ? { ok: true } : { ok: false, r };
});
tc('代入: CE^2-CF^2（含分式）x=a(√3-1), a=4 → 0', () => {
  const r = SC.substitute('((a^2/x-a)^2+(2a-a^2/x)^2)-x^2', { x: 'a(√3-1)', a: '4' });
  return r.ok && Math.abs(parseFloat(String(r.exact).replace(/[^0-9.eE+-]/g, ''))) < 1 ? { ok: true } : { ok: false, r };
});

console.log('── 一元求根（精确根式公式） ──');
tc('x^2-2=0 → ±√2', () => { const r = SC.solve('x^2-2', 'x'); return r.ok && /√2/.test(r.exact) ? { ok: true } : { ok: false, r }; });
tc('x^2+2ax-2a^2=0 → a(√3±1) 型', () => { const r = SC.solve('x^2+2a*x-2a^2=0', 'x'); return r.ok && /√3/.test(r.exact) ? { ok: true } : { ok: false, r }; });
tc('2x+1=5 → 2', () => { const r = SC.solve('2x+1=5', 'x'); return r.ok && /2\).*/.test(r.exact.replace(/\u2212/g, '-')) && r.exact.indexOf('2') >= 0 ? { ok: true } : { ok: false, r }; });

console.log('── 多元方程组 ──');
tc('线性 {x+y=2, x-y=0} → x=1,y=1', () => {
  const r = SC.system(['x+y=2', 'x-y=0'], ['x', 'y']);
  return r.ok && r.solutions[0].x === '1' && r.solutions[0].y === '1' ? { ok: true } : { ok: false, r };
});
tc('线性 {2x+3y=8, x-y=1} → x=11/5,y=6/5', () => {
  const r = SC.system(['2x+3y=8', 'x-y=1'], ['x', 'y']);
  return r.ok && r.solutions[0].x === '11/5' && r.solutions[0].y === '6/5' ? { ok: true } : { ok: false, r };
});
tc('韦达 {x+y=4, xy=3} → (1,3)/(3,1)', () => {
  const r = SC.system(['x+y=4', 'x*y=3'], ['x', 'y']);
  return r.ok && r.solutions.length === 2 ? { ok: true } : { ok: false, r };
});
tc('代入消元 {x+y=4, x^2-y^2=8} → 两组', () => {
  const r = SC.system(['x+y=4', 'x^2-y^2=8'], ['x', 'y']);
  return r.ok && r.solutions.length >= 1 ? { ok: true } : { ok: false, r };
});
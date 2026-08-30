// 从页面提取并回归学生草稿纸引擎
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('ai/index.html', 'utf8');
const startMark = '(function (global) {';
const start = html.indexOf(startMark);
if (start === -1) { console.log('engine not found'); process.exit(1); }
// 括号配对：找到匹配的 })(
let depth = 0, i = start, inStr = null, esc = false;
for (; i < html.length; i++) {
  const c = html[i];
  if (inStr) {
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === inStr) inStr = null;
    continue;
  }
  if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
  if (c === '(' || c === '{' || c === '[') depth++;
  else if (c === ')' || c === '}' || c === ']') {
    depth--;
    if (depth === 0 && c === ')') { i++; break; }
  }
}
// 也需包含结尾的 (window/globalThis) 调用: 找到第一个 ';' 后结束
let end = html.indexOf(';', i);
if (end === -1) end = i;
const source = html.slice(start, end + 1);
const sandbox = { window: {}, globalThis: null };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const SC = sandbox.window.studentCalc;

const cases = [
  ['√18', '3√2'], ['√5', '√5'], ['1/√2', '√2/2'], ['sin(45)', '√2/2'],
  ['sin(75)', '√6/4 + √2/4'], ['(x+1)(x+2)', 'x^2 + 3x + 2'],
  ['2x+3x', '5x'], ['1/3+1/6', '1/2'], ['3/4√8', '3/2√2']
];
let pass = 0;
cases.forEach(function (c) {
  const r = SC.calc(c[0]);
  const ok = r.ok && r.exact === c[1];
  if (ok) pass++;
  console.log((ok ? 'ok  ' : 'FAIL') + ' ' + c[0] + ' → ' + JSON.stringify(r.exact) + (ok ? '' : ' (期望 ' + c[1] + ')'));
});
console.log('--- solve/system ---');
console.log(JSON.stringify(SC.solve('x^2+2a*x-2a^2=0', 'x')));
console.log(JSON.stringify(SC.system(['x+y=2', 'x-y=0'], ['x', 'y'])));
console.log(JSON.stringify(SC.system(['x+y=4', 'x*y=3'], ['x', 'y'])));
console.log(JSON.stringify(SC.substitute('x^2+2a*x-2a^2', { x: 'a(√3-1)' })));
console.log('PASS ' + pass + '/' + cases.length);
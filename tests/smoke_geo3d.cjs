// geo3d v2 冒烟测试（node，无渲染——run() 的状态与文案逻辑 + PURE 纯数学回归）
const g = require('E:/Applications/Claude_Code/logs/AI_Homework_Assist/assets/geo3d.js');
let pass = 0, fail = 0;
function T(name, ok, detail) { if (ok) { pass++; console.log('PASS ' + name + (detail ? '  | ' + detail : '')); } else { fail++; console.log('FAIL ' + name + (detail ? '  | ' + detail : '')); } }

// T1 双重序列化字符串参数（本次 bug 现场：verts/faces 被模型 stringify 成字符串）
const verts17 = [{ n: 'A', p: [0, 0, 0] }, { n: 'B', p: [1.5, 0.866, 0] }, { n: 'C', p: [2, 0, 0] }, { n: 'D', p: [1.5, -0.866, 0] }, { n: 'P', p: [0, 0, 2] }];
const faces17 = [['A', 'B', 'C', 'D'], ['P', 'A', 'B'], ['P', 'B', 'C'], ['P', 'C', 'D'], ['P', 'D', 'A']];
const r1 = g.run(JSON.stringify({ action: 'solid', kind: 'poly', verts: JSON.stringify(verts17), faces: JSON.stringify(faces17), palette: ['#cfe3ff', '#ffe0b3', '#d6f5d6', '#ffd6e7', '#e0d6ff'] }));
T('T1 double-stringified poly', r1.ok === true && /已构建/.test(r1.result), String(r1.result).slice(0, 70));

// T2 faces 对象形式（命名 + 单面色）
const r2 = g.run(JSON.stringify({ action: 'solid', kind: 'poly', verts: verts17, faces: [{ v: ['A', 'B', 'C', 'D'], name: '底面', color: '#cfe3ff' }, { v: ['P', 'A', 'B'], name: '侧面PAB' }, { v: ['P', 'B', 'C'], name: '侧面PBC' }, { v: ['P', 'C', 'D'], name: '侧面PCD' }, { v: ['P', 'D', 'A'], name: '侧面PDA' }] }));
T('T2 face objects named+colored', r2.ok === true, String(r2.result).slice(0, 70));

// T3 缺 faces → 友好报错
const r3 = g.run(JSON.stringify({ action: 'solid', kind: 'poly', verts: verts17 }));
T('T3 missing faces error', r3.ok === false && /verts/.test(r3.result), String(r3.result).slice(0, 70));

// T4 无效顶点引用 → 报错不崩溃
const r4 = g.run(JSON.stringify({ action: 'solid', kind: 'poly', verts: [{ n: 'A', p: [0, 0, 0] }, { n: 'B', p: [1, 0, 0] }], faces: [['A', 'B', 'X']] }));
T('T4 bad vertex ref error', r4.ok === false && /无效/.test(r4.result), String(r4.result).slice(0, 70));

// T5 add 虚线段（字符串坐标也兜底）
const r5 = g.run(JSON.stringify({ action: 'add', kind: 'segment', from: [0, 0, 0], to: [0, 0, 2], dashed: true, label: 'PA' }));
T('T5 add dashed segment', r5.ok === true && /虚线段/.test(r5.result), String(r5.result).slice(0, 70));

// T6 add polygon（verts 双重序列化兜底）
const r6 = g.run(JSON.stringify({ action: 'add', kind: 'polygon', verts: JSON.stringify([[0, 0, 0], [1, 0, 0], [0, 1, 0]]) }));
T('T6 add polygon stringified', r6.ok === true && /多边形/.test(r6.result), String(r6.result).slice(0, 70));

// T7 add 非法参数 → 报错带用法
const r7 = g.run(JSON.stringify({ action: 'add', kind: 'circle' }));
T('T7 add invalid kind error', r7.ok === false && /add 参数无效/.test(r7.result), String(r7.result).slice(0, 70));

// T8 索引式 poly（旧写法回归）
const r8 = g.run(JSON.stringify({ action: 'solid', kind: 'poly', verts: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], faces: [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]] }));
T('T8 index-style poly', r8.ok === true, String(r8.result).slice(0, 70));

// T9 clear
const r9 = g.run(JSON.stringify({ action: 'clear' }));
T('T9 clear overlay', r9.ok === true && /已清除/.test(r9.result), String(r9.result).slice(0, 50));

// T10 PURE reach 回归：基准白顶·绿右·黑前 可达
const base = { colors: { '+X': '绿', '-X': '黄', '+Y': '白', '-Y': '蓝', '+Z': '黑', '-Z': '红' } };
T('T10 PURE reach 白绿黑', g.PURE.reachForSolid(base, '白', '绿', '黑').reachable === true);
// T11 PURE mirror 回归：图3 黄顶·白右·红前 = 镜像
const m11 = g.PURE.reachForSolid(base, '黄', '白', '红');
T('T11 PURE mirror 黄白红', m11.reachable === false && m11.correctedFront === '黑', '更正前=黑');

// T12 未知 action 报错（含 add/clear 提示）
const r12 = g.run(JSON.stringify({ action: 'fly' }));
T('T12 unknown action', r12.ok === false && /add/.test(r12.result), String(r12.result).slice(0, 70));

console.log('\n== geo3d smoke: ' + pass + ' pass / ' + fail + ' fail ==');
process.exit(fail ? 1 : 0);

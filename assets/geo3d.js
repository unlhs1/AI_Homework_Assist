/* ============================================================
 * geo3d.js —— AI_Homework_Assist 的通用 3D 立体几何能力
 * 用途：立体几何上色 / 三视图 / 相对面 / 相邻面 / 镜像(手性)矛盾检测
 *
 * 结构：
 *   1) PURE        —— 纯几何数学（不依赖 three.js / DOM），可在 node 单测
 *   2) View        —— three.js 彩色立体可视化（懒初始化，browser-only）
 *   3) run(args)   —— geo3d 工具入口（ReAct 循环按 action 分发）
 *
 * 面局部轴（-1..1 立方体）：+X/-X/+Y/-Y/+Z/-Z
 * 基准(图1参考)着色：+X绿 -X黄 +Y白 -Y蓝 +Z黑 -Z红   （白上、绿右、黑前）
 * ============================================================ */
(function (global) {
  'use strict';

  // ---------- 1. 纯几何数学 ----------
  var AXES = [ // [key, normal]
    ['+X', [1, 0, 0]], ['-X', [-1, 0, 0]],
    ['+Y', [0, 1, 0]], ['-Y', [0, -1, 0]],
    ['+Z', [0, 0, 1]], ['-Z', [0, 0, -1]]
  ];
  // 基准(图1)着色：face key -> 颜色名
  var REF_COLORS = { '+X': '绿', '-X': '黄', '+Y': '白', '-Y': '蓝', '+Z': '黑', '-Z': '红' };
  var OPP = { '+X': '-X', '-X': '+X', '+Y': '-Y', '-Y': '+Y', '+Z': '-Z', '-Z': '+Z' };

  function norm(key) { for (var i = 0; i < AXES.length; i++) if (AXES[i][0] === key) return AXES[i][1]; return [0, 0, 0]; }
  function det3(m) {
    return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
         - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
         + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  }
  // 由颜色名找当前 solid 的面 key；无 solid 时用基准着色
  function keyOf(solid, label) {
    var map = (solid && solid.labelToKey) || refLabelToKey();
    for (var k in map) if (map[k] === label) return k;
    return null;
  }
  function refLabelToKey() { var m = {}; for (var k in REF_COLORS) m[k] = REF_COLORS[k]; return m; }
  function labelToKeyFrom(colors) {
    var m = {}; for (var k in colors) m[k] = colors[k]; return m;
  }
  function allLabels(solid, colors) {
    var c = colors || (solid && solid.colors) || REF_COLORS;
    var o = {};
    for (var k in c) o[k] = c[k];
    return o;
  }

  // 判定 (top,right,front) 三个颜色能否由同一正方体旋转得到（非镜像）
  // 规则：可达 ⟺ det([n_top, n_right, n_front]) < 0（因其目标 (顶右前)=(0,1,0),(1,0,0),(0,0,1) 行列式=-1）
  function reachForSolid(solid, top, right, front) {
    var kT = keyOf(solid, top), kR = keyOf(solid, right), kF = keyOf(solid, front);
    if (!kT || !kR || !kF) return { ok: false, error: '颜色标签不在当前 solid 上: ' + [top, right, front].join('/') };
    var nT = norm(kT), nR = norm(kR), nF = norm(kF);
    var L = [nT, nR, nF]; // 列 = n_top,n_right,n_front
    var detL = det3([ [nT[0], nR[0], nF[0]], [nT[1], nR[1], nF[1]], [nT[2], nR[2], nF[2]] ]);
    var reachable = detL < 0;           // det(R) = -det(L) > 0
    if (reachable) {
      return { ok: true, reachable: true, det: detL,
        top: top, right: right, front: front,
        reason: '可达：该（顶/右/前）环绕次序是右手系，可由同一正方体转出' };
    }
    // 镜像：保持 top/right，front 改为对面轴的那张面即可翻转为非镜像
    var fixedFront = OPPLabel(solid, kF);
    return { ok: true, reachable: false, det: detL,
      top: top, right: right, front: front,
      correctedTop: top, correctedRight: right, correctedFront: fixedFront,
      reason: '镜像(手性)冲突：这个（顶/右/前）环绕次序是左手系，一块真实正方体旋转不出来。'
            + ' 保持「' + top + '顶·' + right + '右」时，前面只能是「' + fixedFront + '」而不是「' + front + '」。' };
  }
  function OPPLabel(solid, key) { var c = allLabels(solid); return c[OPP[key]]; }

  // 相对面（三对）
  function opposites(solid) {
    var c = allLabels(solid), pairs = [];
    var seen = {};
    for (var k in c) {
      var o = OPP[k];
      if (!seen[k] && !seen[o]) { pairs.push({ a: c[k], b: c[o] }); seen[k] = seen[o] = true; }
    }
    return pairs;
  }
  // 相邻面（两非相对面必相邻，即共棱）
  function adjacent(solid, label) {
    var k = keyOf(solid, label), c = allLabels(solid), arr = [];
    for (var kk in c) if (kk !== k && kk !== OPP[k]) arr.push(c[kk]);
    return { face: label, adjacentTo: arr };
  }

  // 由 non-mirror 的 (top,right,front) 键构造旋转四元数（用列向量做 3x3，返回 [m] 供 three 用）
  // 返回：世界方向 = R · 局部法向量。colX/colY/colZ = R 作用在局部 X/Y/Z 上的像。
  function buildRotation(cols) { // cols = {top,right,front} 为 face key 的局部法向量
    var nT = norm(cols.top), nR = norm(cols.right), nF = norm(cols.front);
    // 目标：R·nT=(0,1,0), R·nR=(1,0,0), R·nF=(0,0,1)。用 L 求逆：R = G·L^{-1}, L 正交 => L^{-1}=L^T
    // G 的列 = (0,1,0),(1,0,0),(0,0,1)
    var L = [ [nT[0], nR[0], nF[0]], [nT[1], nR[1], nF[1]], [nT[2], nR[2], nF[2]] ]; // L 列 = n
    // L^T
    var Lt = [ [L[0][0], L[1][0], L[2][0]], [L[0][1], L[1][1], L[2][1]], [L[0][2], L[1][2], L[2][2]] ];
    // G 的列 = (0,1,0),(1,0,0),(0,0,1) → G 矩阵 = [[0,1,0],[1,0,0],[0,0,1]]
    var G = [ [0, 1, 0], [1, 0, 0], [0, 0, 1] ];
    var R = mul3(G, Lt);
    return R;
  }
  function mul3(A, B) {
    var C = [ [0, 0, 0], [0, 0, 0], [0, 0, 0] ];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) for (var k = 0; k < 3; k++) C[i][j] += A[i][k] * B[k][j];
    return C;
  }
  function rotInOrder(keys) { // keys=[top,right,front] face keys（须为非镜像）
    var R = buildRotation({ top: keys[0], right: keys[1], front: keys[2] });
    // R 列 = 局部 X/Y/Z 的世界像（makeBasis 用）
    return [ [R[0][0], R[1][0], R[2][0]], [R[0][1], R[1][1], R[2][1]], [R[0][2], R[1][2], R[2][2]] ];
  }

  var PURE = { AXES, REF_COLORS, OPP, norm, det3, reachForSolid, opposites, adjacent, buildRotation, rotInOrder, labelToKeyFrom, allLabels };

  // ---------- 2. three.js 彩色立体可视化 ----------
  var viewer = null;
  var solidState = { colors: null };   // face key -> 颜色名
  var currentQuat = null;

  function hexOf(label) {
    var H = { 黑: '#26282b', 白: '#f6f7f8', 绿: '#3f9b57', 红: '#d83a34', 蓝: '#3f7fc4', 黄: '#f2c026' };
    return H[label] || '#9aa0a6';
  }
  function textColor(label) { return (label === '白' || label === '黄') ? '#333' : '#fff'; }

  function initViewer() {
    if (viewer || !global.THREE) return viewer;
    var el = document.getElementById('geo3d-element');
    if (!el) return viewer;
    var scene = new THREE.Scene();
    var W = el.clientWidth || 460, H = el.clientHeight || 420;
    var camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);
    camera.position.set(3.4, 3.1, 4.4); camera.lookAt(0, 0, 0);
    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H); renderer.setPixelRatio(global.devicePixelRatio || 1);
    el.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    var dl = new THREE.DirectionalLight(0xffffff, 0.7); dl.position.set(3, 4, 5); scene.add(dl);
    var dl2 = new THREE.DirectionalLight(0xffffff, 0.35); dl2.position.set(-4, -2, -3); scene.add(dl2);
    var group = new THREE.Group(); scene.add(group);
    var camDist = 5.9;
    viewer = { scene, camera, renderer, group, el, camDist };
    // 拖动旋转 + 滚轮缩放
    var dragging = false, lx = 0, ly = 0;
    var cvEl = renderer.domElement;
    cvEl.addEventListener('pointerdown', function (e) { dragging = true; lx = e.clientX; ly = e.clientY; cvEl.setPointerCapture(e.pointerId); });
    cvEl.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = (e.clientX - lx) * 0.006, dy = (e.clientY - ly) * 0.006; lx = e.clientX; ly = e.clientY;
      var qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx);
      var qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy);
      group.quaternion.premultiply(qy).premultiply(qx); renderViewer();
    });
    cvEl.addEventListener('pointerup', function () { dragging = false; });
    cvEl.addEventListener('wheel', function (e) { e.preventDefault(); viewer.camDist = Math.max(3, Math.min(10, viewer.camDist + e.deltaY * 0.004)); applyCam(); renderViewer(); }, { passive: false });
    function applyCam() { camera.position.copy(new THREE.Vector3(3.4, 3.1, 4.4).normalize().multiplyScalar(viewer.camDist)); camera.lookAt(0, 0, 0); }
    return viewer;
  }
  function renderViewer() { if (viewer) { viewer.renderer.render(viewer.scene, viewer.camera); } }

  function makeLabelMat(text) {
    var cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
    var c = cv.getContext('2d'); c.clearRect(0, 0, 256, 128);
    c.fillStyle = 'rgba(255,255,255,0)'; c.font = 'bold 66px "Microsoft YaHei",sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.strokeStyle = 'rgba(30,45,60,0.9)'; c.lineWidth = 8; c.lineJoin = 'round'; c.strokeText(text, 128, 64);
    c.fillStyle = 'rgba(255,255,255,0.92)'; c.fillText(text, 128, 64);
    return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, side: THREE.DoubleSide, depthWrite: false });
  }

  var FACE_KEYS = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];
  function buildSolidView() {
    if (!viewer) return;
    while (viewer.group.children.length) viewer.group.remove(viewer.group.children[0]);
    var colors = solidState.colors || REF_COLORS;
    var HALF = 1.0;
    var mats = FACE_KEYS.map(function (k) {
      return new THREE.MeshPhongMaterial({ color: hexOf(colors[k] || '#999'), transparent: true, opacity: 0.96, side: THREE.DoubleSide });
    });
    var box = new THREE.Mesh(new THREE.BoxGeometry(2 * HALF, 2 * HALF, 2 * HALF), mats);
    viewer.group.add(box);
    var edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(2 * HALF, 2 * HALF, 2 * HALF)),
      new THREE.LineBasicMaterial({ color: 0x1c2b36, linewidth: 1.4 }));
    viewer.group.add(edge);
    FACE_KEYS.forEach(function (k) {
      var n = norm(k);
      var mat = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), makeLabelMat(colors[k] || ''));
      mat.position.set(n[0] * (HALF + 0.03), n[1] * (HALF + 0.03), n[2] * (HALF + 0.03));
      mat.lookAt(new THREE.Vector3(n[0] * (HALF + 1.2), n[1] * (HALF + 1.2), n[2] * (HALF + 1.2)));
      viewer.group.add(mat);
    });
    if (currentQuat) viewer.group.quaternion.copy(currentQuat);
    renderViewer();
  }
  function orientTo(keys) { // keys=[top,right,front] face keys（非镜像）
    var cols = rotInOrder(keys);
    var m = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(cols[0][0], cols[0][1], cols[0][2]),
      new THREE.Vector3(cols[1][0], cols[1][1], cols[1][2]),
      new THREE.Vector3(cols[2][0], cols[2][1], cols[2][2]));
    currentQuat = new THREE.Quaternion().setFromRotationMatrix(m);
    if (viewer && viewer.group) { viewer.group.quaternion.copy(currentQuat); renderViewer(); }
  }

  // ---------- 3. run() —— geo3d 工具入口 ----------
  function run(argsStr) {
    var args; try { args = JSON.parse(argsStr || '{}'); } catch (e) { return { ok: false, result: 'geo3d 参数 JSON 解析失败: ' + e.message }; }
    var action = args.action || 'query';
    var out;
    if (action === 'solid') {
      // 设定立方体六面着色：接收 top/right/front/bottom/left/back 颜色名；未指定面用「尚未占用」的基准色补齐（保证六色互异）
      var setK = { top: '+Y', bottom: '-Y', right: '+X', left: '-X', front: '+Z', back: '-Z' };
      var explicit = {}, used = {};
      Object.keys(setK).forEach(function (side) {
        if (args[side] != null) { var k = setK[side], v = String(args[side]); explicit[k] = v; used[v] = true; }
      });
      var c = {};
      var pool = FACE_KEYS.map(function (k) { return REF_COLORS[k]; });
      var pi = 0;
      FACE_KEYS.forEach(function (k) {
        if (explicit[k]) { c[k] = explicit[k]; }
        else {
          while (pi < pool.length && used[pool[pi]]) pi++;
          var v = pi < pool.length ? pool[pi] : ('c' + (pi + 1));
          pi++; c[k] = v; used[v] = true;
        }
      });
      solidState.colors = c;
      solidState.labelToKey = {};
      Object.keys(c).forEach(function (k) { solidState.labelToKey[c[k]] = k; });
      if (viewer) buildSolidView();
      out = '已设定正方体六面着色：'
        + '顶=' + c['+Y'] + '，底=' + c['-Y'] + '，右=' + c['+X'] + '，左=' + c['-X'] + '，前=' + c['+Z'] + '，后=' + c['-Z'];
    } else if (action === 'view' || action === 'orient') {
      var r = reachForSolid(solidState, args.top, args.right, args.front);
      if (!r.ok) return { ok: false, result: r.error };
      if (r.reachable) {
        orientTo([keyOf(solidState, r.top), keyOf(solidState, r.right), keyOf(solidState, r.front)]);
        out = '✓ 已旋转到该视角：顶=' + r.top + '，右=' + r.right + '，前=' + r.front + '（' + r.reason + '）';
      } else {
        orientTo([keyOf(solidState, r.correctedTop), keyOf(solidState, r.correctedRight), keyOf(solidState, r.correctedFront)]);
        out = '⚠️ ' + r.reason + '；已自动转成可达的更正视角（顶=' + r.correctedTop + '，右=' + r.correctedRight + '，前=' + r.correctedFront + '）';
      }
    } else if (action === 'reach') {
      var r2 = reachForSolid(solidState, args.top, args.right, args.front);
      if (!r2.ok) return { ok: false, result: r2.error };
      out = r2.reachable
        ? ('✓ 可达：' + r2.top + '顶·' + r2.right + '右·' + r2.front + '前（行列式=' + r2.det.toFixed(0) + '，右手系）')
        : ('✗ 镜像：' + r2.top + '顶·' + r2.right + '右·' + r2.front + '前 是左手系（行列式=' + r2.det.toFixed(0) + '），同一正方体转不出来。更正应为 ' + r2.correctedTop + '顶·' + r2.correctedRight + '右·' + r2.correctedFront + '前');
    } else if (action === 'query') {
      var opp = opposites(solidState).map(function (p) { return p.a + '↔' + p.b; }).join('，');
      var cNow = solidState.colors || REF_COLORS;
      var viewNow = '{顶=' + cNow['+Y'] + '，右=' + cNow['+X'] + '，前=' + cNow['+Z'] + '}';
      out = '正方体当前着色：' + viewNow
        + '；相对面（唯一）：' + opp
        + '；每面颜色：' + FACE_KEYS.map(function (k) { return k.replace('+', '').replace('-', '-') + ':' + cNow[k]; }).join(' ');
    } else if (action === 'reset') {
      solidState.colors = null; solidState.labelToKey = null; currentQuat = null;
      if (viewer) { buildSolidView(); }
      out = '已重置为基准着色（顶=白，右=绿，前=黑）与基准朝向';
    } else {
      return { ok: false, result: '未知 geo3d action: ' + action + '（可选 solid / view / reach / query / reset）' };
    }
    return { ok: true, result: '🧊 Geo3D · ' + out };
  }

  var api = { run: run, initViewer: initViewer, refreshView: buildSolidView, orientTo: orientTo, PURE: PURE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.geo3d = api;
})(typeof window !== 'undefined' ? window : globalThis);

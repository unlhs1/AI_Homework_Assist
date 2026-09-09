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
  var PALETTE = ['#e05a4e', '#4e9be0', '#4ec06a', '#f0c341', '#9a6ee0', '#e08a4e', '#4ed6c0', '#c04e9b', '#8a8f98', '#4e6a9b'];
  // 常见可上色立体的面定义（顶点数组 + 面名；坐标 Y 为上）。每个面独立成片，可各自上色 + 贴面名标签。
  function SOLID_FACES(kind) {
    if (kind === 'prism') {          // 三棱柱
      return [
        { name: '下底面', verts: [[-1, 0, -1], [1, 0, -1], [0, 0, 1.3]] },
        { name: '上底面', verts: [[-1, 2, -1], [0, 2, 1.3], [1, 2, -1]] },
        { name: '前面', verts: [[-1, 0, -1], [0, 0, 1.3], [0, 2, 1.3], [-1, 2, -1]] },
        { name: '右面', verts: [[1, 0, -1], [0, 0, 1.3], [0, 2, 1.3], [1, 2, -1]] },
        { name: '后面', verts: [[-1, 0, -1], [1, 0, -1], [1, 2, -1], [-1, 2, -1]] }
      ];
    }
    if (kind === 'pyramid') {        // 四棱锥
      return [
        { name: '底面', verts: [[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1]] },
        { name: '前侧面', verts: [[-1, 0, 1], [1, 0, 1], [0, 2.3, 0]] },
        { name: '右侧面', verts: [[1, 0, -1], [1, 0, 1], [0, 2.3, 0]] },
        { name: '后侧面', verts: [[1, 0, -1], [-1, 0, -1], [0, 2.3, 0]] },
        { name: '左侧面', verts: [[-1, 0, -1], [-1, 0, 1], [0, 2.3, 0]] }
      ];
    }
    if (kind === 'tetrahedron') {    // 四面体
      return [
        { name: '底面', verts: [[-1, -0.6, -0.9], [1, -0.6, -0.9], [0, -0.6, 1.2]] },
        { name: '前面', verts: [[-1, -0.6, -0.9], [0, -0.6, 1.2], [0, 1.6, 0]] },
        { name: '后面', verts: [[1, -0.6, -0.9], [-1, -0.6, -0.9], [0, 1.6, 0]] },
        { name: '右面', verts: [[1, -0.6, -0.9], [0, -0.6, 1.2], [0, 1.6, 0]] }
      ];
    }
    return null;
  }
  function triList(verts) { var o = []; for (var i = 1; i < verts.length - 1; i++) o.push([verts[0], verts[i], verts[i + 1]]); return o; }
  function faceCentroid(verts) { var x = 0, y = 0, z = 0; verts.forEach(function (v) { x += v[0]; y += v[1]; z += v[2]; }); var n = verts.length; return [x / n, y / n, z / n]; }
  function faceNormal(verts) { var a = verts[0], b = verts[1], c = verts[2]; var u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; }
  function buildSolidView() {
    if (!viewer) return;
    while (viewer.group.children.length) viewer.group.remove(viewer.group.children[0]);
    var kind = solidState.kind || 'cube';
    if (kind === 'cube') {
      var colors = solidState.colors || REF_COLORS, HALF = 1.0;
      var mats = FACE_KEYS.map(function (k) {
        return new THREE.MeshPhongMaterial({ color: hexOf(colors[k] || '#999'), transparent: true, opacity: 0.96, side: THREE.DoubleSide });
      });
      var box = new THREE.Mesh(new THREE.BoxGeometry(2 * HALF, 2 * HALF, 2 * HALF), mats);
      viewer.group.add(box);
      viewer.group.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2 * HALF, 2 * HALF, 2 * HALF)), new THREE.LineBasicMaterial({ color: 0x1c2b36 })));
      FACE_KEYS.forEach(function (k) {
        var n = norm(k); var lp = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), makeLabelMat(colors[k] || ''));
        lp.position.set(n[0] * (HALF + 0.03), n[1] * (HALF + 0.03), n[2] * (HALF + 0.03));
        lp.lookAt(new THREE.Vector3(n[0] * (HALF + 1.2), n[1] * (HALF + 1.2), n[2] * (HALF + 1.2))); viewer.group.add(lp);
      });
    } else if (kind === 'poly' && solidState.verts && solidState.faces) {
      // 任意多面体：verts=[[x,y,z]..], faces=[[vi,vi,vi]..]（每面一个 color，可 shot 成图）
      var V = solidState.verts;
      solidState.faces.forEach(function (f, fi) {
        var verts = f.map(function (vi) { return V[vi]; });
        var col = (solidState.palette && solidState.palette[fi]) || PALETTE[fi % PALETTE.length];
        var pos = []; triList(verts).forEach(function (t) { pos.push(t[0][0], t[0][1], t[0][2], t[1][0], t[1][1], t[1][2], t[2][0], t[2][1], t[2][2]); });
        var geom = new THREE.BufferGeometry(); geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geom.computeVertexNormals();
        viewer.group.add(new THREE.Mesh(geom, new THREE.MeshPhongMaterial({ color: col, transparent: true, opacity: 0.94, side: THREE.DoubleSide })));
        viewer.group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom), new THREE.LineBasicMaterial({ color: 0x1c2b36 })));
        var ctr = faceCentroid(verts), nrm = faceNormal(verts);
        var lp = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), makeLabelMat('面' + (fi + 1)));
        lp.position.set(ctr[0] + nrm[0] * 0.06, ctr[1] + nrm[1] * 0.06, ctr[2] + nrm[2] * 0.06);
        lp.lookAt(new THREE.Vector3(ctr[0] + nrm[0], ctr[1] + nrm[1], ctr[2] + nrm[2])); viewer.group.add(lp);
      });
    } else if (kind === 'cylinder' || kind === 'cone' || kind === 'sphere') {
      var mg = kind === 'sphere' ? new THREE.SphereGeometry(1.15, 28, 20) : (kind === 'cone' ? new THREE.ConeGeometry(1, 2.4, 32, 1, false) : new THREE.CylinderGeometry(1, 1, 2.4, 32, 1, false));
      if (kind === 'sphere') {
        viewer.group.add(new THREE.Mesh(mg, new THREE.MeshPhongMaterial({ color: hexOf('蓝'), transparent: true, opacity: 0.88, side: THREE.DoubleSide })));
        viewer.group.add(new THREE.Mesh(new THREE.SphereGeometry(1.15, 16, 12), new THREE.MeshBasicMaterial({ wireframe: true, color: 0x1c2b36 })));
      } else {
        var mats2 = (mg.groups && mg.groups.length) ? mg.groups.map(function (g, gi) { return new THREE.MeshPhongMaterial({ color: PALETTE[gi % PALETTE.length], transparent: true, opacity: 0.94, side: THREE.DoubleSide }); }) : [new THREE.MeshPhongMaterial({ color: PALETTE[0], transparent: true, opacity: 0.94, side: THREE.DoubleSide })];
        viewer.group.add(new THREE.Mesh(mg, mats2));
        viewer.group.add(new THREE.LineSegments(new THREE.EdgesGeometry(mg), new THREE.LineBasicMaterial({ color: 0x1c2b36 })));
      }
    } else {
      var faces = SOLID_FACES(kind);
      if (!faces) { // 未知 kind 回退到 'cube'
        solidState.kind = 'cube'; solidState.colors = solidState.colors || REF_COLORS; buildSolidView(); return;
      }
      faces.forEach(function (f, fi) {
        var col = (solidState.palette && solidState.palette[fi]) || PALETTE[fi % PALETTE.length];
        var pos = []; triList(f.verts).forEach(function (t) { pos.push(t[0][0], t[0][1], t[0][2], t[1][0], t[1][1], t[1][2], t[2][0], t[2][1], t[2][2]); });
        var geom = new THREE.BufferGeometry(); geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geom.computeVertexNormals();
        var mesh = new THREE.Mesh(geom, new THREE.MeshPhongMaterial({ color: col, transparent: true, opacity: 0.94, side: THREE.DoubleSide }));
        mesh.userData.faceName = f.name; viewer.group.add(mesh);
        viewer.group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom), new THREE.LineBasicMaterial({ color: 0x1c2b36 })));
        var ctr = faceCentroid(f.verts), nrm = faceNormal(f.verts);
        var lp = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), makeLabelMat(f.name));
        lp.position.set(ctr[0] + nrm[0] * 0.06, ctr[1] + nrm[1] * 0.06, ctr[2] + nrm[2] * 0.06);
        lp.lookAt(new THREE.Vector3(ctr[0] + nrm[0], ctr[1] + nrm[1], ctr[2] + nrm[2])); viewer.group.add(lp);
      });
    }
    if (currentQuat) viewer.group.quaternion.copy(currentQuat);
    renderViewer();
  }
  // 把当前 3D 画面渲染成 PNG，作为图片消息发进会话（图片传输通道）
  function postFigure(url, label) {
    try {
      var cs = document.getElementById('chat-scroll'); if (!cs) return;
      var wrap = document.createElement('div'); wrap.className = 'msg assistant figure';
      var img = document.createElement('img'); img.className = 'm-img'; img.src = url; img.style.maxWidth = '520px'; img.style.maxHeight = '400px'; img.style.borderRadius = '8px'; img.style.border = '1px solid #e3e6ee';
      wrap.appendChild(img);
      if (label) { var cap = document.createElement('div'); cap.className = 'fig-cap'; cap.style.fontSize = '12px'; cap.style.color = '#6b7280'; cap.style.marginTop = '4px'; cap.textContent = '🧊 ' + label; wrap.appendChild(cap); }
      cs.appendChild(wrap); if (typeof scrollBottom === 'function') scrollBottom();
    } catch (e) {}
  }
  function shot() {
    // 截当前活动的 3D 视图：GeoGebra 3D canvas（上色后）优先，否则 three.js renderer
    var url = null;
    var g3dEl = (typeof document !== 'undefined') && document.getElementById('ggb3d-element');
    if (g3dEl && g3dEl.style.display !== 'none') {
      var cv = g3dEl.querySelector('canvas');
      if (cv) { try { url = cv.toDataURL('image/png'); } catch (e) { url = null; } }
    }
    if (!url && viewer && viewer.renderer) {
      renderViewer();
      try { url = viewer.renderer.domElement.toDataURL('image/png'); } catch (e) { url = null; }
    }
    if (!url) return '无可用 3D 画面可截图（先在 geo3d 构建或切到 GeoGebra 3D 视图）';
    var k = solidState.kind || 'cube';
    postFigure(url, (k === 'cube' ? '正方体' : k === 'prism' ? '三棱柱' : k === 'pyramid' ? '四棱锥' : k === 'tetrahedron' ? '四面体' : k === 'cylinder' ? '圆柱' : k === 'cone' ? '圆锥' : k === 'sphere' ? '球' : k === 'poly' ? '自定义多面体' : k) + '（已生成图）');
    return '已生成立体图并发送到会话（图片传输通道）';
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
      // 支持常见可上色立体：kind = cube/prism/pyramid/tetrahedron/cylinder/cone/sphere
      var kind = args.kind || solidState.kind || 'cube';
      solidState.kind = kind;
      if (args.palette) solidState.palette = args.palette;
      if (kind === 'poly' && args.verts && args.faces) {
        solidState.verts = args.verts; solidState.faces = args.faces;
        solidState.colors = null; solidState.labelToKey = null;
      } else if (kind === 'cube') {
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
      } else {
        solidState.colors = null; solidState.labelToKey = null;
      }
      if (viewer) buildSolidView();
      var KIND = { cube: '正方体', prism: '三棱柱', pyramid: '四棱锥', tetrahedron: '四面体', cylinder: '圆柱', cone: '圆锥', sphere: '球', poly: '自定义多面体' };
      var nfaces = kind === 'poly' && solidState.faces ? solidState.faces.length : (SOLID_FACES(kind) ? SOLID_FACES(kind).length : 0);
      out = '已构建可上色' + (KIND[kind] || kind) + (kind === 'cube' ? '（六面着色：顶=' + solidState.colors['+Y'] + '，右=' + solidState.colors['+X'] + '，前=' + solidState.colors['+Z'] + '）' : '（共' + nfaces + '面 / 曲面可上色，可用 action="shot" 生成图片发进会话）');
    } else if (action === 'shot') {
      out = shot();
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
      var kind = solidState.kind || 'cube';
      if (kind !== 'cube') {
        var names = SOLID_FACES(kind) ? SOLID_FACES(kind).map(function (f) { return f.name; }).join('、') : '曲面（曲面/底面）';
        out = '当前立体：' + kind + '；可上色面：' + names + '；可用 action="shot" 生成图片。';
      } else {
        var opp = opposites(solidState).map(function (p) { return p.a + '↔' + p.b; }).join('，');
        var cNow = solidState.colors || REF_COLORS;
        out = '正方体当前着色：{顶=' + cNow['+Y'] + '，右=' + cNow['+X'] + '，前=' + cNow['+Z'] + '}'
          + '；相对面（唯一）：' + opp
          + '；每面颜色：' + FACE_KEYS.map(function (k) { return k.replace('+', '').replace('-', '-') + ':' + cNow[k]; }).join(' ');
      }
    } else if (action === 'reset') {
      solidState.kind = 'cube'; solidState.colors = null; solidState.labelToKey = null; solidState.palette = null; currentQuat = null;
      if (viewer) { buildSolidView(); }
      out = '已重置为基准正方体（顶=白，右=绿，前=黑）与基准朝向';
    } else {
      return { ok: false, result: '未知 geo3d action: ' + action + '（可选 solid / shoot / shot / view / reach / query / reset）' };
    }
    return { ok: true, result: '🧊 Geo3D · ' + out };
  }

  var api = { run: run, initViewer: initViewer, refreshView: buildSolidView, orientTo: orientTo, PURE: PURE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.geo3d = api;
})(typeof window !== 'undefined' ? window : globalThis);

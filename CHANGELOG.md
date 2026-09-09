# CHANGELOG 变更记录

## 2026-09-09 · geo3d 收尾门禁链 + UI 交互质量门禁

### commit 链（按落地顺序）

| commit | 内容 |
|--------|------|
| `ed0895d` | **geo3d v2**：立体几何路升级——可上色自定义多面体（verts/faces 支持具名点与索引两种写法）、辅助元素 add/clear、`action="shot"` 出图发会话 |
| `75306cf` | **peek 回图**：新增 `action="peek"` 自查通道，渲染当前立体图回传给模型自查（不发进会话），供对照修正构型/顶点字母/辅助线 |
| `b27adf5` | **peek 硬门禁**：shot 前强制先 peek（⛔ 自查门禁未通过直接拦截），防模型盲发出图 |
| `7eda241` | **收尾门禁 v1 + e2e 退出码修复**：ReAct 收尾阶段强制出图核验；e2e_llm_minimax.cjs 退出码修正 |
| `69b93c1` | **收尾门禁代理兜底**：模型连续两次无视逼 shot 提示时，页面直接执行 `runGGBTool('geo3d','{"action":"shot"}')` 代发图片（DOM 通道不依赖模型）；首次拦截时放开 peek 硬门禁防死锁。flash 实测轮四指标全过：finished=true / peekCalls=1 / geo3dFigure=1 / AD=√3（797s），图确认由页面代理发出 |
| `5074294` | **tests/ui_smoke.cjs UI 交互 smoke**（详见下节）+ 测试截图产物入库 |

### tests/ui_smoke.cjs（5074294 新增）

背景：09-07 曾因单引号炸 script 导致**所有按钮失效**（不止设置按钮），语法检查抓不到这类运行期问题 → 补交互层探针。

- T1 加载 + 脚本存活金丝雀（`typeof window.runGGBTool === 'function'`）
- T2 控件清单（buttons/selects/inputs/textareas 计数 + btnTexts 全列）
- T3 全部可见按钮轮点，每击后金丝雀复查；**点后按 Esc 复位**（防设置抽屉遮罩挡住后续按钮）；只认未捕获异常（pageerror）判负
- T4 设置抽屉开合：按 `#drawer` 的 `.open` class + 可视宽度判定（页面用 transform 滑入滑出，**不是** display 切换——首跑误判教训）；截图 ui_settings_open.png
- T5 聊天输入框回环（页面用 `#input-text` input[type=text]，**没有** textarea——首跑误判教训）
- T6 select 换挡；T7 收尾金丝雀 + ui_smoke_final.png
- 首跑 6/2（两 FAIL 均探针判据写错、页面本身无恙），修正后 **8/8 全绿，PAGE ERRORS none**

### 质量门禁（现行约定）

LLM 迭代/改动 ai/index.html 前三绿才动手：

```
node tests/ui_smoke.cjs        # 运行期交互层
node tests/smoke_geo3d.cjs     # geo3d 工具面 12 项
node tests/e2e_geo3d_v2.cjs    # 端到端 16 项
```

本地服务：仓库根 `python -m http.server 8123` → `http://127.0.0.1:8123/ai/index.html`。
Q17 探针四指标：finished=true / peekCalls≥1 / **geo3dFigure=1（核心）** / AD=√3。

### 遗留与可选优化

- 出图瑕疵：面标签（平面PCD/侧面PBC）与顶点 A 字样碰撞；视角 P 在左下、非塔尖朝上
- ReAct 工具调用总数上限（防无限循环）待评估
- 更多立体几何题型泛化

> 本日链路已全部 push，origin/main 同步至 `5074294`。

## 2026-09-09 · geo3d 四项视觉优化（教材图质量）

需求：①上色改半透明 ②默认一般几何体不上色 ③仅复杂几何体或题目需要（颜色/涂色/相对面）才上色 ④顶点字母 billboard 始终朝向镜头 ⑤画面锚点从 A 点改为几何体中心。

### geo3d.js 改动

- **半透明上色**：cube 六色面 opacity 0.55 / poly 上色面 0.5 / 常规几何体（圆柱/圆锥/球）0.25，全部 `transparent + DoubleSide + depthWrite:false`——可透视背面棱线，保留线框感
- **素色默认**：poly 面默认 FACE_EDU 近白淡面（opacity 0.22），仅显式传 color/palette 才浓色（tinted 纪律）
- **billboard 标签**：renderViewer 每帧对带 CanvasTexture 的面片做 `groupQuat⁻¹ · cameraQuat` 对齐，字母/面名永远朝向镜头
- **体中心锚点**：frameSolid 算 AABB 中心 c，`group.position = -c` 平移归零——拖动旋转/缩放锚点=体中心（不再固定顶点 A）
- **cube 独立面 mesh**（关键修复）：单 mesh 六材质按 group 固定顺序绘制（-Z 收尾）+ depthWrite:false 无深度剔除 → "后壁盖前壁"的贴脸错觉；改六面独立 PlaneGeometry mesh，透明按面中心距离排序（远→近）正确叠加
- **投影跨度取景**（关键修复）：随机旋转后屏幕横向跨度可达对角线级，世界 AABB 单轴 maxS 低估 → 横向贴边裁字；改按相机右/上向量投影 8 角点取 halfW/halfH，`camDist = max(hw/(tan21°·aspect), hh/tan21°) × 1.35`（本体最长边占比 ≤74%）
- **面名标签发散**：法向悬浮 0.22 + 沿「体质心→面中心」方向外发散 0.42 + 面片缩至 0.7×0.33——相邻侧面标签各归本方位不扎堆

### tests/ui_smoke.cjs T3 判定改造

GeoGebra web3d-0.js 在 demo 异步初始化中被快节奏点击+Escape 打断会抛内部错误（`Cannot read properties of undefined (reading 'i')`，堆栈全在 web3d-0.js）——引擎时序脆弱性，业务代码无法修也不该误伤。pageerror 改记 `{msg, stack}`，按堆栈来源分级：业务（geo3d.js/index.html/tests/）判 FAIL，第三方（web3d-0/three/ggb/.min.）降级 `[third-party, non-fatal]` 打印。业务回归由 e2e 16 项 + T3 循环内金丝雀兜底。

### 验收

- 三绿：ui_smoke 8/8 + smoke_geo3d 12/12 + e2e_geo3d_v2 16/16
- 视觉四图人审过：素色 poly（字母完整/留白舒适）、上色 poly（五面名全分离）、六色 cube（外部视角/半透明透视/居中完整）、辅助元素图
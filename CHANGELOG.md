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

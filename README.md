# AI_Homework_Assist（AI 作业解题助手）

> 图像题 → LLM ReAct 循环（GeoGebra 画布构造验证 + 学生草稿纸精确计算）→ 教师口吻讲题稿（Markdown + KaTeX 渲染）。
> 本项目同时作为开发产物云存档仓库。

## 功能一览

- **图片题上传**：上传题目图片（或粘贴文本），模型直接看图（不做视觉模型二次转述——模型本身能读图）。
- **DSH 式聊天 ReAct 工作流**（参照 DeepSeek Harness 会话管理照搬）：
  - 思考块 / 工具调用卡片 / 回答正文分区流式渲染（每轮独立容器，跨轮不覆盖）。
  - 工具循环：构造（ggb_eval）→ 读数验证（ggb_query）→ 代数计算交给"学生草稿纸"（student_calc / student_solve，精确分数 / 根式 / 特殊角 / 解方程）→ 草稿档案（scratch_paper / scratch_rollback，可回滚、模拟真实草稿纸）。
  - **思考链回传**（DSH `serializeAssistant` 同款）：assistant 消息保留正文 + reasoning_content + tool_calls 全量回传，模型每轮看得到自己上轮的思考与输出，连续推进；API 不支持时 400 自动降级关闭。
  - **max-tokens 不做结束**（DSH `turnEnds.kind !== "max-tokens"` 语义）：输出截断 → 继续下一轮并强推工具调用；主循环请求不设 max_tokens（输出上限交给模型/服务端）。
  - **DSH 式上下文管理**：步骤前压力检查（80% 阈值）→ LLM 生成 `<compacted-summary>` 检查点替换最旧历史（8 节固定结构、收敛校验、绝不拆 tool 对）；工具结果确定性修剪（头/尾保留 + 中间标记）；API 400/413 溢出恢复（修剪 → retain 0 强制压缩 → 重试一次）。
- **执行后审计**（带证据的裁决，违规即拦截下一轮）：
  - 思考块出现算式但未调草稿纸 → 强制下一轮先走草稿纸（连续违规升级）。
  - 上轮查询结果未被本轮推理引用 → 强制引用或重查。
  - 重复定义已存在对象 / 画布只有点没有边 → 要求修正（如 Polygon(A,B,C,D)）。
  - 验证发现"不成立"却反复重读/质疑题目 → 裁决"定理退化=特定解"，反推隐含前提。
  - 终审门禁：带有未修复构造失败不允许交卷（3 次后降级放行并要求 figureNote 说明）。
- **学段定性**：轻量分类通道（小学/初中/高中/大学/竞赛），失败降级不阻塞。
- **最终输出 = 讲题稿**：模型直接输出 Markdown 讲解（标题/要点/KaTeX 行内与块级公式），页面渲染成学生可读讲题稿；结构化字段（answer / conditionSource / figureNote / ggb.view / note）作为可选 JSON 附注（画布由工具真实构造，无需重放 commands）。
- **题型模式**：图模式·特定解（以图为先，结论在特定构型下成立）vs 文本模式·泛化解（无图代数恒等式可证普遍公式）。
- **API 兼容**：DeepSeek / 百炼 DashScope / OpenAI / 任意 OpenAI 兼容端点；思考强度（off/low/high/max）通过 API 层 `reasoning_effort` + `enable_thinking` 控制；上下文预算默认 1M token。

## 目录结构

```
tutor-demo/
├── ai/
│   └── index.html          # 主应用：单人 HTML（聊天 + GG 工作台 + ReAct 循环 + 审计）
├── gg/
│   └── index.html          # GeoGebra 绘图页（常驻画布）
├── lib/
│   └── katex/              # KaTeX 本地渲染
├── calc_engine.js          # 学生草稿纸引擎源码（精确分数/根式/特殊角/解方程，页面内联）
├── calc_test.js            # 草稿纸引擎测试
├── calc_regress.js         # 草稿纸引擎回归
├── assets/
│   └── problem.jpg         # 内置演示题
├── geoboard-vite/          # 早期 GeoGebra 实验（历史存档）
└── *.cjs                   # Playwright(Edge headless) 人工回归探针（ai-* / gg-* / probe-*）
```

## 快速开始

```bash
# 无需构建（纯静态页面）
python -m http.server 8123 --directory tutor-demo
# 打开
# http://127.0.0.1:8123/ai/index.html
```

1. 右上角 ⚙ 设置：选择预设（DeepSeek / 百炼 / OpenAI）或填任意 OpenAI 兼容端点 + API Key。
2. 配置学段定性通道（可选，填轻量模型走专用通道）。
3. 上传题目图片 / 输入文本 → 「开始」。
4. 左侧看思考/工具/讲题稿，右侧 GeoGebra 画布为工具工作台（构造与读数实时执行）。

## 设计要点（与 DeepSeek Harness 对齐的部分）

实现时扒了 [DSH](https://github.com/deepseek-ai/deepseek-harness)（`dsh-llm` / `dsh-session` / `dsh-agent-loop` / `dsh-compaction-basic` / `dsh-compaction-tool-result-pruner` / `dsh-agent-tool-presentation`）源码并照搬其核心机制：

| DSH 机制 | 本项目的落地 |
|---|---|
| 会话层保存模型全部输出（正文/思考/工具调用），回传时按适配器序列化 | assistant 消息保留 content + reasoning_content + tool_calls 全量回传 |
| `serializeAssistant` 回传 reasoning_content（DeepSeek 推理链延续） | 相同做法；400 自动降级关闭回传 |
| agent-loop：`max-tokens 不结束 turn` | length 截断 → 继续下一轮（强推工具调用），主循环不设 max_tokens |
| pre-step 压力压缩（80% 阈值 + 16% 尾部保留 + 检查点收敛校验 + 不拆工具对） | `compactSession` / `selectCompactableRange` 同策略实现 |
| tool-result 确定性修剪（8192/4096/1024 + `[... tool result middle pruned ...]`） | `pruneSessionToolResults`（JSON 感知：只修剪大字符串字段） |
| 溢出恢复（修剪 → retain 0 强制压缩 → 重试 1 次） | `repairForOverflow` + `onRepaired` 回写全局会话 |
| tool 结果附带语义引导（isError + 修复指引） | 失败结果附修复引导（先 defined 查询 / 命令关键字提示） |

## 测试探针

`*.cjs` 为 Playwright + Edge headless 的回归脚本（人工运行），例：

```bash
node ai-markdown-check.cjs   # 讲解正文 Markdown+KaTeX 渲染验证
node ai-dshcompact-check.cjs # DSH 式压缩/修剪验证
node ai-audit-check.cjs      # 执行后审计验证
```

探针需要: Edge 路径 `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`、
本地服务 `python -m http.server 8123 --directory tutor-demo`、以及运行时自行填入的 API Key
（探针内以 `sk-REPLACE-WITH-YOUR-KEY` 占位，**仓库不含任何真实密钥**）。

## 隐私说明

- API Key 仅存于浏览器 `localStorage`，不上传任何服务端，本仓库不含任何密钥。
- 本仓库为私密云存档（`AI_Homework_Assist`，private）。

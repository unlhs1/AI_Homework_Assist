# AI_Homework_Assist

单文件网页版 AI 数学讲题助手：图片或文本题目进入 LLM ReAct 循环，在 GeoGebra 画布与 three.js 立体画布上真实构造、验证、计算，最终输出教师口吻的讲题稿（Markdown + KaTeX 渲染）。

## 功能

- **题目输入**：上传题目图片（模型直接读图）或粘贴文本，支持学段定性（小学/初中/高中/大学/竞赛，失败自动降级不阻塞）。
- **ReAct 工具循环**：思考块、工具调用卡片、回答正文分区流式渲染；构造（ggb_eval）、读数验证（ggb_query）、精确计算（student_calc / student_solve，支持分数、根式、特殊角、解方程）、草稿档案（scratch_paper / scratch_rollback，可回滚）。
- **2D 平面画布**：GeoGebra webSimple 内核，动态点可拖动、图上代数式随点联动，支持还原构造。
- **3D 立体几何**：本地 three.js 渲染（assets/geo3d.js），可上色多面体、顶点字母 billboard 标签、虚线辅助线、高线与辅助点；相机自由轨道（左键旋转、滚轮缩放、中键平移，俯仰无角度限制），y 轴向上约定保证标准做题视角。
- **思考档位**：设置抽屉可选 off / low / high / max（API 层 reasoning_effort 与 enable_thinking 联动），默认 low 保证循环速度；需要深度推理时可临时调高。
- **执行后审计**：思考块出现算式但未调草稿纸、查询结果未引用、重复定义对象、画布只有点没有边等违规行为会被拦截并要求修正；终审门禁未通过不允许交卷。
- **上下文管理**：80% 压力阈值触发 LLM 生成压缩检查点，工具结果确定性修剪，API 400/413 溢出自动恢复重试。
- **API 兼容**：DeepSeek / 百炼 DashScope / OpenAI 及任意 OpenAI 兼容端点；API Key 仅存浏览器 localStorage。

## 目录结构

```
AI_Homework_Assist/
├── ai/
│   └── index.html              # 主应用（单人 HTML：聊天 + 画布 + ReAct 循环 + 审计）
├── assets/
│   ├── geo3d.js                # 3D 立体几何可视化（three.js）
│   ├── three.min.js            # three.js 本地库
│   └── problem.jpg             # 内置演示题图片
├── gg/
│   └── lib/
│       └── geogebra-webSimple/ # GeoGebra 启动库（deployggb.js）
├── lib/
│   └── katex/                  # KaTeX 本地渲染
├── calc_engine.js              # 学生草稿纸引擎源码（页面内联）
├── calc_test.js                # 草稿纸引擎测试
├── calc_regress.js             # 草稿纸引擎回归
├── tests/
│   ├── ui_smoke.cjs            # 页面交互冒烟（Playwright + Edge headless）
│   ├── smoke_geo3d.cjs         # geo3d 纯文本冒烟
│   └── e2e_geo3d_v2.cjs        # 3D 全链路 e2e（产图至 tests/out/）
├── geoboard-vite/              # 早期实验（历史存档）
├── ai-*.cjs / gg-*.cjs / probe-*.cjs  # 专项回归探针
├── build_zip.ps1               # 发布打包脚本（产出可分发 zip）
└── CHANGELOG.md                # 变更史
```

## 快速开始

无需构建，纯静态页面。两种方式任选：

```bash
# 方式一：直接双击打开（相对路径引用，任意位置解压均可用）
ai/index.html

# 方式二：本地静态服务
python -m http.server 8123
# 浏览器打开 http://127.0.0.1:8123/ai/index.html
```

1. 打开右侧设置抽屉，选择预设（DeepSeek / 百炼 / OpenAI）或填入任意 OpenAI 兼容端点与 API Key。
2. 上传题目图片或输入文本，点击开始。
3. 左侧查看思考、工具调用与讲题稿；右侧画布为工具工作台，构造与读数实时执行。

## 运行依赖

- 本地组件：页面本体、KaTeX 公式渲染、草稿纸计算引擎、three.js 与 geo3d 3D 渲染、GeoGebra 启动库（deployggb.js）均随仓库分发，无构建步骤。
- 联网组件：GeoGebra 内核引擎由 geogebra.org CDN 加载（约数 MB，之后走浏览器缓存）；2D 画布首次使用需能访问该 CDN。3D 立体画布完全本地渲染，不受影响。
- LLM 服务：自备 OpenAI 兼容 API Key，请求由浏览器直连服务商，不经过任何中间服务端。

## 发布打包

```powershell
powershell -ExecutionPolicy Bypass -File build_zip.ps1
# 产出 ../AI_Homework_Assist.zip（含 ai/ assets/ lib/ gg/ 相对结构，解压即用）
```

## 测试

质量门禁三件套（改代码后须全绿）：

```bash
node tests/ui_smoke.cjs       # 页面加载、控件、抽屉开合、输入与下拉
node tests/smoke_geo3d.cjs    # geo3d 参数校验与工具返回
node tests/e2e_geo3d_v2.cjs   # 建模、上色、辅助元素、渲染出图、自检门禁
```

依赖 Playwright（playwright-core）与 Microsoft Edge；e2e 需先启动本地静态服务。专项探针（ai-* / gg-* / probe-*）为人工运行的回归脚本，部分需在脚本内填入 API Key 占位符，仓库不含任何真实密钥。

## 隐私说明

- API Key 仅存于浏览器 localStorage，不上传任何服务端。
- 本仓库为私密仓库，不含密钥与个人数据。

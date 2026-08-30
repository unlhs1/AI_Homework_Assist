import React from 'react';
import { createRoot } from 'react-dom/client';
import './demo.css';
import { Math3DStudio } from '../../../src/components/math3d/Math3DStudio';

function DemoShell() {
  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-4 flex flex-col gap-3">
      <header className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-3 shadow-sm">
        <h1 className="text-base font-semibold">GeoBoard 白板 · 对照演示（TutorReel 自研）</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          题目：正方形 ABCD，F 为 CD 上一点，延长 AF 交 AC 的平行线 DE 于 E，且 AE=AC，求证 CE=CF（原题图片在「gg 版」页）。
        </p>
      </header>
      <Math3DStudio />
      <footer className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400 shadow-sm leading-relaxed">
        <b className="text-zinc-700 dark:text-zinc-200">手动构造提示</b>（对比重点：白板拖拽手感 / 3D 能力 / 与 GeoGebra 差异）：
        <ol className="list-decimal ml-5 mt-1 space-y-0.5">
          <li>切「xy」平面视图，用<b>选点</b>建 A(0,4,0)、B(0,0,0)、C(4,0,0)、D(4,4,0)（地面点以 xz 视图更顺手）；</li>
          <li>连线 AB/BC/CD/DA 成正方形，连 AC、AF（F 建在 CD 中点附近再拖）；</li>
          <li><b>注意</b>：白板目前没有「平行线」工具与长度度量显示——DE∥AC 需手算 E=(a²/x, 2a−a²/x) 坐标直接建点，验证 CE=CF 也只能目测/量坐标；这正是与 GeoGebra 的差异点。</li>
        </ol>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<DemoShell />);
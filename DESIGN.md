# DESIGN.md

## 品牌与视觉方向
- 气质：现代教育管理系统，专业、简洁、高效
- 意象：清晨校园，秩序井然，信息清晰

## Design Tokens

### 色彩
- 主色：Indigo-600 (#4F46E5) - 专业、信任感
- 辅助色：Emerald-500 (成功/通过)、Amber-500 (待处理)、Rose-500 (驳回/危险)
- 背景：Slate-50 浅灰底色，白色卡片
- 文字：Slate-900 标题，Slate-600 正文，Slate-400 辅助

### 字体
- 字体族：PingFang SC, Microsoft YaHei, system-ui
- 标题：font-semibold，正文：font-normal

### 圆角与间距
- 卡片圆角：rounded-xl
- 按钮圆角：rounded-lg
- 卡片内间距：p-6
- 组件间距：gap-4 / gap-6

## 布局
- 侧边栏导航 + 主内容区
- 响应式：移动端侧边栏可折叠
- 数据表格使用卡片包裹

## 交互
- 按钮 hover 有轻微背景变化
- 状态切换有过渡动画
- 加载状态使用骨架屏或 spinner

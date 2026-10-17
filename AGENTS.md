# 项目上下文

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4

## 目录结构

```
├── public/                 # 静态资源
├── scripts/                # 构建与启动脚本
│   ├── build.sh            # 构建脚本
│   ├── dev.sh              # 开发环境启动脚本
│   ├── prepare.sh          # 预处理脚本
│   └── start.sh            # 生产环境启动脚本
├── src/
│   ├── app/                # 页面路由与布局
│   ├── components/ui/      # Shadcn UI 组件库
│   ├── hooks/              # 自定义 Hooks
│   ├── lib/                # 工具库
│   │   └── utils.ts        # 通用工具函数 (cn)
│   └── server.ts           # 自定义服务端入口
├── next.config.ts          # Next.js 配置
├── package.json            # 项目依赖管理
└── tsconfig.json           # TypeScript 配置
```

- 项目文件（如 app 目录、pages 目录、components 等）默认初始化到 `src/` 目录下。

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。
**常用命令**：
- 安装依赖：`pnpm add <package>`
- 安装开发依赖：`pnpm add -D <package>`
- 安装所有依赖：`pnpm install`
- 移除依赖：`pnpm remove <package>`

## 开发规范

### 编码规范

- 默认按 TypeScript `strict` 心智写代码；优先复用当前作用域已声明的变量、函数、类型和导入，禁止引用未声明标识符或拼错变量名。
- 禁止隐式 `any` 和 `as any`；函数参数、返回值、解构项、事件对象、`catch` 错误在使用前应有明确类型或先完成类型收窄，并清理未使用的变量和导入。

### next.config 配置规范

- 配置的路径不要写死绝对路径，必须使用 path.resolve(__dirname, ...)、import.meta.dirname 或 process.cwd() 动态拼接。

### Hydration 问题防范

1. 严禁在 JSX 渲染逻辑中直接使用 typeof window、Date.now()、Math.random() 等动态数据。**必须使用 'use client' 并配合 useEffect + useState 确保动态内容仅在客户端挂载后渲染**；同时严禁非法 HTML 嵌套（如 <p> 嵌套 <div>）。
2. **禁止使用 head 标签**，优先使用 metadata，详见文档：https://nextjs.org/docs/app/api-reference/functions/generate-metadata
   1. 三方 CSS、字体等资源可在 `globals.css` 中顶部通过 `@import` 引入或使用 next/font
   2. preload, preconnect, dns-prefetch 通过 ReactDOM 的 preload、preconnect、dns-prefetch 方法引入
   3. json-ld 可阅读 https://nextjs.org/docs/app/guides/json-ld

## UI 设计与组件规范 (UI & Styling Standards)

- 模板默认预装核心组件库 `shadcn/ui`，位于`src/components/ui/`目录下
- Next.js 项目**必须默认**采用 shadcn/ui 组件、风格和规范，**除非用户指定用其他的组件和规范。**

## 学生请销假系统 - 项目概览（V2 按需求说明书重构）

### 核心领域逻辑（改动前必读）

- **请假时长（0.5 天计时规则，V3.2）**：起止精确到分钟，同时保存 `duration_minutes`（实际分钟）、`duration_hours`（实际小时，保留兼容）、`duration_days`（折算天数）、`duration_rule_version`（默认 `0.5day-v1`）。折算公式 `ceil(分钟/720)×0.5 天`（`src/lib/business.ts` 的 `calcDurationMinutes/minutesToDays/calcDurationDays`），审批边界严格（如 18h=1080min 计 1 天，>24h 才进 1.5 天）。审批流按「类型 + 折算天数区间(`min_days/max_days`) + 是否离校」匹配（`matchFlow` 读 snake_case 列，先比 priority 再比类型/区间/离校具体度）；`approval_flows` 的 `min_hours/max_hours` 仅为历史兼容列，不再用于匹配。
- **一条未结束普通请假链**：`users.active_leave_id` 指向当前占用链单据；提交时先 `findActiveLeave` 预检再通过 Postgres RPC `acquire_leave_chain` 原子占用（失败回滚新单）。占用态：`pending/approving` 始终占用；`approved` 离校单销假前占用、非离校单到期(`end_time`)自然释放；`rejected/revoked/done` 不占用。释放走条件更新 `releaseActiveLeave`（仅当指向该单时清空），接入点：驳回/学生撤回/管理员撤销/销假确认/人工核验。
- **请假编号**：`LJ-YYYYMMDD-4位随机`；提交时生成学生/班级/院系**快照字段**，后续班级调整不影响历史单据。
- **审批状态机**：`pending → approving（中间节点通过）→ approved / rejected`；可 `revoked`（管理员撤销）。审批记录写 `approval_records`，待办写 `messages(type=approval_todo, todo_done)`。
- **销假状态机** `checkin_status`：`none → pending（围栏外打卡/提交）→ done（中队长确认）`；围栏外可管理员 `manual-verify` 人工核验；中队长可驳回/批量确认。
- **围栏判定以后端为准**（`checkFence`：圆/多边形 + 边界容差 + 精度上限），前端定位仅作采集，前端判断不能替代服务端。
- **认证**：不开放学生自注册（`/api/auth/register` 直接拒绝）；导入学生强制改密；登录失败 5 次锁定 15 分钟；管理员可重置密码。
- **超时/逾期**：不跑定时任务，由管理员在统计页手动 POST `/api/admin/scan-alerts` 扫描生成预警消息。

### 功能模块

1. **认证**：登录/登出/me/修改密码(`/api/auth/password`)/管理员重置密码；JWT 存 localStorage，请求头 `Authorization: Bearer`。
2. **学生端**：提交请假（动态表单、凭证附件、冲突校验、离校/外宿字段）、我的申请（撤回/定位销假/人工核验申请）、消息中心。
3. **中队长(teacher)端**：待审批（勾选批量通过/驳回）、已处理、销假确认（批量确认）。
4. **管理员(admin)端**：工作台、全部请假（筛选+CSV 导出+撤销+人工核验）、学生管理（CSV 导入预览/提交、重置密码）、教师/班级/校区围栏/请假类型/审批流配置、统计报表（口径见 stats 路由）、操作日志、预警规则。

### 数据库表（Supabase Postgres，均开启 RLS）

`users` `classes` `campuses` `leave_types` `approval_flows(nodes 为 jsonb 数组)` `leave_requests`(含快照/销假/预警字段) `approval_records` `checkins` `attachments`(对象存储 file_key) `messages`(待办+通知合一) `alert_rules`(单行配置) `alert_records` `operation_logs`(只追加)

### 关键 API

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/auth/login` `/logout` `/me` `/password` | POST/GET | 认证 |
| `/api/users` `/api/users/[id]` `/api/users/[id]/reset-password` | GET/POST/PUT/DELETE | 账号管理 |
| `/api/students/import` | POST(json {csv,mode}) | 导入预览 preview / 提交 commit |
| `/api/students/template` `/api/leaves/export` | GET | CSV 模板/导出(BOM) |
| `/api/classes` `/api/campuses` `/api/leave-types` `/api/flows` | CRUD | 基础资料/流程配置 |
| `/api/leaves?scope=todo` | GET | 待办基于 messages 精确过滤 |
| `/api/leaves` | POST | 学生提交（编号/时长/冲突/流程快照/待办） |
| `/api/leaves/[id]` | GET/DELETE | 详情 / 学生撤回 |
| `/api/leaves/[id]/approve` `/api/leaves/batch-approve` | POST | 单条/批量审批 |
| `/api/leaves/[id]/checkin` | POST | 定位销假打卡（后端围栏校验） |
| `/api/leaves/[id]/checkin-review` `/api/checkins/batch-review` | POST | 中队长确认/驳回/批量 |
| `/api/leaves/[id]/manual-verify` | POST | 管理员人工核验 |
| `/api/leaves/[id]/upload` `/api/files/[id]/url` | POST/GET | 附件上传/受控签名 URL |
| `/api/messages` `/api/messages/[id]/read` `/api/messages/read-all` | GET/POST | 站内消息/待办 |
| `/api/stats` `/api/admin/scan-alerts` `/api/logs` `/api/alert-rules` | GET/POST | 统计/预警/日志 |

### 演示数据

- `POST /api/auth/seed` 幂等重建演示数据（校区围栏、请假类型、4 条审批流、班级、师/生账号、示例单据）。
- 账号：管理员 `admin/admin123`；中队长 `T2024001/teacher123`；学生 `S2024001/student123` 等。

### 注意事项

- 对象存储走 `coze-coding-dev-sdk`（`src/app/api/leaves/[id]/upload`），凭证只在后端使用，不返回公开直链，下载经 `/api/files/[id]/url` 换签名 URL。
- CSV 解析/序列化在 `src/lib/csv.ts`；通知 `src/lib/notify.ts`；审计日志 `src/lib/logger.ts`（catch 内不得再抛错影响主流程）。

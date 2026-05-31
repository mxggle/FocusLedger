# PRD: FocusLedger Desktop

## 0. 一句话定位

**FocusLedger Desktop 是一个桌面端执行型 Todo + 时间追踪工具。**

它不是普通 Todo，也不是单纯计时器，而是帮助用户完成这条闭环：

> 写下今天要做什么 → 一键开始任务 → 自动计时 → 停止后记录结果 → 每天复盘时间花在哪里。

---

## 1. 产品目标

### 1.1 核心目标

做一个本地优先的桌面 App，帮助用户：

1. **管理今天要做的任务**
2. **对每个任务一键开始计时**
3. **记录每次任务的实际执行时间**
4. **对比预估时间和实际时间**
5. **生成当天的时间账单**
6. **让用户知道自己真正把时间花到了哪里**

### 1.2 非目标

第一版不要做这些：

1. 不做团队协作
2. 不做账号系统
3. 不做云同步
4. 不做复杂项目管理
5. 不做看板协作
6. 不做日历同步
7. 不做手机端
8. 不做订阅付费
9. 不做复杂 AI Agent

第一版只做一个可以真实自用的本地桌面工具。

---

## 2. 目标用户

### 2.1 核心用户

高强度自学者、求职者、独立开发者、自由职业者。

典型场景：

1. 准备面试
2. 学日语 / 英语
3. 做个人项目
4. 刷题 / 备考
5. 写文章 / 做作品集
6. 处理生活杂事

### 2.2 用户痛点

用户每天事情很多，但真正的问题不是“没有 Todo 工具”，而是：

1. **任务写了很多，但不知道什么时候开始**
2. **开始之后不知道实际花了多久**
3. **一天结束后不知道自己到底做了什么**
4. **预估时间经常不准**
5. **大任务容易拖延**
6. **学习、求职、开发之间的时间分配不清楚**
7. **缺少真实执行记录，无法复盘**

---

## 3. 产品原则

### 3.1 Execution First

产品核心不是“管理任务”，而是“推动任务开始执行”。

每个任务必须有一个明显的 **Start** 按钮。

### 3.2 Local First

所有数据默认保存在本地 SQLite。

第一版不依赖服务器、不登录、不联网也能用。

### 3.3 Frictionless Capture

添加任务必须非常快。

用户不应该为了添加一个任务填写很多字段。

### 3.4 Honest Time Tracking

系统重点记录真实耗时，而不是理想计划。

核心数据是：

> estimated_minutes vs actual_minutes

### 3.5 Review-Oriented

停止任务后，不只是保存时间，还要记录：

1. 做了什么
2. 完成度多少
3. 是否需要继续
4. 这次执行有没有卡住

---

## 4. 技术方案

### 4.1 技术栈

使用：

```txt
Tauri v2
React
TypeScript
Vite
Tailwind CSS
shadcn/ui
Zustand
SQLite
tauri-plugin-sql
date-fns
lucide-react
```

### 4.2 不使用

第一版不要使用：

```txt
Next.js
Electron
Supabase
Firebase
Redux
Prisma
Cloud sync
Server API
```

原因：

桌面本地工具不需要 Next.js 和服务端渲染。第一版应保持简单、快速、稳定。

---

## 5. 信息架构

App 主要由 4 个页面组成：

```txt
1. Today
2. Tasks
3. History
4. Settings
```

第一版重点实现 Today 页面。

---

## 6. 核心页面设计

## 6.1 Today 页面

Today 是主页面。

布局分为三栏：

```txt
左侧：Today Tasks
中间：Current Focus
右侧：Today Log / Summary
```

### 左侧：Today Tasks

显示今天要做的任务。

每个任务卡片包含：

```txt
任务标题
分类
预估时间
优先级
状态
Start 按钮
```

任务状态：

```txt
todo
doing
paused
done
dropped
```

任务卡片示例：

```txt
Prepare Headwaters interview answer
Job Hunting · 45 min · High
[Start]
```

### 中间：Current Focus

如果没有正在进行的任务，显示：

```txt
No active task.
Choose a task to start.
```

如果有正在进行的任务，显示：

```txt
当前任务标题
所属分类
计时器：00:32:18
预计时间：45 min
已用比例：71%
Pause / Resume / Stop / Done
```

### 右侧：Today Log

显示今天所有时间记录。

示例：

```txt
09:00 - 09:35 Japanese shadowing · 35m
10:10 - 11:00 Interview answer writing · 50m
11:20 - 12:05 Katachi bug fix · 45m
```

底部显示今日统计：

```txt
Total Focus Time: 3h 20m
Job Hunting: 1h 30m
Japanese: 1h 00m
Development: 50m
```

---

## 7. 核心功能需求

## 7.1 添加任务

用户可以快速添加任务。

最小字段：

```txt
title: required
category: optional
estimated_minutes: optional
priority: optional
due_date: default today
```

添加任务输入区放在 Today 页面顶部。

输入体验：

```txt
Input: "Prepare interview self-introduction"
Button: Add
```

高级字段可以折叠，不要默认展开。

### 验收标准

1. 用户可以输入任务标题并添加任务
2. 新任务默认出现在 Today Tasks
3. 任务默认状态为 todo
4. 未填写分类时，分类为 Inbox
5. 未填写预估时间时，可以为空

---

## 7.2 开始任务

点击任务的 Start 按钮后：

1. 任务状态变为 doing
2. 创建一条 TimeEntry
3. start_at 设置为当前时间
4. 当前任务显示在 Current Focus
5. 计时器开始实时增长
6. 同一时间只能有一个 active task

如果已有任务正在进行，再开始另一个任务时：

弹窗提示：

```txt
You already have an active task.
Do you want to stop the current task and start this one?
```

选项：

```txt
Cancel
Stop current and start new
```

### 验收标准

1. 点击 Start 后计时器立即开始
2. 刷新 / 重启 App 后，正在进行的任务仍然能恢复计时
3. 同一时间不能有多个 active time entry
4. App 关闭期间，计时仍按真实时间计算

---

## 7.3 暂停 / 继续任务

用户可以暂停当前任务。

点击 Pause 后：

1. 当前 TimeEntry 写入 end_at
2. 任务状态变为 paused
3. 计时器停止

点击 Resume 后：

1. 创建新的 TimeEntry
2. task_id 仍然相同
3. 任务状态变为 doing
4. 计时器继续累计该任务总耗时

注意：

同一个任务可以有多条 TimeEntry。

### 验收标准

1. 暂停后计时器停止
2. 继续后创建新的时间片段
3. 任务总耗时等于所有 TimeEntry 的 duration 总和

---

## 7.4 停止任务

点击 Stop 后，弹出执行记录窗口。

用户需要填写：

```txt
这次做了什么？
完成度是多少？
是否遇到卡点？
是否继续保留这个任务？
```

字段：

```txt
note: optional
completion_rate: 0-100
blocker: optional
next_action: optional
```

按钮：

```txt
Save as paused
Mark as done
Drop task
```

行为：

1. Save as paused: 任务状态变为 paused
2. Mark as done: 任务状态变为 done
3. Drop task: 任务状态变为 dropped

### 验收标准

1. Stop 后必须关闭当前 active TimeEntry
2. 用户填写的 note 保存到 TimeEntry
3. Done 后任务不再出现在 Today Tasks 的默认列表中
4. Dropped 后任务保留在 History 中

---

## 7.5 完成任务

点击 Done 后：

1. 如果任务正在计时，先停止计时
2. 弹出简单总结框
3. 任务状态变为 done
4. 记录 completed_at

总结框字段：

```txt
What was completed?
Completion note
```

### 验收标准

1. 完成任务后不再显示在 active list
2. 完成任务可以在 History 中查看
3. 完成时自动计算总实际耗时

---

## 7.6 今日统计

Today 页面右侧显示今日统计。

统计项：

```txt
今日总专注时间
各分类耗时
完成任务数量
放弃任务数量
预估总时间
实际总时间
时间偏差
```

示例：

```txt
Total Focus: 5h 20m
Completed Tasks: 6
Estimated: 4h 00m
Actual: 5h 20m
Time Drift: +1h 20m
```

分类统计示例：

```txt
Job Hunting: 2h 10m
Japanese: 1h 30m
Development: 1h 15m
Life: 25m
```

### 验收标准

1. 今日统计实时更新
2. 统计只计算当天的 TimeEntry
3. 跨天任务需要按日期切分统计

---

## 7.7 History 页面

History 页面用于查看历史执行记录。

支持按日期查看。

默认显示最近 7 天。

每一天显示：

```txt
日期
总专注时间
完成任务数
分类时间分布
时间记录列表
```

### 验收标准

1. 用户可以查看过去的 TimeEntry
2. 用户可以按日期筛选
3. 用户可以点击某个任务查看详情
4. 用户可以看到每天的总耗时

---

## 7.8 Settings 页面

第一版 Settings 包含：

```txt
Default category
Daily focus target
Start week on Monday
Theme: system / light / dark
Enable tray
Enable notifications
Global shortcut
```

默认配置：

```txt
daily_focus_target_minutes = 240
theme = system
enable_tray = true
enable_notifications = true
global_shortcut = CmdOrCtrl+Shift+Space
```

---

## 8. 桌面端能力

## 8.1 System Tray

App 关闭窗口后，不退出进程，保留在系统托盘。

托盘菜单：

```txt
Show FocusLedger
Start / Pause Current Task
Stop Current Task
Quick Add Task
Quit
```

### 验收标准

1. 点击窗口关闭按钮时，默认隐藏到托盘
2. 从托盘可以重新打开主窗口
3. 托盘能显示当前是否有任务正在计时

---

## 8.2 Global Shortcut

支持全局快捷键：

```txt
CmdOrCtrl + Shift + Space
```

行为：

如果没有 active task：

```txt
打开 Quick Add / Start 窗口
```

如果有 active task：

```txt
打开 mini timer window
```

### 验收标准

1. App 在后台时快捷键也能生效
2. 快捷键可以在 Settings 中修改
3. 快捷键冲突时给出错误提示

---

## 8.3 Mini Timer Window

提供一个小悬浮窗口。

显示：

```txt
任务标题
计时器
Pause
Stop
Done
```

要求：

1. 窗口小
2. 可拖动
3. 可置顶
4. 不打扰主界面

### 验收标准

1. 用户可以从主页面打开 mini timer
2. mini timer 和主页面计时状态同步
3. mini timer 可以暂停 / 停止 / 完成任务

---

## 8.4 Desktop Notification

在以下情况发送桌面通知：

1. 任务超过预估时间
2. 任务连续运行超过 60 分钟
3. 达成今日专注目标

通知示例：

```txt
You are over the estimate.
Task: Prepare interview answer
Estimated: 45m
Actual: 60m
```

### 验收标准

1. 通知可以在 Settings 中关闭
2. 通知不会频繁重复
3. 同一任务超过预估时间只通知一次

---

## 9. 数据模型

## 9.1 tasks

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category_id TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'medium',
  estimated_minutes INTEGER,
  due_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  dropped_at TEXT
);
```

status enum:

```txt
todo
doing
paused
done
dropped
```

priority enum:

```txt
low
medium
high
```

---

## 9.2 time_entries

```sql
CREATE TABLE IF NOT EXISTS time_entries (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT,
  duration_seconds INTEGER,
  note TEXT,
  blocker TEXT,
  next_action TEXT,
  completion_rate INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);
```

规则：

1. end_at 为空表示 active time entry
2. 同一时间只能有一条 end_at 为空的记录
3. duration_seconds 在停止时写入
4. 如果 App 重启，active entry 根据 start_at 继续计算

---

## 9.3 categories

```sql
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

默认分类：

```txt
Inbox
Job Hunting
Japanese
English
Development
Life
Reading
Health
```

---

## 9.4 settings

```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

---

## 10. 状态管理

使用 Zustand。

Store 拆分：

```txt
taskStore
timerStore
settingsStore
uiStore
```

### taskStore

负责：

```txt
createTask
updateTask
deleteTask
startTask
pauseTask
resumeTask
stopTask
completeTask
dropTask
getTodayTasks
getTaskById
```

### timerStore

负责：

```txt
activeTaskId
activeTimeEntryId
elapsedSeconds
isRunning
startTicker
stopTicker
restoreActiveTimer
```

### settingsStore

负责：

```txt
theme
dailyFocusTarget
notifications
trayEnabled
globalShortcut
```

---

## 11. 业务规则

## 11.1 Active Time Entry Rule

系统中最多只能有一个 active time entry。

active time entry 定义：

```txt
end_at IS NULL
```

启动 App 时必须检查数据库。

如果发现多条 active entry：

1. 保留最新的一条
2. 其他全部自动关闭
3. 写入 end_at 为当前时间
4. 在控制台输出 warning

---

## 11.2 Cross-Day Rule

如果一个任务从晚上 23:30 运行到第二天 00:30：

统计时应该拆分为：

```txt
Day 1: 30 min
Day 2: 30 min
```

第一版可以在统计函数中处理，不一定要真的拆 TimeEntry。

---

## 11.3 Estimate Overrun Rule

如果任务有 estimated_minutes，并且实际耗时超过预估：

1. UI 显示 overrun 状态
2. 进度条超过 100%
3. 第一次超过时发送通知

---

## 12. UI 要求

### 12.1 视觉风格

关键词：

```txt
clean
calm
desktop productivity
not childish
not gamified
low-friction
```

### 12.2 主色调

默认使用中性色。

可以使用少量强调色表示状态：

```txt
todo: gray
doing: blue
paused: yellow
done: green
dropped: red
overrun: orange
```

### 12.3 组件要求

使用 shadcn/ui：

```txt
Button
Input
Dialog
Card
Badge
Tabs
DropdownMenu
Progress
Textarea
Select
Switch
```

---

## 13. 页面细节

## 13.1 Today 页面空状态

如果今天没有任务：

```txt
What do you want to move forward today?
[Add your first task]
```

---

## 13.2 当前任务空状态

如果没有正在执行的任务：

```txt
No active focus session.
Start a task when you are ready.
```

---

## 13.3 Stop Dialog

标题：

```txt
Wrap up this session
```

字段：

```txt
What did you work on?
Any blocker?
Next action?
Completion rate
```

按钮：

```txt
Save and pause
Mark as done
Drop task
```

---

## 14. MVP 范围

## 14.1 P0 必须实现

```txt
1. Tauri desktop app 初始化
2. SQLite 数据库初始化
3. 创建任务
4. Today task list
5. Start timer
6. Pause timer
7. Resume timer
8. Stop timer
9. Complete task
10. Today log
11. Today summary
12. History page
13. Settings page basic version
14. App 重启后恢复 active timer
```

## 14.2 P1 实现

```txt
1. System tray
2. Global shortcut
3. Mini timer window
4. Desktop notification
5. Category management
6. Edit task
7. Delete task
8. Search history
```

## 14.3 P2 实现

```txt
1. AI daily review
2. Task breakdown suggestion
3. Weekly report
4. Export Markdown
5. Import / backup database
6. Calendar integration
7. GitHub activity integration
```

---

## 15. AI 功能，第一版暂不实现，但预留入口

### 15.1 AI Daily Review

输入：

```txt
today tasks
time entries
completion notes
category stats
```

输出：

```txt
今日总结
时间分配分析
最大时间黑洞
明天建议
```

示例：

```txt
Today you spent most of your focus time on job hunting and Japanese learning.
The biggest time drift came from the interview answer task, which took 90 minutes instead of the estimated 45 minutes.
Tomorrow, split interview preparation into smaller tasks before starting.
```

### 15.2 Task Breakdown

当用户创建一个太大的任务时，例如：

```txt
Prepare interview
```

AI 建议拆成：

```txt
Write self-introduction
Prepare project explanation
Practice common questions
Prepare reverse questions
```

---

## 16. 项目结构建议

```txt
focusledger-desktop/
  src/
    app/
      App.tsx
      routes.tsx
    components/
      layout/
      task/
      timer/
      history/
      settings/
      ui/
    stores/
      taskStore.ts
      timerStore.ts
      settingsStore.ts
    db/
      client.ts
      migrations.ts
      taskRepository.ts
      timeEntryRepository.ts
      categoryRepository.ts
      settingsRepository.ts
    services/
      timerService.ts
      statsService.ts
      notificationService.ts
      trayService.ts
      shortcutService.ts
    types/
      task.ts
      timeEntry.ts
      category.ts
      settings.ts
    utils/
      date.ts
      duration.ts
      id.ts
  src-tauri/
    src/
      main.rs
    tauri.conf.json
  package.json
  README.md
```

---

## 17. Repository 层要求

不要在 React 组件里直接写 SQL。

必须通过 repository 调用。

示例：

```ts
taskRepository.createTask();
taskRepository.updateTask();
taskRepository.getTodayTasks();
timeEntryRepository.createEntry();
timeEntryRepository.closeEntry();
timeEntryRepository.getTodayEntries();
```

---

## 18. 统计函数要求

实现 statsService。

函数：

```ts
getTodayStats(date: string): Promise<TodayStats>
getCategoryStats(date: string): Promise<CategoryStats[]>
getTaskActualDuration(taskId: string): Promise<number>
getDateRangeStats(startDate: string, endDate: string): Promise<DailyStats[]>
```

TodayStats 类型：

```ts
type TodayStats = {
  date: string;
  totalFocusSeconds: number;
  completedTaskCount: number;
  droppedTaskCount: number;
  estimatedSeconds: number;
  actualSeconds: number;
  driftSeconds: number;
  categoryStats: CategoryStats[];
};
```

---

## 19. 错误处理

必须处理：

```txt
1. 数据库初始化失败
2. 创建任务失败
3. active timer 恢复失败
4. 快捷键注册失败
5. 通知权限失败
6. SQLite 查询失败
```

错误展示方式：

1. 不要让 App 崩溃
2. 显示 toast
3. 控制台输出详细错误
4. 用户能继续使用其他功能

---

## 20. Codex 实现顺序

请按下面顺序实现，不要一次性做所有功能。

### Step 1: 初始化项目

创建 Tauri + React + TypeScript + Vite 项目。

安装：

```txt
tailwindcss
shadcn/ui
zustand
date-fns
lucide-react
tauri-plugin-sql
```

完成后确保桌面 App 能启动。

---

### Step 2: SQLite 初始化

实现数据库连接和 migrations。

创建表：

```txt
tasks
time_entries
categories
settings
```

插入默认 categories。

---

### Step 3: Repository 层

实现：

```txt
taskRepository
timeEntryRepository
categoryRepository
settingsRepository
```

---

### Step 4: Today 页面基础 UI

实现三栏布局：

```txt
Today Tasks
Current Focus
Today Log
```

先用真实数据库数据，不要 mock。

---

### Step 5: 任务 CRUD

实现：

```txt
add task
edit task
delete task
mark done
drop task
```

---

### Step 6: Timer 核心逻辑

实现：

```txt
start task
pause task
resume task
stop task
restore active timer after restart
```

这是最重要的部分。

必须保证：

```txt
同一时间只有一个 active time entry
App 重启后计时不丢
关闭窗口后计时不丢
```

---

### Step 7: Today Stats

实现：

```txt
total focus time
category stats
estimated vs actual
completed count
dropped count
```

---

### Step 8: History 页面

实现最近 7 天历史记录。

---

### Step 9: Settings 页面

实现基础设置。

---

### Step 10: 桌面增强

实现：

```txt
system tray
global shortcut
mini timer window
desktop notification
```

---

## 21. 关键验收标准

项目完成后，必须满足：

```txt
1. 用户可以创建今天的任务
2. 用户可以点击 Start 开始计时
3. 用户可以 Pause / Resume / Stop / Done
4. 用户关闭 App 再打开，计时状态仍然正确
5. 用户可以看到今天每个任务花了多久
6. 用户可以看到今日总专注时间
7. 用户可以看到分类时间统计
8. 用户可以查看历史记录
9. 所有数据保存在本地 SQLite
10. 不需要登录
11. 不需要网络
12. 桌面 App 可以正常启动和关闭
```

---

## 22. README 要求

生成 README.md，包含：

```txt
项目介绍
技术栈
本地启动方式
开发命令
构建命令
主要功能
数据存储说明
后续计划
```

---

## 23. 产品命名

项目名：

```txt
FocusLedger
```

Slogan：

```txt
Turn tasks into time records.
```

中文解释：

```txt
把任务变成可复盘的时间记录。
```

---

## 24. 第一版成功标准

第一版不追求功能多。

第一版成功的标准是：

> 用户真的愿意每天打开它，然后用它记录自己做了什么、做了多久。

如果它能稳定完成这件事，就是成功。

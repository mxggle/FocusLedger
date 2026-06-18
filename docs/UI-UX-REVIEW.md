# Yolo UI/UX Review

> Review date: 2026-06-18
> Scope: 整体交互逻辑、设计系统一致性、状态覆盖、可访问性

## 整体评价

Yolo 的工程基础扎实:store-centric 架构、统一的 `MutationResult` 反馈模式、完整的设计 token 系统、对 reduced-motion 的尊重,都体现了较高的完成度。Motion 语言有明确哲学(`settle` vs `celebrate`),空状态覆盖了大部分页面。以下按优先级列出可优化点。

---

## 🔴 高优先级

### 1. 异步数据加载缺少 loading 态,导致空状态闪烁
- `MyDayPage` 切换历史日期时:先 `setPastEntries([])` 再 fetch,会闪一下空状态
- `LifePage` 加载 week focus 数据时显示空白网格,无任何指示
- `HistoryPage` 切换日期时详情面板无过渡态
- **建议**:复用已有的 `Skeleton` 组件,或至少加一个轻量 spinner 占位

### 2. 异步 fetch 失败被静默吞掉,无错误反馈
- `MyDayPage` / `LifePage` 的 `.catch()` 都直接 set 空数据,用户完全不知道加载失败了
- **建议**:catch 时至少 fire 一个 error toast,或显示可重试的错误态

### 3. 空状态组件使用不一致
- Today / Backlog / History / Plan 都用了 `EmptyState` 组件(带图标、提示、dashed 边框)
- 但 My Day 的子组件 `SessionList`、`DayTimeline`、`CategoryDonut` 用的是纯 `<p>` 文本,视觉上割裂
- **建议**:统一改用 `EmptyState`

### 4. 硬编码颜色破坏设计系统语义
- `SessionList`:`text-amber-600 dark:text-amber-500`、`bg-emerald-500` → 应改用 `warning` / `success` token
- `HeroStatBand`:`text-amber-500` → 应改用 `text-warning`
- 这会导致未来调主题色时遗漏

### 5. 无乐观更新,每个操作都有可感知延迟
- 所有 mutation 都等完整 `refresh()` 完成才更新 UI
- 对于 start/pause/complete 这类高频操作,延迟感明显
- **建议**:对关键交互(开始/暂停/完成)做乐观更新,失败时回滚

---

## 🟡 中优先级

### 6. 组件规范不统一
- My Day 用 `Panel`(`rounded-2xl p-5`),其余用 `Card`(`rounded-xl p-4`)— 圆角和 padding 都不同
- `DayStory` 用 `rounded-2xl`,其他卡片用 `rounded-xl`
- `TodaySummary` 的 Metric 值用 `text-base`,`HistoryPage` 的 Metric 用 `text-sm` — 同名组件尺寸不一致
- **建议**:统一卡片圆角/padding,或明确 Panel 与 Card 的使用边界

### 7. `BacklogTaskCard` 用原生 `<input type="date">` 而非 `Input` 组件
- 手动重建了样式,但和设计系统的 `Input` 不完全一致(padding、icon 处理不同)
- **建议**:扩展 `Input` 组件支持 date 类型,或统一样式

### 8. `LifePage` 没有用 `PageHeader`
- 自己写了 header,spacing 和其他页面不一致,且没有 `description` slot
- **建议**:改用 `PageHeader` 保持一致

### 9. `StopSessionDialog` 缺少内联错误态
- `stopActiveTask` 失败时,dialog 保持打开但无任何反馈(只有全局 toast)
- 用户可能没注意到 toast,以为没点成功而重复点击
- **建议**:dialog 内显示 inline error

### 10. `EntryDetailDialog` 进行中的 session 隐藏了 Edit 按钮,但没解释原因
- 文案说"you can add a reflection when you stop",但没有引导到 stop 流程
- **建议**:加一个按钮直接跳转到 stop session

### 11. 两个任务创建入口的默认行为不一致
- `AddTaskForm` 提交后 `dueDate` 重置为今天
- `QuickAddDialog` 提交后 `destination` 重置为 backlog(`due_date` 变 null)
- 用户在两处创建任务会得到不同的默认结果,容易困惑
- **建议**:统一默认行为,或在 UI 上明确标注当前会创建到哪里

---

## 🟢 低优先级 / 打磨

### 12. 无快捷键帮助/发现机制
- 存在全局 quick-add 快捷键、Escape 退出 zen,但用户无处查看完整快捷键列表
- **建议**:加一个 `?` 触发的快捷键浮层,或在 Settings 里展示

### 13. 可访问性细节
- `DayTimeline` session 块用 `title` 属性做 tooltip — 键盘/屏幕阅读器用户无法访问
- `CategoryDonut` SVG 没有 `role="img"` 或 `aria-label`
- `TodayLog` entry 按钮用 `focus-visible:ring-2` 而非设计系统的 `focus-visible:shadow-ring`

### 14. Today 三栏自动收起后无提示
- 窄窗口时 Log/Tasks 栏自动收起,且"只自动收起、不自动展开"
- 用户可能没意识到栏被收起了,以为功能消失
- **建议**:收起时加一个轻量提示,或在首次收起时 toast 说明

### 15. `CategoryManager` 无空状态兜底
- 虽然 Inbox 受保护不会被删光,但列表本身没有 fallback UI

---

## 💡 战略性 UX 建议

### A. Stop Session 的反思是否总是必要?
每次停止都弹 `StopSessionDialog` 要求填反思(note/blocker/next action/completion),对于频繁切换任务的场景是额外摩擦。可以考虑:短时 session(< 5min)允许快速停止跳过反思,或提供"Skip reflection"选项。

### B. My Day 的 AI debrief 依赖 API key,无 fallback 体验
没配 AI key 的用户在 My Day 页面看到"Generate story"按钮但点了会失败。建议:未配置时直接禁用按钮并提示"在 Settings 配置 AI 后可用",而非让用户点了再报错。

### C. 跨页面导航的 `requestRoute` 模式 vs 直接 prop
`LifePage` 直接拿到 `onNavigate` prop,其他组件走 `uiStore.requestRoute` 间接跳转。两种模式并存。虽然功能正常,但建议统一为一种,降低维护心智负担。

---

## 建议实施顺序

从用户可感知且改动相对集中的问题入手:

1. **#1-4**:loading 态、错误反馈、空状态统一、硬编码颜色 — 改动集中,收益明显
2. **#5**:乐观更新 — 架构性改动,需谨慎
3. **#6-11**:组件规范统一 — 渐进式打磨
4. **#12-15**:可访问性与细节 — 长期优化
5. **A-C**:战略性调整 — 需产品决策

---
title: "Yolo 开发记录 03：在桌面 App 里造一个 Agent Runtime"
date: "2026-07-05"
description: "从单轮 Chat 到 Tool Loop、权限、Undo、QuickJS Sandbox 和长期记忆：Yolo 内置 AI Agent 的架构与取舍。"
---

上一篇写完时，Yolo 已经可以生成 Daily Debrief：把任务、时间记录和 stop-note 交给模型，换回一段当天复盘。

这是一种很简单的 AI 功能。准备上下文，发一次请求，拿一段文字回来。模型不需要知道接下来会发生什么，也不会真的改变什么。

但我想做的下一件事不是「再多生成一点内容」，而是让它能处理这样的请求：

> 今天下午已经排满了。保留写周报，把低优先级的事情挪到明天，再帮我找一个 30 分钟的空档。

这句话背后至少有四步：读取今天的任务，判断优先级和时间冲突，计算空档，最后修改多条数据。中间任何一步都可能需要重新判断。

单轮 Chat 到这里就不够了。

0.5.0 到 0.7.0，我真正做的其实不是一个聊天框，而是一套跑在 Tauri + React 里的 Agent Runtime。它有 provider-neutral 的 tool loop、参数校验、权限和确认、可撤销写入、QuickJS sandbox、长期记忆，以及一套不依赖模型做数学的回顾分析。

这篇主要讲它是怎么长出来的。

## 先把一次对话拆开

现在用户发出一条消息后，实际的数据流大概是这样：

```text
Composer
   │
   ▼
assistantStore.send()
   │  snapshot tasks / settings / history
   ▼
buildAssistantContext()
   │  tasks + backlog + time + profile + memory + retro
   ▼
buildAssistantSystemPrompt()
   │
   ▼
runAssistantToolTurn()
   │
   ├─ model requests tools ─► validate ─► execute / queue
   │                              │
   │                         tool results
   │                              │
   └──────────── next step ◄──────┘
   │
   ▼
final Markdown + ToolCallRecord[]
```

`assistantStore` 是编排层。它不负责理解用户，也不负责执行具体工具；它负责拿当前状态、管理 streaming message、持久化会话、响应 Stop，以及在一轮结束后触发 memory / skill review。

真正进入模型之前，会先构造一份 `AssistantContext`。这里面有：

- 用户当前正在看的日期和本地时间；
- 今天的任务，以及最多 30 条 backlog；
- 分类和所有任务的轻量引用；
- 每日专注目标和当天负载；
- About me、相关记忆和 skills；
- 过去 30 天的估时偏差、延期和周回顾；
- 当前权限是 Plan、Ask 还是 Auto。

然后再按固定顺序拼 system prompt：Soul、用户资料、记忆、skills、权限、工具协议、当前任务，最后才是 day briefing 和历史数据。

我不想把这些东西随手拼成一大段字符串。顺序本身就是优先级：先定义它是谁和边界在哪里，再给能力，最后给数据。

## Agent Loop：模型不是回答一次就结束

最早的 Assistant 只是 multi-turn chat。很快就遇到一个问题：模型必须先查数据，看到结果以后才能决定下一步。

于是中间变成了一个最多 12 步的 loop：

```ts
for (let step = 0; step < MAX_STEPS; step++) {
  const response = await generateChat(system, messages, tools);
  const calls = parseToolCalls(response);

  if (calls.length === 0) return finalAnswer(response);

  const results = await executeCalls(calls);
  messages.push(toolExchange(calls, results));
}
```

实际实现当然比这段复杂。每一步都要处理原生 tool calls、JSON fallback、截断响应、AbortSignal、权限、pending write，以及已经执行过的工具记录。但骨架就是这样：模型提出下一步，程序执行，把事实还给模型，直到它认为任务完成。

互不依赖的 read tools 会用 `Promise.all` 并行执行。比如它可以同时读取今天的任务、估时校准和空档，不需要为三个只读查询付三次串行等待。write tools 则保持顺序，因为后一项修改可能依赖前一项已经落地的状态。

还有一个不太显眼但很重要的规则：响应如果在 output token limit 处被截断，这一批 write calls 一条都不执行。哪怕某个参数碰巧能 parse，也不能假设模型原本就想停在那里。系统会把「响应被截断，请重新发完整调用」喂回下一步。

半个 JSON 不能产生半个现实世界的副作用。

## 把 Provider 差异压在 Agent Loop 下面

Yolo 支持 Anthropic、OpenAI、Gemini 和 OpenAI-compatible endpoint。问题是，它们的 tool calling 和 streaming event 格式并不一样。

如果让 `toolLoop.ts` 到处写 `if (provider === ...)`，上层很快会烂掉。所以 provider layer 做了两件事：

1. 把统一的消息和 tool schema 转成各家的 request payload；
2. 把各家的 response / stream event 还原成统一的文本增量和 tool calls。

支持 native function calling 时就走原生协议。某些兼容端点没有实现 tools，或者响应格式不完整时，system prompt 还定义了一份 JSON fallback：

```json
{
  "tool_calls": [
    {
      "name": "update_task",
      "args": {
        "task_id": "task-1",
        "planned_start_time": "14:30"
      }
    }
  ]
}
```

上层最终只处理同一种 `ParsedToolCall[]`。

所有请求统一经过 Tauri HTTP plugin，而不是浏览器 `fetch`。这是桌面 App 里很现实的一层：不少模型 API 不接受 webview origin，直接从 renderer 请求会撞上 CORS。Tauri 的 transport 把这件事放到了 Rust 侧。

## Streaming 最难的不是打字机效果

Assistant 的每一步都会 streaming 到 UI。用户能看到它在查什么，也可以随时 Stop。

看起来只是把 token 不断 append 到 message，真正麻烦的是：流出来的东西不一定是最终回答。它可能是 reasoning，也可能是还没拼完的 tool-call JSON。

所以 live assistant message 是一个临时容器。第一批 token 到达时才创建；如果后面确认这一段属于 tool call，就从正常消息里拿走，折叠到 reasoning panel。否则用户会先看到一坨 JSON，下一秒又凭空消失。

Stop 也不是简单把按钮禁用。`AbortSignal` 会从 store 一路传到 provider request。中断后，只有两种东西值得保留：已经产生的可读文本，以及已经执行或排队的 ToolCallRecord。一个空壳 placeholder 不应该进入会话历史。

这类状态机很难靠手动点几次验证，所以 model call、clock、ID generator 和 task store adapter 都做成了 injectable dependency。stream 中断、空响应、半截 tool call、provider payload 都能用固定输入重放。到 0.7.0，前端测试是 96 个文件、693 条；Agent 是增长最快的那一部分。

模型输出越不稳定，包住它的代码越应该稳定。

## Tool Registry：能力必须只有一个入口

Agent 当前能读取任务、搜索任务、找空档、查看估时校准、召回历史，也能创建、更新、开始、暂停、完成、移回 backlog 和 drop 任务。

这些能力不直接散落在 prompt 里，而是统一注册为 `AgentTool`：

```ts
interface AgentTool {
  name: string;
  category: "read" | "write";
  parameters: ZodSchema;
  destructive?: boolean;
  destructiveFor?: (args: unknown) => boolean;
  execute(args: unknown, deps: AgentToolDeps): Promise<ToolResult>;
}
```

Registry 同时服务三件事：生成给模型看的 tool catalog，给 native function calling 提供 schema，以及运行时查找真正的 execute。

所有参数在边界先过 Zod。未知工具或错误参数会变成 tool result 返回给模型，让它有机会修正；一条坏调用不会把整轮对话炸掉。

工具也不能绕过任务状态机。`update_task({ status: "done" })` 不会直接写一个字符串，而是路由到 `completeTask()`，确保 active timer 被关闭，`completed_at` 也一起更新。Agent 用的仍然是 App 自己的业务规则。

这是 registry 最实际的价值：给模型多少能力，不取决于 prompt 里怎么说，而取决于程序到底注入了什么。

## 权限不是 Prompt，而是执行层的 Gate

只在 system prompt 里写「修改前请确认」没有意义。模型迟早会忘。

Yolo 的权限在 tool execution 前判断：

| 模式 | Read | 可撤销 Write | 破坏性 Write |
|---|---|---|---|
| Plan | 直接执行 | 排队确认 | 排队确认 |
| Ask | 直接执行 | 排队确认 | 排队确认 |
| Auto | 直接执行 | 直接执行，可撤销 | 排队确认 |

破坏性也不是只看 tool 名字。同一个 `update_task`，改标题是普通写入，把 status 改成 dropped 就应该和 `drop_task` 一样确认。因此工具可以用 `destructiveFor(args)` 按这一次调用的参数判断。

需要确认的调用不会执行，而是生成一张 pending card。这里我还踩过一个很烦的交互问题：模型先在聊天里问「确定吗」，用户回答确定，然后 UI 又弹一张 Apply，等于确认两次。

现在规则是：卡片本身就是确认。请求清楚时模型直接发 tool call，执行层决定是落地还是排队，不再让语言层多问一次。

## Undo 不只是再改回去

Auto 模式之所以能成立，是因为每次可撤销写入都会返回一份 `UndoOp`。

创建任务的反向操作是删除新任务；修改任务则保存修改前的完整 snapshot，包括 `completed_at` 和 `dropped_at`。否则把一个完成任务改回 pending 时，数据库里可能还留着完成时间。

但保存 snapshot 还不够。假设 Agent 修改任务以后，用户又手动改了一次；此时直接 Revert，会拿一份旧状态覆盖用户的新修改。

所以 Undo 同时记录执行完成时的 `expectedUpdatedAt`。撤销前发现当前 `updated_at` 已经不同，就先报告 drift，让用户决定是否仍然覆盖。

批量 Apply 还有另一种冲突。把三件首尾相接的任务整体后移时，第一件可能先撞上第二件尚未腾出的时间。`Apply all` 不是简单 `Promise.all`，而是做多轮尝试：

```text
pass 1: 能落地的先落地
pass 2: 使用刚释放的时间槽继续
...
直到全部完成，或完整一轮没有任何进展
```

后一种情况才被当作真实冲突。这是一个很小的 fixed-point loop，但比「请用户按正确顺序点 Apply」可靠得多。

## PTC：让模型写程序，但不让它碰 Host

普通 tool calling 很适合一两个动作。碰到批量、循环和条件逻辑时，它会变得又慢又贵。

比如：

> 找出所有过期的低优先级任务；有 note 的排到下周，没有 note 的移回 backlog。

用普通 loop，模型要反复生成几十个 tool calls，中间结果还要来回塞进上下文。于是我加了一个 `execute_program`：让模型生成一小段 JavaScript，直接用循环和分支调用 tools。

直接 `eval` 模型输出当然不在选项里。程序运行在 QuickJS WebAssembly VM 中：

- 没有 host 网络、文件系统和浏览器 API；
- 只有 registry bridge 显式注入的 tools；
- 有 wall-clock timeout；
- 支持用户 Abort；
- 单次最多调用 300 个 tools；
- VM 在 `finally` 中销毁；
- QuickJS 加载失败时，Agent 退回普通 tool calling。

更关键的是，sandbox 没有第二套权限系统。Bridge 调用的仍然是同一个 registry，所以 Zod 校验、Plan / Ask / Auto、`destructiveFor` 和 UndoOp 全部保留。Ask 模式下，程序里的 write 只会返回 queued sentinel，然后继续运行；它不会因为藏在一段代码里就获得额外权限。

我喜欢这一层的原因，是它把「能力」和「权力」分开了。模型可以更有效率地表达一个复杂计划，但它能改变什么，仍然由 Host 决定。

## 确定性数据，模型只负责叙述

Assistant 不只是改任务，它还会回答「我最近为什么总是估不准」或者「这周时间花在哪」。这里最容易偷懒的做法，是把原始 time entries 丢给模型，让它自己算。

我没有这么做。

`src/services/retrospect/` 里，`loadHistory.ts` 是唯一碰数据库的文件。加载最近 30 天的数据后，其余全部是纯函数：

- `calibration.ts` 计算 estimate / actual ratio，并按样本数给置信度；
- `slips.ts` 找 overdue、lingering、dropped tasks 和重复 blocker；
- `weeklyReview.ts` 比较本周与上周的分钟数和分类变化。

模型看到的是「actual 是 estimate 的 138%，样本 7 条」，而不是七行原始数据。Prompt 里还明确标记 `pre-computed — do not recalculate`。

同样，Assistant 顶部的 day briefing 和 `find_free_slots` 也是 TypeScript 算的。时间相加、空档和冲突都有确定答案，不需要花 token 请一个概率模型心算。

我现在对 AI-native 的理解反而更保守：能由代码确定的事情，就不要交给模型。模型应该处理意图、取舍和表达，而不是替代 `reduce()`。

## Memory 和 Skills 是两条后台学习环

Conversation history 解决的是「上次说了什么」，长期记忆解决的是「以后还应该知道什么」。这两件事不能混在一起。

Yolo 的 memory 分成同步读取和异步写入两条路径。

每轮开始前，TypeScript 根据关键词重合、pin 和使用次数做排名，只把最相关的 8 条 memory 放进 prompt。没有 embedding，也没有每轮去问模型「哪些相关」。召回是确定性的、便宜的，也很容易解释为什么命中。

一轮结束后，才在后台执行：

```text
gate → prompt → parse → fold → persist
```

Gate 先跳过「好」「谢谢」这类没有学习价值的回合。辅助模型只提出 add / update / archive 操作；parser 丢弃无效输出；纯函数负责去重、处理矛盾和保护 pinned memory；最后才落库。内容只 archive，不 hard delete。整个 review debounce 1.5 秒并且 fire-and-forget，失败不会阻塞当前对话。

Skills 复用了同一套结构，但保存的是过程，不是事实。只有一轮真的执行了多个 tools，系统才尝试抽取一条通用流程。里面不能出现具体 task id，只保存触发条件和步骤。下一次遇到相似请求，再取最相关的几条放回 system prompt。

Memory 是「我习惯上午做深度工作」，Skill 是「重排下午时，先查固定会议，再按优先级放入空档」。一个保存用户，一个保存做事方法。

它们都可以在 Settings 里查看、编辑、pin、忘记和恢复。后台 review 也可以单独指定便宜一些的模型。学习不能变成一个看不见、关不掉、还持续烧主模型 token 的黑箱。

## 这套架构目前并不完美

做完以后，复杂度也很诚实地留在了几个地方。

第一，tool parameters 目前同时维护 Zod 和 native tool calling 需要的 JSON Schema。两份定义可能漂移，理想状态应该从一份 schema 生成另一份。

第二，memory、skills 和历史 recall 仍然是 lexical ranking。它便宜、确定，但遇到跨语言或完全不同的表达，召回会变弱。数据量继续长大以后，这里迟早要重新选方案。

第三，prompt 现在靠 backlog、history、memory 和 skill 的数量上限控制体积，没有真正按 provider 做 token budgeting。

第四，QuickJS sandbox 是整个系统认知负担最高的代码。WASM 的异步 job pumping、timeout 和资源释放都很敏感，升级依赖时必须格外小心。

还有一个更现实的问题：Yolo 的 MCP server 和 App 内 Agent 各自实现了一套 task/session 规则。现在行为一致，但任何 lifecycle 变化都要同步改两边。长期看，它们应该共享一层真正的 domain package。

这些不是「以后再优化」四个字能抹掉的问题。它们就是当前架构用简单性、确定性和开发速度换来的边界。

## Agent 之外，这几个版本还改变了什么

0.6.0 把视线拉回了专注本身。Zen 模式加入 Rain、Fire、River 三种 canvas 场景，以及雨、火、流水、风、鸟和 brown noise 的独立 mixer。Canvas 会在窗口隐藏时暂停，限制 device pixel ratio，并为 reduced motion 只渲染静态帧；音频只有一个 app-level owner，避免全屏层和底下卡片同时播放两份。

同一版本还加入 Rest mode。休息有独立计时和记录，但不会伪装成任务，也不会算进 focused time。对一个强调「真实时间」的产品来说，这个数据边界比多一个倒计时重要。

0.7.0 则回到每天最常碰的路径：Quick Add 能把「明天 review deck，高优，30 分钟」解析成结构化字段，解析失败就原样保存输入；Backlog 有了分组、排序和持久化视图；Today 顶部增加从午夜到午夜的 day line；macOS 菜单栏用等宽数字显示当前 timer；页面和列表统一成一层很轻的 motion。

项目也第一次有了独立网站和 macOS / Windows release workflow。Windows release 多开 console、提醒卡片堆满角落、窗口变窄覆盖布局偏好，这些不漂亮的问题也都在这几版里补掉了。

它们和 Agent 架构看起来不是一类工作，但最后指向同一件事：Yolo 要变成一个每天真的能开的桌面 App，而不只是一个有趣的 AI demo。

## 写在后面

从 0.5.0 到 0.7.0，我对「给产品加一个 Agent」最大的感受是：模型反而只是里面最容易替换的一层。

真正决定它是否可用的，是模型以外的部分：上下文有没有边界，工具是不是唯一入口，写操作能不能确认和撤销，批量任务怎样处理冲突，半截响应会不会产生副作用，模型写的程序被关在哪里，记忆能不能被用户看见，数字到底是谁算的。

这些代码不会让 Agent 在 demo 里显得更聪明，却决定了我敢不敢把真实的一天交给它。

上一篇写的是 Yolo 开始看清一天。这一次，我更像是在给它造一双手——但先把关节、护栏和刹车做好，再让它碰方向盘。

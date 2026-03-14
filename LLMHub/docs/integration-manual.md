# LLMHub 接入手册（Integration Manual）

> 本文档面向 SS-Helper 体系内需要使用 AI 能力的插件开发者。  
> 阅读前建议先了解 [_TemplatePlugin/开发规范指引.md](../../_TemplatePlugin/开发规范指引.md) 中的基础插件结构。

---

## 1. 架构概述

LLMHub 采用 **四层分离架构**：

| 层级 | 模块 | 职责 |
|------|------|------|
| L1 | **Registry**（注册中心） | 消费方身份注册、任务声明、能力约束持久化 |
| L2 | **Router**（路由器） | 按 6 级优先级解析 provider → 全局/插件/任务默认 |
| L3 | **Orchestrator**（编排器） | 请求入队、去重、替换、作用域取消、双 Promise 分离 |
| L4 | **Display Controller**（展示控制器） | 覆层生命周期、静默权限管理 |

插件通过 `window.STX.llm` 获取的 **LLMSDK** 门面与这四层交互，无需直接引用内部模块。

---

## 2. 快速开始

### 2.1 注册消费方

在插件初始化阶段调用 `registerConsumer`，声明你的插件 ID、展示名称和任务列表：

```ts
const llm: LLMSDK = (window as any).STX?.llm;
if (!llm) throw new Error('LLMHub 未就绪');

llm.registerConsumer({
    pluginId: 'stx_my_plugin',
    displayName: 'My Plugin',
    registrationVersion: 1,
    tasks: [
        {
            taskId: 'summarize',
            taskKind: 'generation',
            requiredCapabilities: ['chat'],
            description: '对话摘要',
            backgroundEligible: false,
        },
        {
            taskId: 'embed_chunks',
            taskKind: 'embedding',
            requiredCapabilities: ['embeddings'],
            description: '文本向量化',
            backgroundEligible: true,
        },
    ],
});
```

> **幂等性**：重复调用 `registerConsumer` 会执行 upsert——同一 `pluginId` 的注册信息直接覆盖，不会报错。

### 2.2 执行 AI 任务

```ts
const result = await llm.runTask<string>({
    consumer: 'stx_my_plugin',
    taskId: 'summarize',
    taskKind: 'generation',
    input: { messages: [{ role: 'user', content: '请总结以下内容…' }] },
});

if (result.ok) {
    console.log('摘要:', result.data);
    console.log('耗时:', result.meta.latencyMs, 'ms');
} else {
    console.error('失败:', result.error, result.reasonCode);
}
```

### 2.3 向量化

```ts
const embedResult = await llm.embed({
    consumer: 'stx_my_plugin',
    taskId: 'embed_chunks',
    texts: ['hello world', '你好世界'],
});
```

### 2.4 重排序

```ts
const rerankResult = await llm.rerank({
    consumer: 'stx_my_plugin',
    taskId: 'search_rerank',
    query: '什么是记忆系统？',
    docs: ['记忆系统是...', '角色卡是...', '世界书是...'],
    topK: 2,
});
```

---

## 3. 核心概念

### 3.1 CapabilityKind 与 LLMCapability

```ts
type CapabilityKind = 'generation' | 'embedding' | 'rerank';

type LLMCapability =
    | 'chat'       // 文本对话
    | 'json'       // 结构化 JSON 输出
    | 'tools'      // 工具/函数调用
    | 'embeddings' // 向量化
    | 'rerank'     // 重排序
    | 'vision'     // 图像理解
    | 'reasoning'; // 推理/思维链
```

- `CapabilityKind` 是任务大类，决定路由层对应的三棵默认树。
- `LLMCapability` 是细粒度能力标签；每个 Provider 声明自己支持的能力集合。
- 设置页面中候选 Provider 下拉列表会按 `requiredCapabilities` 自动过滤，不满足能力约束的 Provider **不会出现在候选项中**。

### 3.2 TaskDescriptor

```ts
interface TaskDescriptor {
    taskId: string;            // 任务唯一标识
    taskKind: CapabilityKind;  // 所属大类
    requiredCapabilities: LLMCapability[];  // 执行该任务需要的能力
    recommendedRoute?: { providerId?: string; profileId?: string };
    recommendedDisplay?: DisplayMode;
    description?: string;
    backgroundEligible?: boolean;  // 是否允许静默执行
}
```

| 字段 | 说明 |
|------|------|
| `taskId` | 在你的插件内唯一。路由层按 `pluginId::taskId` 组合键读取覆盖配置。 |
| `taskKind` | 必填。决定该任务走哪条路由链路。 |
| `requiredCapabilities` | 该任务对 Provider 的最低能力要求。Router 会用此字段过滤不合格候选。 |
| `backgroundEligible` | 设为 `true` 表示该任务可以在后台静默运行（不弹覆层），否则必须弹出 UI 展示结果。 |

### 3.3 路由解析优先级

Router 按以下 6 级优先级从高到低查找 Provider：

1. **routeHint**（调用时主动指定）
2. **用户任务覆盖**（设置页 View C 中用户为特定 `pluginId::taskId` 配的覆盖）
3. **插件推荐绑定**（`registerConsumer` 时附带的 `routeBindings`）
4. **用户插件默认**（设置页 View B 中用户为该插件某 `capabilityKind` 配的默认）
5. **用户全局默认**（设置页 View A 中用户为某 `capabilityKind` 配的全局默认）
6. **fallback**（系统兜底）

`LLMRunResult.meta.resolvedBy` 字段会告知最终生效的是哪一级。

### 3.4 双 Promise 分离

`runTask()` 返回的 Promise 在 **AI 结果到达时** 就 resolve，不会阻塞到覆层关闭。如果你需要等待用户关闭展示覆层后再执行后续逻辑，请额外调用 `waitForOverlayClose`：

```ts
const result = await llm.runTask<string>({ consumer: 'stx_my_plugin', taskId: 'summarize', taskKind: 'generation', input: { ... } });
if (result.ok) {
    // AI 结果已经拿到，但覆层可能仍在显示
    await llm.waitForOverlayClose(result.meta.requestId);
    // 现在覆层已关闭，可以安全地进行下一步操作
}
```

> **⚠ 警告**：不要对 `runTask()` 返回的 Promise 使用外部 `Promise.race` 或 `setTimeout` 来实现超时。请使用 `budget.maxLatencyMs` 参数让编排器内部处理超时，这样可以正确清理覆层和队列状态。

---

## 4. 请求编排

### 4.1 RequestEnqueueOptions

```ts
interface RequestEnqueueOptions {
    dedupeKey?: string;
    replacePendingByKey?: string;
    cancelOnScopeChange?: boolean;
    displayMode?: DisplayMode;
    scope?: RequestScope;
    blockNextUntilOverlayClose?: boolean;
}

interface RequestScope {
    chatId?: string;
    sessionId?: string;
    pluginId?: string;
}
```

| 字段 | 用途 |
|------|------|
| `dedupeKey` | 去重键。如果队列中已存在相同 `dedupeKey` 的 pending 请求，新请求会被直接丢弃。 |
| `replacePendingByKey` | 替换键。提交时自动取消队列中同一 `replacePendingByKey` 的旧请求。适用于"最新查询覆盖旧查询"的场景。 |
| `cancelOnScopeChange` | 当 `scope` 发生变化（如切换聊天）时自动取消该请求。 |
| `displayMode` | 覆层展示模式：`fullscreen`（全屏）、`compact`（紧凑）、`silent`（静默/不弹框）。 |
| `scope` | 请求的作用域绑定，通常传入当前 `chatId`。 |
| `blockNextUntilOverlayClose` | 如果为 `true`，编排器会等到该请求的覆层关闭后才处理下一个请求。 |

### 4.2 去重与替换示例

```ts
// 用户快速连续输入时，只保留最后一次搜索
const result = await llm.runTask({
    consumer: 'stx_my_plugin',
    taskId: 'search',
    taskKind: 'generation',
    input: { query: userInput },
    enqueue: {
        replacePendingByKey: `search::${chatId}`,
        cancelOnScopeChange: true,
        scope: { chatId },
    },
});
```

### 4.3 DisplayMode

| 模式 | 行为 |
|------|------|
| `fullscreen` | 全屏覆层，适合长文本展示 |
| `compact` | 紧凑浮窗，适合简短通知 |
| `silent` | 不弹出覆层。需要 `backgroundEligible: true` 且已被授予静默权限。 |

如果请求的 `displayMode` 为 `silent` 但 Display Controller 判定不允许（未授权或 `backgroundEligible` 为 false），会自动降级为 `compact`。

---

## 5. 覆层交互

### 5.1 更新覆层

在 AI 结果流式到达时，可以通过 `updateOverlay` 实时刷新覆层内容：

```ts
const result = await llm.runTask<string>({
    consumer: 'stx_my_plugin',
    taskId: 'stream_chat',
    taskKind: 'generation',
    input: { messages },
});

// 在流式回调中：
llm.updateOverlay(requestId, {
    status: 'streaming',
    progress: 0.5,
    content: { type: 'markdown', body: partialText },
});

// 结果完成后：
llm.updateOverlay(requestId, {
    status: 'done',
    progress: 1.0,
    content: { type: 'markdown', body: fullText },
    autoClose: true,
    autoCloseMs: 3000,
});
```

### 5.2 LLMOverlayPatch

```ts
interface LLMOverlayPatch {
    title?: string;
    status?: 'loading' | 'streaming' | 'done' | 'error';
    progress?: number;               // 0.0 ~ 1.0
    content?: { type: 'text' | 'markdown' | 'html'; body: string };
    actions?: Array<{
        id: string;
        label: string;
        style?: 'primary' | 'secondary' | 'danger';
        closeOnClick?: boolean;
    }>;
    displayMode?: DisplayMode;
    autoClose?: boolean;
    autoCloseMs?: number;
}
```

### 5.3 关闭覆层

```ts
llm.closeOverlay(requestId, 'user_dismissed');
```

---

## 6. 结果结构

```ts
type LLMRunResult<T> =
    | { ok: true;  data: T;     meta: LLMRunMeta }
    | { ok: false; error: string; retryable?: boolean; fallbackUsed?: boolean; reasonCode?: string; meta?: LLMRunMeta };
```

```ts
interface LLMRunMeta {
    requestId: string;
    providerId: string;
    model?: string;
    capabilityKind: CapabilityKind;
    queuedAt: number;
    startedAt?: number;
    finishedAt?: number;
    latencyMs?: number;
    fallbackUsed?: boolean;
}
```

关键字段：
- `meta.requestId`：用于后续 `waitForOverlayClose` / `updateOverlay` / `closeOverlay`。
- `meta.latencyMs`：从开始执行到拿到结果的毫秒数。
- `meta.fallbackUsed`：如果首选 Provider 失败后使用了 fallback，此字段为 `true`。
- `reasonCode`：失败时的错误分类码，如 `'budget_exceeded'`、`'provider_unavailable'`、`'capability_mismatch'`。

---

## 7. 预算控制

可在 `runTask` 中传入 `budget` 参数限制单次请求的资源消耗：

```ts
const result = await llm.runTask({
    consumer: 'stx_my_plugin',
    taskId: 'summarize',
    taskKind: 'generation',
    input: { ... },
    budget: {
        maxTokens: 2000,
        maxLatencyMs: 5000,   // 5 秒超时——编排器内部会处理
        maxCost: 0.05,
    },
});
```

> `budget.maxLatencyMs` 是推荐的超时方式，优于外部 `Promise.race`。编排器会在超时后正确清理覆层和队列状态。

管理员还可以在设置页面的预算规则区域为特定插件配置全局预算上限（maxRPM、maxTokens 等）。

---

## 8. 失效绑定与降级

### 8.1 什么是 stale binding？

当用户在设置页面为某个任务配置了覆盖（Task Override），但后续该任务的 `requiredCapabilities` 变化导致绑定的 Provider 不再满足能力要求时，该覆盖会被标记为 **stale（失效）**。

设置页面 View C 中失效绑定会显示红色的 `⚠ 绑定失效` 警告。

### 8.2 降级行为

- 失效的 Task Override 在路由解析时会被跳过，自动回退到下一优先级。
- 插件不需要为此做特殊处理——Router 内部处理了降级逻辑。
- 如果你关心是否发生了降级，可以检查 `result.meta.resolvedBy` 的值。

---

## 9. 注销

在插件卸载时调用 `unregisterConsumer` 清理注册信息：

```ts
llm.unregisterConsumer('stx_my_plugin');
```

传入 `{ keepPersistent: true }` 可以保留持久化快照（会话数据清除，但注册信息留存）：

```ts
llm.unregisterConsumer('stx_my_plugin', { keepPersistent: true });
```

---

## 10. 完整接入示例

```ts
// my-plugin/src/index.ts

const PLUGIN_ID = 'stx_my_plugin';

export async function init(): Promise<void> {
    const llm: LLMSDK = (window as any).STX?.llm;
    if (!llm) {
        console.warn('LLMHub 不可用，AI 功能已禁用');
        return;
    }

    // 注册
    llm.registerConsumer({
        pluginId: PLUGIN_ID,
        displayName: 'My Plugin',
        registrationVersion: 2,
        tasks: [
            {
                taskId: 'analyze',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                description: '角色行为分析',
                backgroundEligible: false,
            },
            {
                taskId: 'index_memory',
                taskKind: 'embedding',
                requiredCapabilities: ['embeddings'],
                description: '记忆向量化',
                backgroundEligible: true,
            },
        ],
    });

    // 执行生成任务
    const result = await llm.runTask<{ intent: string; confidence: number }>({
        consumer: PLUGIN_ID,
        taskId: 'analyze',
        taskKind: 'generation',
        input: {
            messages: [{ role: 'user', content: '分析以下对话中角色的意图…' }],
        },
        schema: { type: 'object', properties: { intent: { type: 'string' }, confidence: { type: 'number' } } },
        budget: { maxLatencyMs: 8000 },
        enqueue: {
            displayMode: 'compact',
            cancelOnScopeChange: true,
            scope: { chatId: currentChatId },
        },
    });

    if (result.ok) {
        console.log(`意图: ${result.data.intent}, 置信度: ${result.data.confidence}`);
        console.log(`由 ${result.meta.providerId} (${result.meta.model}) 处理，耗时 ${result.meta.latencyMs}ms`);

        // 等待覆层关闭
        await llm.waitForOverlayClose(result.meta.requestId);
    }

    // 执行向量化
    const embedResult = await llm.embed({
        consumer: PLUGIN_ID,
        texts: ['记忆片段 A', '记忆片段 B'],
        enqueue: { displayMode: 'silent' },
    });
}

export function dispose(): void {
    const llm = (window as any).STX?.llm;
    llm?.unregisterConsumer(PLUGIN_ID);
}
```

---

## 11. 常见问题

**Q: `runTask` 返回 `{ ok: false, reasonCode: 'capability_mismatch' }` 怎么办？**  
A: 检查你的 `requiredCapabilities` 是否与当前配置的 Provider 能力匹配。可能需要在设置页面更换 Provider。

**Q: 覆层没有弹出？**  
A: 检查 `displayMode` 是否为 `silent`，以及该任务的 `backgroundEligible` 是否为 `true`。

**Q: 如何知道请求被去重了？**  
A: 使用 `dedupeKey` 时，如果队列中已有相同 key 的 pending 请求，新请求的 Promise 会被 reject 并带有 `reasonCode: 'deduped'`。

**Q: `registrationVersion` 有什么用？**  
A: 注册中心用它来判断是否需要更新已持久化的快照。递增版本号以确保新的任务声明生效。

**Q: 能不能同时发多个请求？**  
A: 可以。编排器会将请求入队并按顺序处理。使用 `replacePendingByKey` 可以实现"最新覆盖旧的"语义。

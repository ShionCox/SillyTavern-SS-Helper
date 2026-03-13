# SS-Helper 统一数据库 SDK 用法与规范

## 概览

所有插件的**聊天级数据**统一存储在名为 `ss-helper-db` 的 Dexie (IndexedDB) 数据库中。
插件**禁止直接使用** `indexedDB.open()` 或自行创建 Dexie 实例。

> **设置数据**（pluginSettings / pluginUiState / 主题）仍然走 `SDK/settings.ts` 的同步 localStorage 接口，不走 IndexedDB。

---

## 存储分层速查

| 数据类型 | 存储位置 | 接口类型 | 说明 |
|---------|---------|---------|------|
| 插件设置 (settings) | localStorage/accountStorage | **同步** | `createSdkPluginSettingsStore` |
| UI 状态 (uiState) | localStorage/accountStorage | **同步** | `readSdkPluginUiState` |
| 主题偏好 | localStorage | **同步** | `getSdkThemeState` |
| 聊天级快照 (state) | `ss-helper-db.chat_plugin_state` | **异步** | `writeSdkPluginChatState` |
| 聊天级时间线 (records) | `ss-helper-db.chat_plugin_records` | **异步** | `appendSdkPluginChatRecord` |
| 跨插件共享信号 | `ss-helper-db.chat_documents` | **异步** | `patchSdkChatShared` |
| MemoryOS 高频数据 | `ss-helper-db` 专属表 | **异步** | 直接通过 `db.*` 操作 |
| 凭据 | `ss-helper-db.llm_credentials` | **异步** | 由 VaultManager 内部管理 |

---

## 导入方式

所有 API 统一从 `SDK/db` 导入：

```ts
// 推荐：从 barrel 导入
import {
  readSdkPluginChatState,
  writeSdkPluginChatState,
  patchSdkChatShared,
  appendSdkPluginChatRecord,
  // ...
} from '../../../SDK/db';
```

**禁止**直接导入 `SDK/db/database.ts` 或 `SDK/db/chat-data.ts`，应始终通过 `SDK/db/index.ts` 导入。

如果是 MemoryOS 内部 Manager，通过本地 re-export 导入：

```ts
// MemoryOS Manager 内部用法
import { db, type DBFact } from '../db/db';
```

---

## 核心概念

### pluginId 命名规范

每个插件有且只有一个 `pluginId`，格式为 `stx_` 前缀 + 插件名：

| 插件 | pluginId |
|------|----------|
| RollHelper | `stx_rollhelper` |
| MemoryOS | `stx_memory_os` |
| LLMHub | `stx_llmhub` |

**所有 API 调用必须传入自己的 pluginId**，不得使用其他插件的 pluginId 进行写入。

### chatKey

`chatKey` 由 SDK 的 `buildSdkChatKeyEvent()` 生成，格式为：

```
tavernInstanceId::scopeType::scopeId::chatId
```

**永远不要手动拼接 chatKey**，必须通过 SDK tavern 模块获取：

```ts
import { buildSdkChatKeyEvent } from '../../../SDK/tavern';
const chatKey = buildSdkChatKeyEvent();
if (!chatKey) return; // 上下文不可用时返回空字符串
```

---

## 公共三张表 API

### 1. chat_documents — 聊天主文档

每个聊天有且只有一条主文档，包含公共元数据和跨插件共享字段。

```ts
// 确保主文档存在（不存在则创建）
const doc = await ensureSdkChatDocument(chatKey, ref);

// 读取主文档
const doc = await getSdkChatDocument(chatKey);

// 修改 shared 区域（信号、标签、标记）
await patchSdkChatShared(chatKey, {
  signals: {
    stx_rollhelper: {
      lastRollSummary: '2d6=7',
      hasPendingRound: true,
      activeStatusCount: 3,
    },
  },
});
```

#### shared.signals 规范

- `signals[pluginId]` 只存放**轻量摘要**，不放完整业务数据
- 每个插件只写自己的 pluginId 键，不覆盖其他插件的信号
- `patchSdkChatShared` 对 signals 做**浅合并**：只更新传入的 pluginId 键，不影响其他插件
- 信号内容应为可序列化的简单值（string / number / boolean），避免嵌套复杂对象

**推荐的 signals 内容**：

```ts
// RollHelper
shared.signals.stx_rollhelper = {
  lastRollSummary: string,    // 最近一次掷骰概要
  hasPendingRound: boolean,   // 是否有待处理轮次
  activeStatusCount: number,  // 当前状态数量
}

// MemoryOS
shared.signals.stx_memory_os = {
  activeTemplate: string | null,  // 活跃模板 ID
  lastSummaryAt: number,          // 最近摘要时间戳
  factCount: number,              // 事实条数
  eventCount: number,             // 事件条数
}

// LLMHub
shared.signals.stx_llmhub = {
  currentProvider: string,  // 当前 provider
  currentModel: string,     // 当前模型
  profile: string,          // 当前 profile
}
```

### 2. chat_plugin_state — 插件×聊天快照

每个插件在每个聊天中最多一条状态记录（复合主键 `[pluginId+chatKey]`）。

```ts
// 写入（自动合并已有 state）
await writeSdkPluginChatState('stx_rollhelper', chatKey, {
  state: {
    activeStatuses: [...],
    pendingRound: {...},
  },
  summary: {
    statusCount: 3,
    hasPendingRound: true,
  },
});

// 读取
const row = await readSdkPluginChatState('stx_rollhelper', chatKey);
if (row) {
  const state = row.state; // Record<string, unknown>
}

// 列出某插件所有聊天的摘要
const summaries = await listSdkPluginChatStateSummaries('stx_rollhelper', {
  chatKeyPrefix: 'my-tavern::',
  limit: 50,
});

// 删除
await deleteSdkPluginChatState('stx_rollhelper', chatKey);
```

#### 重要注意

- `writeSdkPluginChatState` 对 `state` 字段做**浅合并** (`{ ...existing.state, ...newState }`)
- 如果需要完全替换 state，传入完整对象即可（旧的键会被保留，新键覆盖）
- 如果需要删除某个 state 键，显式设为 `null` 或 `undefined`
- `summary` 仅在传入 `opts.summary` 时更新，否则保留旧值
- `schemaVersion` 可用于数据格式升级判断

### 3. chat_plugin_records — 插件×聊天历史明细

用于存储时间线型数据（掷骰结果、轮次快照、上下文历史等）。自增主键，按时间戳索引。

```ts
// 追加一条记录
await appendSdkPluginChatRecord('stx_rollhelper', chatKey, 'roll_results', {
  recordId: crypto.randomUUID(),
  payload: { dice: '2d6', result: 7, critical: false },
});

// 查询记录（默认按时间倒序）
const records = await querySdkPluginChatRecords(
  'stx_rollhelper', chatKey, 'roll_results',
  { limit: 20, order: 'desc' },
);

// 按时间范围查询
const recent = await querySdkPluginChatRecords(
  'stx_rollhelper', chatKey, 'roll_results',
  { fromTs: Date.now() - 3600000, toTs: Date.now() },
);

// 删除特定 collection 的记录
await deleteSdkPluginChatRecords('stx_rollhelper', chatKey, 'roll_results');

// 删除该插件在该聊天的所有记录
await deleteSdkPluginChatRecords('stx_rollhelper', chatKey);
```

#### collection 命名规范

使用小写 snake_case，描述记录用途：

| 插件 | collection | 用途 |
|------|-----------|------|
| RollHelper | `roll_results` | 每次掷骰结果 |
| RollHelper | `round_summaries` | 轮次快照 |
| LLMHub | `context_history` | 聊天上下文历史（预留） |

---

## 跨插件访问控制

### 读取规则（宽松）

任何插件都可以读取：

```ts
import {
  readChatShared,
  readPluginSignal,
  listAllPluginSignals,
  readPluginChatSummary,
} from '../../../SDK/db';

// 读取所有插件的信号
const signals = await listAllPluginSignals(chatKey);
const rollSignal = signals['stx_rollhelper'];

// 读取特定插件的信号
const memorySignal = await readPluginSignal(chatKey, 'stx_memory_os');

// 读取其他插件的 summary（不含完整 state）
const rollSummary = await readPluginChatSummary('stx_rollhelper', chatKey);
```

### 写入规则（严格）

- **只能写自己 pluginId 的**  `chat_plugin_state` 和 `chat_plugin_records`
- **共享区**通过 `patchSdkChatShared` 写入，自动按 pluginId 隔离信号
- **修改其他插件数据**必须走 SDK RPC 能力调用（`request` / `respond`）

```ts
// ❌ 错误：写别人的数据
await writeSdkPluginChatState('stx_memory_os', chatKey, ...); // 你不是 MemoryOS！

// ✅ 正确：通过 RPC 请求其他插件做修改
import { request } from '../../../SDK/bus/rpc';
const result = await request('plugin:request:update_memory', 'stx_memory_os', {
  action: 'add_fact',
  data: { ... },
}, 'my_plugin');
```

---

## 内部机制：你需要知道的

### 写入去抖 (180ms)

`writeSdkPluginChatState` 和 `patchSdkChatShared` **不会立即写入 IndexedDB**。
它们先更新内存缓存，然后 180ms 后批量写入。

**这意味着**：
- 短时间内多次写入会被合并为一次 IDB 事务，性能很高
- 读取总是从内存缓存返回，不受去抖影响
- `appendSdkPluginChatRecord` 是**立即写入**的（不走去抖），因为 records 是追加型的

### 页面关闭前

如果需要确保数据已写入磁盘（如页面即将关闭）：

```ts
import { flushSdkChatDataNow } from '../../../SDK/db';
await flushSdkChatDataNow(); // 立即刷盘，清空挂起的写入
```

### 聊天切换

切换聊天时应清除旧聊天的缓存：

```ts
import { invalidateSdkChatDataCache, flushSdkChatDataNow } from '../../../SDK/db';

// 先刷盘确保旧数据写入
await flushSdkChatDataNow();
// 再清除缓存
invalidateSdkChatDataCache(oldChatKey);
// 或清除全部缓存
invalidateSdkChatDataCache();
```

### 变更通知

所有写入操作会通过 SDK bus 广播变更事件：

```ts
import { subscribe } from '../../../SDK/bus/broadcast';

subscribe('sdk:chat_data:changed', (data) => {
  // data = { table, pluginId, chatKey }
  if (data.table === 'chat_plugin_state' && data.pluginId === 'stx_rollhelper') {
    // 刷新 UI
  }
});
```

---

## 旧数据迁移模式

如果你的插件之前使用独立的 IndexedDB 或 localStorage 存储聊天数据，需要实现一次性迁移：

```ts
import Dexie from 'dexie';

const MIGRATION_FLAG = 'my_plugin_migrated_to_ss_helper_db';

async function migrateLegacyData(): Promise<void> {
  if (localStorage.getItem(MIGRATION_FLAG) === '1') return;

  const databases = await Dexie.getDatabaseNames();
  if (!databases.includes('my_old_db_name')) {
    localStorage.setItem(MIGRATION_FLAG, '1');
    return;
  }

  try {
    const legacyDb = new Dexie('my_old_db_name');
    await legacyDb.open();

    // 批量导入数据...
    const rows = await legacyDb.table('my_table').toArray();
    // ... 写入到 ss-helper-db ...

    legacyDb.close();
    localStorage.setItem(MIGRATION_FLAG, '1');
  } catch (err) {
    // 不标记 flag，下次重试
  }
}
```

**关键原则**：
- 用 `localStorage` 标记迁移完成，避免重复执行
- 迁移失败时**不标记 flag**，允许下次重试
- 分批写入（每批 ~200 条），避免单事务过大
- 迁移应在插件初始化的早期（构造函数或 init 入口）以 `void` fire-and-forget 调用

---

## MemoryOS 专属表

MemoryOS 拥有 12 张专属高索引表，仍通过 `db.*` 直接操作。
其他插件**不应直接操作这些表**，应通过 MemoryOS 暴露的 SDK/RPC 接口访问记忆数据。

| 表名 | 主键 | 用途 |
|------|------|------|
| `events` | `eventId` | 聊天事件流 |
| `facts` | `factKey` | 结构化事实 |
| `world_state` | `stateKey` | 世界状态键值对 |
| `summaries` | `summaryId` | 分层摘要 |
| `templates` | `templateId` | 世界模板 |
| `audit` | `auditId` | 审计日志 |
| `meta` | `chatKey` | 元数据（每聊天一条） |
| `worldinfo_cache` | `cacheKey` | WorldInfo 缓存 |
| `template_bindings` | `bindingKey` | 模板绑定 |
| `vector_chunks` | `chunkId` | 向量分块 |
| `vector_embeddings` | `embeddingId` | 向量嵌入 |
| `vector_meta` | `metaKey` | 向量元数据 |

---

## 常见错误与注意事项

### 1. 所有聊天数据 API 都是异步的

```ts
// ❌ 错误
const state = readSdkPluginChatState('stx_rollhelper', chatKey);
console.log(state.state); // state 是 Promise！

// ✅ 正确
const state = await readSdkPluginChatState('stx_rollhelper', chatKey);
if (state) console.log(state.state);
```

### 2. 写入是 fire-and-forget 模式

信号写入和状态写入通常不需要 await（因为走去抖合并），可以用 `void`：

```ts
// 非关键路径，fire-and-forget
void patchSdkChatShared(chatKey, { signals: { ... } });
void writeSdkPluginChatState(pluginId, chatKey, newState);

// 关键路径，需要确认写入完成
await writeSdkPluginChatState(pluginId, chatKey, newState);
await flushSdkChatDataNow();
```

### 3. chatKey 可能为空

`buildSdkChatKeyEvent()` 在上下文不可用时返回空字符串。**必须检查**：

```ts
const chatKey = buildSdkChatKeyEvent();
if (!chatKey) return; // 跳过，不写入
```

### 4. 不要在 signals 里存大对象

```ts
// ❌ 错误：完整状态塞进 signals
await patchSdkChatShared(chatKey, {
  signals: {
    stx_rollhelper: { fullState: hugeObjectWith100Fields },
  },
});

// ✅ 正确：只放摘要标量
await patchSdkChatShared(chatKey, {
  signals: {
    stx_rollhelper: { statusCount: 3, lastRoll: '2d6=7' },
  },
});
```

### 5. records 的 recordId 需要你自己保证唯一

```ts
await appendSdkPluginChatRecord(pluginId, chatKey, 'roll_results', {
  recordId: crypto.randomUUID(), // ✅ 推荐使用 UUID
  payload: { ... },
});
```

### 6. 不要直接操作 `db` 单例（除非你是 MemoryOS）

```ts
// ❌ 普通插件不应该直接用 db
import { db } from '../../../SDK/db';
await db.chat_plugin_state.put(...)

// ✅ 通过 SDK API 操作
import { writeSdkPluginChatState } from '../../../SDK/db';
await writeSdkPluginChatState(pluginId, chatKey, state);
```

直接操作 `db` 会绕过缓存、去抖、广播通知和访问控制。

### 7. Dexie 版本升级

**当前数据库版本为 v1**，所有表在 v1 一次性定义。

如果需要新增表或修改索引：
- 在 `SDK/db/database.ts` 中新增 `.version(N).stores({...})` 块
- Dexie 版本号必须递增
- 只声明发生变更的表，未变更的表无需重复列出
- **不要修改已有表的主键**（会导致数据丢失）

---

## API 速查表

| API | 返回值 | 说明 |
|-----|--------|------|
| `getSdkChatDocument(chatKey)` | `Promise<DBChatDocument \| null>` | 读取聊天主文档 |
| `ensureSdkChatDocument(chatKey, ref, meta?)` | `Promise<DBChatDocument>` | 确保主文档存在 |
| `patchSdkChatShared(chatKey, patch)` | `Promise<void>` | 局部更新 shared（去抖） |
| `readSdkPluginChatState(pluginId, chatKey)` | `Promise<DBChatPluginState \| null>` | 读取插件状态 |
| `writeSdkPluginChatState(pluginId, chatKey, state, opts?)` | `Promise<void>` | 写入/合并状态（去抖） |
| `deleteSdkPluginChatState(pluginId, chatKey)` | `Promise<boolean>` | 删除插件状态 |
| `listSdkPluginChatStateSummaries(pluginId, opts?)` | `Promise<SdkPluginChatStateSummaryRow[]>` | 列出摘要 |
| `appendSdkPluginChatRecord(pluginId, chatKey, collection, record)` | `Promise<void>` | 追加记录（立即写入） |
| `querySdkPluginChatRecords(pluginId, chatKey, collection, opts?)` | `Promise<DBChatPluginRecord[]>` | 查询记录 |
| `deleteSdkPluginChatRecords(pluginId, chatKey, collection?)` | `Promise<number>` | 删除记录 |
| `invalidateSdkChatDataCache(chatKey?)` | `void` | 清除内存缓存 |
| `flushSdkChatDataNow()` | `Promise<void>` | 立即刷盘 |
| `readChatShared(chatKey)` | `Promise<DBChatDocumentShared \| null>` | 读 shared（跨插件） |
| `readPluginSignal(chatKey, pluginId)` | `Promise<Record \| null>` | 读信号（跨插件） |
| `listAllPluginSignals(chatKey)` | `Promise<Record<string, Record>>` | 读全部信号 |
| `readPluginChatSummary(pluginId, chatKey)` | `Promise<Record \| null>` | 读 summary（跨插件） |
| `validateWriteAccess(caller, target)` | `boolean` | 校验写权限 |

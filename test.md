# MemoryOS 融合 Mem0 思路 + 提示词分层方案

## 一、目标

这份方案的目标不是把 MemoryOS 改成 Mem0，而是：

**保留你现在这套更强的 recall / rank / injection 主链，把 Mem0 最值得借鉴的“记忆演化能力”接进来，同时把动态记忆从 system 中剥离，改成分层注入。**

也就是两件事一起做：

1. **融入 Mem0 风格的长期记忆 CRUD 流程**
2. **把提示词改成“system 固定规则 + dynamic memory block + user raw input”的分层结构**

---

# 二、Mem0 能借鉴的核心，不是“查三条记忆塞 prompt”

Mem0 最值得借的是这条链：

1. 从对话里抽取事实
2. 用新事实去召回近似旧记忆
3. 让 LLM 决定 `ADD / UPDATE / DELETE / NONE`
4. 当前有效记忆放向量库
5. 变更历史单独记录 

它的公开用法虽然看起来是 `search -> 拼 prompt -> add`，但真正强的地方其实是**记忆的演化流程**，不是 prompt 拼接本身 

对你来说，最合适的融合方式是：

* **保留 MemoryOS 作为“召回与注入中枢”**
* **引入 Mem0 风格的“记忆变更规划器”**

---

# 三、建议新增一层：Memory Mutation Planner

## 作用

放在“抽取结果入库”这一段，不放在 recall 主链里。

你现在已经有：

* facts
* summaries
* state
* lifecycle
* vector recall
* ranker
* recall log

但还缺一层明确的：

**“新信息进来后，旧记忆要怎么演化”**

---

## 建议的数据流

### 当前流

用户消息 / 对话结果
→ 抽取 facts / summaries / state
→ 直接落库或更新部分状态

### 改造后

用户消息 / 对话结果
→ 抽取 facts / summaries / state
→ **Memory Mutation Planner**

* 检索近似旧记录
* 判断冲突 / 冗余 / 覆盖 / 补充
* 输出 mutation actions
  → 执行 mutation
  → 更新 lifecycle / vector / history

---

## 建议的动作类型

比 Mem0 多一点，更适合你当前结构：

* `ADD`：新增独立记忆
* `MERGE`：并入旧记忆但不替换主键
* `UPDATE`：直接更新现有记录
* `INVALIDATE`：旧记忆失效但保历史
* `DELETE`：硬删，仅少数场景
* `NOOP`：不处理

Mem0 现在主要做 `ADD / UPDATE / DELETE / NONE` 
你这里更适合把 `MERGE / INVALIDATE` 加进去，因为你本身 already 有 lifecycle、distorted、forgotten 这些更细状态。

---

# 四、建议加的模块

基于你现在的主链结构，我建议新增 4 个模块。

## 1. `memory-mutation-planner.ts`

职责：

* 输入：新抽取 facts / summaries / state
* 输出：mutation actions

内部流程：

* 为每个新记忆构造 canonical text
* 去向量层 / facts / summaries 召回近似旧记录
* 汇总 lifecycle / relation / owner / sourceScope
* 交给 LLM 或规则层决定动作

---

## 2. `memory-mutation-executor.ts`

职责：

* 真正执行 `ADD / MERGE / UPDATE / INVALIDATE / DELETE`
* 更新 facts/summaries/state
* 更新 lifecycle
* 更新向量索引
* 写 mutation history

---

## 3. `memory-mutation-history.ts`

职责：

* 记录每条长期记忆的变化史
* 区分 recall log 和 mutation history

### 注意

`recall log` 记录的是：

* 这轮检索选中了什么

`mutation history` 记录的是：

* 某条长期记忆什么时候新增、合并、失效、删除

这两者不要混。

---

## 4. `memory-record-normalizer.ts`

职责：

* 给事实 / 摘要 / 状态生成稳定的 canonical form
* 避免 vector reverse lookup 完全靠 normalize text 的脆弱映射

---

# 五、向量层要怎么借鉴 Mem0

Mem0 的 vector store 很强调 metadata filter。默认就会围绕 `user_id / agent_id / run_id / actor_id` 做过滤，Qdrant 适配层甚至专门给这些字段建 payload index 

这对你特别有价值，因为你正要做“角色边界”。

---

## 你这边建议给 vector chunk 增加的 metadata

现在最应该补的是这些字段：

* `sourceRecordKey`
* `sourceRecordKind`
* `ownerActorKey`
* `sourceScope`
* `memoryType`
* `memorySubtype`
* `isShared`
* `createdAt`
* `updatedAt`
* `visibilityActors`（可选）

---

## 这样有什么用

### 1. 不再靠 normalized text 反查原记录

你现在的向量链里，命中后回 facts/summaries 很大程度还是靠文本归一化映射，这块脆。
有了 `sourceRecordKey` 之后，hit 一回来就能精准回源。

### 2. 角色边界能前移到向量检索层

以后 actor-bounded 模式下，你就能先过滤：

* owner 是当前 actor 的
* 或 shared memory
* 或当前 actor 有可见性

而不是向量全召回回来，再靠 ranker 压。

### 3. Mutation Planner 更容易用

新 fact 来了，直接：

* embed
* 搜近似
* 看 sourceRecordKey / ownerActorKey / memorySubtype
* 再决定 UPDATE / MERGE / INVALIDATE

---

# 六、MemoryOS 融合 Mem0 的完整新流程

## A. 写入链（长期记忆演化链）

### Step 1

新一轮消息 / outcome 进入抽取层

### Step 2

抽取出：

* facts
* summaries
* state mutations

### Step 3

进入 `MemoryMutationPlanner`
对每条抽取结果：

* 去 vector / facts / summaries 找近似旧记录
* 结合 lifecycle / ownerActorKey / sourceScope / relation scope
* 判断动作：

  * ADD
  * MERGE
  * UPDATE
  * INVALIDATE
  * NOOP

### Step 4

`MemoryMutationExecutor` 执行动作

### Step 5

写：

* structured store
* vector index
* mutation history
* lifecycle delta

---

## B. 读取链（你现在已经比较成熟）

保留现有：

* `planRecall`
* `collectRecallCandidates`
* `rankRecallCandidates`
* `cutRecallCandidatesByBudget`
* `render`

只要再补两个特性：

### 1. actor visibility

把 `ownerActorKey / perActorMetrics / actorForgetProbability` 接进 candidate scoring

### 2. vector direct source mapping

向量候选直接基于 `sourceRecordKey` 回源

---

# 七、提示词分层方案

你前面说“动态记忆不要放 system，放用户内容尾部更好”，我认同方向，但我建议你**不要简单拼在用户原文后面**，而是做成清晰的三层。

---

## 分层目标

### system

只放固定规则，不放动态记忆。

### dynamic memory block

放本轮召回内容，结构化表达。

### user raw input

保留用户原始输入，不被污染。

---

## 推荐结构

## 第一层：System Rules

只放稳定约束，例如：

* 你负责导演整体输出，但角色不能全知
* 角色台词必须符合自身已知记忆
* 私人记忆不能跨角色直接借用
* 已遗忘内容只能以模糊、不确定口吻表现
* narrator 可以更接近全局视角，角色发言必须角色视角

这部分尽量短，长期稳定。

---

## 第二层：Dynamic Memory Context

这是每轮动态渲染的 block，不属于 system。

建议拆成两块：

### Global Director Context

内容包括：

* 当前场景
* 最近公开事件
* 世界规则相关约束
* 共享关系变化

### Active Character Memory

内容包括：

* 当前主角色记得的内容
* 当前主角色对他人的态度
* 当前角色忘记/模糊的内容
* 当前角色目标或情绪

---

## 第三层：User Input

只保留用户当前这句话。

---

# 八、推荐的提示词排布

我建议最终变成：

```text id="8vw0n4"
[System Rules]
...固定规则...

[Dynamic Memory Context]
<director_context>
...共享上下文...
</director_context>

<active_character_memory actor="xxx">
...当前角色可见记忆...
</active_character_memory>

[User Message]
...用户原话...
```

### 为什么这样比“直接放 system”更好

因为动态记忆不是规则，而是本轮证据。
system 应该只保稳定规则，不应该每轮被 recall 内容污染。

---

# 九、怎么接到你现在的代码上

## 1. `RecallPlan` 增加 viewpoint

新增：

* `mode: 'omniscient_director' | 'actor_bounded'`
* `activeActorKey`
* `allowSharedScene`
* `allowWorldState`
* `allowForeignPrivateMemory`

这样 planner 不只是决定 sourceWeights，还决定“这轮按谁的脑子取记忆”。

---

## 2. `RecallAssembler` 产出双池候选

不是只出一个大池，而是：

* `globalCandidates`
* `actorCandidates`

然后各自 rank / budget cut。

---

## 3. `RecallRanker` 增加 actor visibility 规则

新特征：

* `actorVisibilityScore`
* `actorForgotten`
* `foreignPrivatePenalty`

让不该被当前角色看到的记忆，在 recall 阶段就降掉。

---

## 4. `PromptMemoryRenderer` 分层渲染

把现在的一坨 injected text 改成两块：

* `renderDirectorContext(...)`
* `renderActiveCharacterMemory(...)`

然后最后统一封装成 memory block。

---

# 十、建议的落地顺序

## 第一阶段

先做提示词分层，不动 mutation planner。

目标：

* system 变短
* dynamic memory block 脱离 system
* 支持 global + actor 两块上下文

这个改动快，收益立刻可见。

---

## 第二阶段

补 vector metadata：

* `sourceRecordKey`
* `ownerActorKey`
* `sourceScope`
* `memorySubtype`

目标：

* 让 vector recall 更稳
* 为角色边界过滤打底

---

## 第三阶段

上 `MemoryMutationPlanner`

目标：

* 新信息不再只是“直接写入”
* 而是进入长期记忆 CRUD 流

---

## 第四阶段

补 `memory mutation history`

目标：

* 让长期记忆演化可追踪、可解释

---

# 十一、我给你的最终建议

如果只用一句话概括这份方案：

**MemoryOS 不要学 Mem0 的“简化 prompt 用法”，而要学它的“长期记忆 CRUD 机制”；同时把动态记忆从 system 中拿出来，改成“固定规则在 system、动态记忆做独立 memory block、用户原话单独保留”的三层提示词结构。**

---

# 十二、你可以直接采用的版本

## 融合 Mem0 的一句话架构

**Extract → Retrieve similar old memory → Decide mutation → Apply mutation → Recall → Rank → Layered prompt injection**

## 提示词分层的一句话架构

**System Rules + Director Context + Active Character Memory + User Raw Input**

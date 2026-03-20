# 向量冷启动向量应该怎么收集信息

我建议把冷启动拆成两层：

## 第一层：真相层 seed

这层继续保留你现在的做法，不动：

* `identitySeed`
* `styleSeed`
* `worldSeed`
* `aiSummary`
* `activeLorebooks`
* `groupMembers`

这些仍然进 `facts/state`，因为它们是可编辑、可覆盖、可结构化的“源真相” 

## 第二层：向量层 cold-start cards

新增一条专用链：

`ChatSemanticSeed -> ColdStartMemoryCardDrafts -> persistMemoryCards -> upsertMemoryCardEmbeddings`

也就是冷启动不要直接把 seed 一坨塞向量，而是先**抽成 MemoryCardDraft**，再走你现在已经成型的 `memory-card-store` 主线。因为 store 里已经有：

* admission 规则：`confidence >= 0.72 && importance >= 0.6 && isNaturalMemoryText(...)`
* 去重 / 复用 / supersede
* 保存后自动 embedding
  这些机制你已经写好了，冷启动应该复用，而不是另起炉灶 

---

# 冷启动该收集哪些信息

我建议只收**高稳定、高复用、高语义价值**的信息，按 4 类收：

## 1. 角色恒定画像

来自：

* `identitySeed.displayName`
* `identitySeed.aliases`
* `identitySeed.identity`
* `identitySeed.catchphrases`
* `identitySeed.relationshipAnchors`
* `aiSummary.roleSummary`

这些最适合做 `profile` / `trait` / `relationship anchor` 类卡。
原因是它们跨回合稳定，召回价值高，而且不会因为一两轮剧情就失真。当前这些字段已经在 `persistSemanticSeed(...)` 被写入 `semantic.identity` fact，所以源数据是齐的 

### 适合的卡

* `lane: profile`
* `lane: relationship`
* 少量 `lane: state` 但只针对“当前身份状态”这类内容

---

## 2. 世界硬约束

来自：

* `worldSeed.rules`
* `worldSeed.hardConstraints`
* `aiSummary.worldSummary`

这部分是冷启动最应该进向量的，因为问答/写作时最常被召回。

### 适合的卡

* `lane: state`：世界规则、禁忌、硬设定
* `lane: profile`：阵营/世界背景总览

这里要注意：
**世界规则要一条一张卡，不要拼成长摘要。**
因为你现在检索单元已经是 MemoryCard，不是旧 chunk。规则拆卡后召回更准，supersede 也更容易。

---

## 3. 重要实体和地点

来自：

* `worldSeed.entities`
* `worldSeed.locations`
* `inferStructuredSeedWorldStateEntries(seed)` 产出的结构化条目 

这类信息最适合做“实体概览卡”，但不要全量灌。

### 只收这三种

* 主角色直接相关实体
* 高频地点
* 有明确规则/关系/作用的实体

不要把世界书所有 entity/location 全进向量，否则会把 recall 噪声拉高。

---

## 4. 当前会话绑定信息

来自：

* `activeLorebooks`
* `groupMembers`
* 当前 scope/roleKey/chat binding

这类不适合作长期 profile 卡，但适合少量 `state` 卡，帮助冷启动初期做“当前场景上下文约束”。

---

# 不该收什么

这部分很关键。

## 不要收原始大段世界书正文

因为：

* 噪声高
* 文风混杂
* 会和后续摘要链重复
* admission 很难控制

## 不要收低置信碎片

你现在 `memory-card-store` 的 admission 已经要求置信和重要度门槛 
冷启动也应该遵守，尤其不要把“猜测类描述”“装饰性文本”进向量。

## 不要把 seed 整体做成一个 summaryText 丢进去

你现在 `primeColdStartExtract()` 那种 `summaryLines.join('\n')` 更像调试观察，不适合最终向量写入。因为检索粒度太粗，也不利于 supersede 

---

# 我建议的具体实现

## 新增函数

在 `memory-card-text.ts` 或新文件里加：

* `buildMemoryCardDraftsFromSemanticSeed(seed, options?)`

返回 `MemoryCardDraft[]`

### 输出分层建议

1. `profile` 卡
2. `relationship` 卡
3. `state` 卡（世界规则/硬约束）
4. `profile/state` 混合卡（重要地点/组织/实体）

### 每张卡字段建议

* `subject`: 角色名 / 地点名 / 组织名 / 世界
* `title`: 更短的展示标题
* `memoryText`: 一句自然语言，禁止 JSON 感
* `keywords`: roleKey、alias、entity name、rule tag
* `entityKeys`: 稳定实体键
* `replaceKey`: 用于 state/profile 覆盖
* `confidence`: 角色核心 0.9，世界概览 0.8，实体概览 0.75
* `importance`: 规则/硬约束 0.9，身份画像 0.85，次要实体 0.65

---

## 新增保存入口

在 `memory-card-store.ts` 增一个：

* `saveMemoryCardsFromSemanticSeed(chatKey, seed, fingerprint, reason)`

内部直接：

1. `buildMemoryCardDraftsFromSemanticSeed(...)`
2. `persistMemoryCards(...)`
3. `deleteMemoryCardEmbeddings(...)` for superseded
4. `upsertMemoryCardEmbeddings(...)`

这样冷启动就完全复用你已经做好的 store 主线 

---

# 最合适的接线位置

## 位置 A：bootstrap 完成后立刻建卡

在 `performBootstrapSemanticSeedIfNeeded()` 里：

* `saveSemanticSeed(...)`
* `persistSemanticSeed(...)`
* **`saveMemoryCardsFromSemanticSeed(...)`**
* `markColdStartStage('prompt_primed', ...)`

这是最推荐的位置，因为首次进入聊天时，向量库就准备好了。当前这里正是缺的那一环 

## 位置 B：editor refresh 后也重建一次

`editor.refreshSemanticSeed()` 现在只会重新 `saveSemanticSeed(...)` 和 `persistSemanticSeed(...)`，也应该补一遍 `saveMemoryCardsFromSemanticSeed(...)`，这样编辑器刷新后向量卡也同步更新 

---

# 我更推荐的卡片模板

## 角色画像卡

`subject = 角色名`

`memoryText` 例子：

* “Alice 是一名冷静克制的调查员，优先依据证据行动，不轻易透露真实情绪。”
* “Alice 常用简短、克制的表达，避免夸张和戏剧化语气。”

## 世界规则卡

`subject = 世界`

`memoryText` 例子：

* “这个世界中魔法使用会留下可追踪痕迹，公开施法会显著提高暴露风险。”
* “该设定下贵族不得公开与平民缔结婚约，否则会触发家族制裁。”

## 实体概览卡

`subject = 组织/地点/人物`

`memoryText` 例子：

* “黑塔是帝都的情报与档案中枢，进入权限严格分级，外来者通常无法接触核心记录。”

这种写法最适合你当前 `isNaturalMemoryText(...)` 的准入规则，也最适合 embedding 检索 

---

# 一个很重要的设计取舍

我建议：

**冷启动向量只做“静态基础卡”，不要做“剧情事件卡”。**

因为剧情事件应该来自后续真实对话摘要链，已经有现成主线：

* mutation executor 里的 summary/fact 写入会转 MemoryCard
* 然后自动 embedding  

也就是说：

* 冷启动负责“角色是谁、世界怎么运作”
* 正常运行负责“后来发生了什么”

这个边界最干净。

---

# 最后的设计结论

我会给你的最终方案是：

**向量冷启动 = 只从 `ChatSemanticSeed` 中抽取高稳定、高复用的信息，生成少量高质量 `MemoryCardDraft`，然后统一走 `memory-card-store` 主线。**

最优收集面：

* 角色恒定画像
* 世界规则与硬约束
* 关键实体/地点概览
* 当前会话绑定上下文

最优接线点：

* `performBootstrapSemanticSeedIfNeeded()` 之后
* `editor.refreshSemanticSeed()` 之后

最该避免的：

* 整段世界书原文入向量
* 把 seed 拼成一坨 summaryText
* 收低稳定、低重要度碎片

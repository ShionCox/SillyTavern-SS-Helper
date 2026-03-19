可以，下面是**在你这版计划上直接修改、补入我刚才那套“摘要产出记忆卡，记忆卡再入向量”的方法**后的版本。
我不重写整份，而是按“**哪里要改、怎么改**”给你一版可直接合并的修订稿。

核心变化只有一条主线：

**从“模板建卡优先，AI 兜底”升级为“摘要/提炼阶段统一产出 MemoryCardDraft，模板与 AI 都服务于同一个建卡出口”。**

这样能把你刚才提的两个关键现实问题一起解决：

* 作者自定义角色卡格式无限多，不能靠前端格式识别穷举
* 每次 LLM 已经在做摘要，那就让它顺手产出候选记忆卡，不再把摘要文本本身直接向量化

---

# 建议改成的版本

## 先给总原则，建议加到“摘要”下面

在 `## 摘要` 后面补一条总原则：

* 新版采用“**摘要即记忆入口，但摘要文本不直接等于向量记忆**”的策略。每次 LLM 执行冷启动摘要、阶段摘要或记忆提炼时，统一输出 `summary + MemoryCardDraft[]`；只有经过去重、分型、生命周期判断后的 `MemoryCard` 才允许进入向量层。

这条很关键，因为它把你刚才的想法正式定性了：
**“每次摘要都可顺手建记忆”，但不是“每次摘要文本都直接入向量”。**

---

# 一、修改 `### 2. 建卡策略与冷启动流程`

你原来这节方向已经对了，但要再往前推进一点。
我建议把这一节改成下面这样。

---

## 2. 建卡策略、摘要出口与冷启动流程

* 删除 `Cold-start prime` summary 生成链，删除 `applyEncodingToRecord(...summary/fact...)` 对原始事实、摘要、`fact.value JSON.stringify(...)` 直接建向量的路径。
* 冷启动流程改成：
  `collectChatSemanticSeedWithAi -> persistSemanticSeed -> summarizeAndExtractMemoryCards -> saveMemoryCards -> embedActiveMemoryCards -> markColdStartStage('cards_built')`
* 日常流程统一采用同一出口：
  `summarizeWithAi -> MemorySummaryEnvelope(summary, memoryCards) -> saveMemoryCards -> embedActiveMemoryCards`
* 新增统一中间结构 `MemorySummaryEnvelope`，格式固定为：

  * `summary`：供摘要面板、压缩上下文和阶段总结使用
  * `memoryCards`：供长期记忆和向量召回使用
* 冷启动建卡采用“**统一出口，双通道生成**”：

  * 优先让模型直接输出 `MemoryCardDraft[]`
  * 若模型输出不完整或缺失关键 lane，则由程序基于已知结构记录做确定性模板补卡
* 日常入库不再把 `fact.value` 做 `JSON.stringify` 后直接嵌入。已知结构类型优先走模板建卡：

  * `semantic.identity/profile` 产出 `identity / relationship`
  * `semantic.style/mode` 产出 `style`
  * `world_state` 产出 `rule / state / event`
  * 普通摘要或复杂自由文本统一走 `summarizeAndExtractMemoryCards`
* 对未知结构、作者自定义前端角色卡、混合 UI 文本、长摘要、叙事正文，不再尝试穷举格式识别；统一做轻量预处理后交给 `summarizeAndExtractMemoryCards` 提炼。
* 第一版不要求“所有来源都强制 AI 提炼”；已知结构走模板，未知和复杂来源走 AI，总出口统一落成 `MemoryCardDraft[]`。
* 所有建卡路径必须保留 `sourceRecordKey / sourceRecordKind / sourceRefs`，并写入 mutation history，支持后续重建、覆盖、失效和解释。
* `state` 类卡更新时默认将旧卡标记为 `superseded`；`event` 类卡只追加、不覆盖；`identity / rule` 支持“按来源重建卡片”而不是“重新切片”。

---

## 这里为什么要这样改

因为你现在的原文里虽然已经写了：

> 对未知结构或复杂长摘要，走单独的 `extractMemoryCardsWithAi`

但这还不够强。
问题在于，**你现在已经不只是“未知结构兜底”了，而是要把“每次摘要都是记忆入口”变成系统主线。**

也就是要从：

* 模板建卡为主
* AI 只是偶尔兜底

改成：

* **所有摘要/提炼都统一汇入 `MemorySummaryEnvelope`**
* 模板和 AI 只是两种生成 draft 的方式
* 最终都进入同一个 `MemoryCard` 保存规则

---

# 二、在 `### 1. 数据模型与索引层重写` 里加两个字段

你这节已经很完整了，但为了支持“摘要顺手建卡”，建议在 `memory_cards` 体系里再补两个字段。

在字段列表后面加：

* 新增 `ttl` 字段，取值为 `short / medium / long`，用于区分短期状态记忆与长期设定记忆；默认由建卡阶段给出，生命周期层可二次调整。
* 新增 `replaceKey` 字段，用于标识需要覆盖的同类状态卡，例如同一主体的“当前地点”“当前情绪”“当前局势”等状态类记忆。

也建议补一句：

* `memory_card_embeddings` 只对 `status = active` 且通过记忆准入规则的卡建立或保留 embedding；候选卡、失效卡、被覆盖卡不参与主召回索引。

这句很重要，因为它把“每次摘要都可能产出候选卡”和“不是所有候选都进向量”明确区分开了。

---

# 三、在 `### 3. 召回与注入链重写` 前面补一个“记忆准入规则”

你现在计划里有召回和注入，但**还缺少“什么时候一张草稿卡才算正式记忆”**。
这块是避免“每次摘要都写炸向量库”的关键。

建议在第 2 节末尾或第 3 节前加一个小节：

---

## 2.5 记忆准入与生命周期规则

* 每次摘要、冷启动提炼或来源重建都只先产出 `MemoryCardDraft[]`，不直接进入向量索引。
* 只有通过以下规则的卡才转正为 `MemoryCard` 并写入 `memory_card_embeddings`：

  * `confidence >= 0.72`
  * `importance >= 0.60`
  * `memoryText` 为自然语言，且只表达一个中心主题
  * 与现有 active 卡不构成高相似重复
* `state` 卡根据 `replaceKey` 或同主体同 lane 规则执行覆盖；旧卡转为 `superseded`
* `event` 卡仅做追加，不因为新状态出现而删除
* `identity / rule / relationship / style` 卡允许更新，但必须保留历史和来源
* 未通过准入的内容可以保留在 `summary` 中，但不进入长期记忆、不参与向量召回

---

这节是把我前面说的“每次摘要都可以产出候选记忆卡，但不是摘要一次就无脑存一次”正式写进设计。

---

# 四、在 `### 4. 公共接口与 UI 同步换代` 里补“摘要与记忆卡分离”

你现在 UI 部分已经写得很全面了，但还可以再加一句，防止未来又把 summary 直接拿去当向量对象。

建议加：

* 新 UI 必须明确区分“摘要内容”和“记忆卡内容”：摘要区只展示 `summary`，记忆区只展示 `MemoryCard`；不得再把摘要正文直接作为向量对象或卡片正文展示。
* 召回预演默认展示命中的 `MemoryCard`，并可展开查看其来源 `summary / fact / world_state / raw source`，但来源文本只作为证据，不作为主记忆内容。

这能把“摘要即入口，但摘要不等于记忆卡”这个设计原则锁死。

---

# 五、建议新增一个小节：来源适配策略

因为你刚才专门提到“作者自定义角色卡乱七八糟”，所以计划里最好明确写出来：
**不做格式穷举兼容，而做统一来源适配。**

建议加在第 2 节里，或者单独加个 `### 2.1 来源适配策略`

---

## 2.1 来源适配策略

* 新版不尝试穷举识别所有作者自定义前端角色卡格式，也不建立大量按标签名绑定的专用解析器。
* 所有来源统一进入轻量预处理层，转换为 `RawContextBlock[]`，只保留：

  * `sourceKind`
  * `rawText`
  * `hints`（是否有键值对、是否有叙事、是否有选项、是否有 XML-like 标签、是否有面板结构）
* 对已知结构来源仍可走模板建卡；对未知 UI 卡、混合叙事面板、自定义标签文本，统一交由 `summarizeAndExtractMemoryCards` 提炼为标准 `MemoryCardDraft[]`
* 系统目标不是“识别所有格式”，而是“无论格式如何，都尽量提取有限几类高价值记忆”：`identity / style / relationship / rule / event / state`

---

这节可以直接回应你真实遇到的问题，而且能防止后续实现又走回“想支持所有 `<char_status>` 标签”的死路。

---

# 六、把测试部分也补一下

你现在测试已经很完整了，但要体现“摘要统一出口”的方法，建议加这几条。

在 `## 测试与验收` 里补：

* 新增“摘要双输出”测试，验证 `summarizeWithAi` 或冷启动摘要流程同时产出 `summary` 与 `MemoryCardDraft[]`，并且摘要正文不会直接进入 embedding。
* 新增“未知前端角色卡来源”测试，验证面对自定义 UI 文本时，系统不依赖固定标签名也能提取 `identity / state / relationship / style` 中的高价值卡。
* 新增“记忆准入规则”测试，验证低置信度、低重要度、重复卡、非单主题卡不会进入 `memory_card_embeddings`。
* 新增“摘要不等于记忆”测试，验证 summary 只用于摘要与压缩，不会作为 `MemoryCard.memoryText` 原样写入。

---

# 七、我建议你直接替换的几句原文

下面是几句我建议你原样替换的。

### 原文

> 冷启动建卡采用“结构化卡优先”：优先让模型直接输出结构化卡片数组；如果模型返回不完整，则由程序用确定性模板补足缺失 lane。

### 建议替换为

> 冷启动与日常摘要统一采用“摘要双输出”策略：模型同时输出 `summary` 与 `MemoryCardDraft[]`。若卡片输出不完整，则由程序基于已知结构来源做确定性模板补卡；模板与 AI 最终都汇入同一套 `MemoryCardDraft[] -> MemoryCard` 入库链路。

---

### 原文

> 对未知结构或复杂长摘要，走单独的 `extractMemoryCardsWithAi`，输出同一套 `MemoryCardDraft[]` 结构；第一版不做“全量 AI 提炼”，只在模板无法覆盖时启用 AI 提炼。

### 建议替换为

> 对未知结构、复杂长摘要、作者自定义前端角色卡和混合 UI 文本，统一走 `summarizeAndExtractMemoryCards`，输出 `MemorySummaryEnvelope { summary, memoryCards }`。第一版仍以已知结构模板建卡为主，但所有摘要流程都可作为记忆卡提炼入口；模板无法稳定覆盖时，默认由 AI 提炼补齐。

---

### 原文

> 普通摘要按标题和正文抽取 `event / state` 卡。

### 建议替换为

> 普通摘要不再直接作为向量对象；摘要阶段统一产出 `summary + MemoryCardDraft[]`，其中 `summary` 服务压缩与浏览，`memoryCards` 经过去重、分型、生命周期判断后再决定是否进入长期记忆与向量层。

---

# 八、最后给你一版最精炼的“改动结论”

如果把你这份计划按我这次的优化吸收进去，核心就会变成：

1. **删掉旧 chunk 向量体系**
2. **MemoryCard 成为唯一入向量对象**
3. **每次 LLM 摘要都可顺手产出候选记忆卡**
4. **摘要文本本身不直接入向量**
5. **模板和 AI 统一汇入 `MemoryCardDraft -> MemoryCard` 链路**
6. **未知角色卡格式不做穷举兼容，只做轻预处理 + LLM 槽位提炼**
7. **只有 active 且通过准入规则的 MemoryCard 才做 embedding**


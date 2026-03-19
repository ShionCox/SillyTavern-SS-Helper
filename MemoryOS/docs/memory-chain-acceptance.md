# MemoryOS Chain Acceptance

> 记录当前 MemoryOS 主链的验收标准与检查顺序，方便后续回归。

## 验收目标

1. 宿主消息进入后，日志里能看到统一 trace 触发记录。
2. `trusted write` 真正落库，并能在主链 trace 快照里看到完成态。
3. `recall` 结果能进入 `prompt injection`，且生成请求里确实使用了注入后的 prompt。
4. 外部回写口 `plugin:request:memory_append_outcome` 已下线，不再注册。
5. `AI Health` 面板能直接看到主链最近一次成功记录，并有测试覆盖。

## 检查顺序

1. `pnpm exec tsc -p tsconfig.json --noEmit`
2. `cd MemoryOS && pnpm test`
3. `node build.js MemoryOS`
4. `node scripts/smoke-check.mjs`

## 当前状态

- 主链 trace：已接入
- prompt 注入单点：已接入
- trusted write：已接入
- AI Health 证据卡：已接入，且由 `MemoryOS/test/mainline-trace-view.spec.ts` 覆盖
- `memory_append_outcome`：已下线

## 备注

- 新增函数继续要求中文 JSDoc。
- 代码修改不要使用 PowerShell 写文件，统一使用 `apply_patch`。

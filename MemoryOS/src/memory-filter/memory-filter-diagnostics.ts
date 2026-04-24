import type { MemoryFilterPreparedResult } from './memory-filter-types';

export function summarizeMemoryFilterDiagnostics(result: MemoryFilterPreparedResult): string[] {
    if (!result.enabled) {
        return ['记忆过滤器关闭：所有链路保持原始消息内容。'];
    }
    const memoryCount = result.records.reduce((count, record) => count + record.blocks.filter((block) => block.channel === 'memory').length, 0);
    const contextCount = result.records.reduce((count, record) => count + record.blocks.filter((block) => block.channel === 'context').length, 0);
    const excludedCount = result.records.reduce((count, record) => count + record.blocks.filter((block) => block.channel === 'excluded').length, 0);
    return [
        `进入记忆：${memoryCount} 段`,
        `仅作参考：${contextCount} 段`,
        `完全排除：${excludedCount} 段`,
    ];
}

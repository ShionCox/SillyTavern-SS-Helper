import { buildTakeoverMemoryGraph } from '../ui/workbenchTabs/shared/memory-graph-builder';
import type { MemoryTakeoverProgressSnapshot } from '../types';
import type { WorkbenchMemoryGraph } from '../ui/workbenchTabs/shared/memoryGraphTypes';

/**
 * 功能：统一承接记忆图谱构建。
 */
export class GraphService {
    /**
     * 功能：根据接管进度构建图谱快照。
     * @param progress 接管进度。
     * @returns 图谱快照。
     */
    buildTakeoverGraph(progress: MemoryTakeoverProgressSnapshot | null): WorkbenchMemoryGraph {
        return buildTakeoverMemoryGraph(progress);
    }
}

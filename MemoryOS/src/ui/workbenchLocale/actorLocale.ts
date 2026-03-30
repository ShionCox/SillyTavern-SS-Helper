const ACTOR_WORKBENCH_TEXT_MAP: Record<string, string> = {
    social_links: '关系网络',
    topology_graph: '可视化拓扑图',
    faction_panel: '势力阵营面板',
    topology_initializing: '正在初始化拓扑引擎...',
};

/**
 * 功能：读取角色工作台固定文案。
 * @param key 文案键名。
 * @returns 中文文案。
 */
export function resolveActorWorkbenchText(key: string): string {
    const normalized = String(key ?? '').trim();
    if (!normalized) {
        return '';
    }
    return ACTOR_WORKBENCH_TEXT_MAP[normalized] ?? normalized;
}

import type { MemoryCardSummary, RoleAssetEntry, RoleProfile } from '../../../../../SDK/stx';

export interface RoleCenterPanelRenderHelpers {
    escapeHtml(text: string): string;
    formatTimeLabel(value: number): string;
    formatMemorySubtypeLabel(memorySubtype: string): string;
}

export interface RoleCenterStatCard {
    label: string;
    value: string;
    meta: string;
    toneClassName?: string;
}

export interface RoleCenterAssetViewModel {
    slotLabel: string;
    name: string;
    detail: string;
    iconClassName: string;
    rarityLabel: string;
    isEmpty?: boolean;
}

interface RoleCenterFactChip {
    label: string;
    value: string;
}

interface RoleCenterPanelRenderInput {
    helpers: RoleCenterPanelRenderHelpers;
    selectedRole: RoleProfile;
    selectedRoleLabel: string;
    activeActorKey: string | null;
    roleMemoryCards: MemoryCardSummary[];
    filteredMemoryCards: MemoryCardSummary[];
    categoryCountMap: Map<string, number>;
    actorButtonsHtml: string;
    searchInputHtml: string;
    categorySelectHtml: string;
    setActiveButtonHtml: string;
    recomputeButtonHtml: string;
    statCards: RoleCenterStatCard[];
    equipmentSlots: RoleCenterAssetViewModel[];
    activeLocationText: string;
    normalizeText(value: unknown): string;
    normalizeActorKey(value: unknown): string;
    buildReadableMemoryTitle(card: MemoryCardSummary, ownerLabel: string): string;
    resolveRoleCenterAssetIcon(asset: RoleAssetEntry): string;
    resolveRoleCenterAssetRarity(asset: RoleAssetEntry): string;
}

/**
 * 功能：把“标签:内容”事实文本拆成可展示的键值。
 * @param fact 原始事实文本。
 * @returns 标签与值。
 */
function parseRoleCenterFact(fact: string): RoleCenterFactChip {
    const normalized = String(fact ?? '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return { label: '特征', value: '暂无记录' };
    }
    const separatorMatch = normalized.match(/^(.{1,12}?)[：:]\s*(.+)$/);
    if (separatorMatch) {
        return {
            label: separatorMatch[1],
            value: separatorMatch[2] || '暂无记录',
        };
    }
    return {
        label: '特征',
        value: normalized,
    };
}

/**
 * 功能：渲染角色中心中的简单事实列表区块。
 * @param input 渲染输入。
 * @param title 区块标题。
 * @param kicker 区块眉题。
 * @param values 事实文本列表。
 * @param sectionClassName 区块样式类名。
 * @returns 区块 HTML。
 */
function renderSimpleList(
    input: RoleCenterPanelRenderInput,
    title: string,
    kicker: string,
    values: string[],
    sectionClassName: string = '',
): string {
    if (values.length <= 0) {
        return '';
    }
    return `
        <section class="stx-re-panel-card stx-re-memory-section ${input.helpers.escapeHtml(sectionClassName)}">
            <div class="stx-re-memory-section-head">
                <div>
                    <div class="stx-re-memory-section-kicker">${input.helpers.escapeHtml(kicker)}</div>
                    <div class="stx-re-memory-section-title">${input.helpers.escapeHtml(title)}</div>
                </div>
            </div>
            <div class="stx-re-role-center-fact-list">
                ${values.map((item: string): string => {
                    const fact = parseRoleCenterFact(item);
                    return `<div class="stx-re-role-center-fact-item"><span class="stx-re-role-center-fact-label">${input.helpers.escapeHtml(fact.label)}</span><strong class="stx-re-role-center-fact-value">${input.helpers.escapeHtml(fact.value)}</strong></div>`;
                }).join('')}
            </div>
        </section>
    `;
}

/**
 * 功能：渲染角色中心中的物品/装备列表区块。
 * @param input 渲染输入。
 * @param title 区块标题。
 * @param kicker 区块眉题。
 * @param assets 资源列表。
 * @param sectionClassName 区块样式类名。
 * @param gridClassName 网格样式类名。
 * @param assetKind 资源类型。
 * @returns 区块 HTML。
 */
function renderAssetSection(
    input: RoleCenterPanelRenderInput,
    title: string,
    kicker: string,
    assets: Array<{ name: string; detail: string }>,
    sectionClassName: string,
    gridClassName: string,
    assetKind: 'item' | 'equipment',
): string {
    if (assets.length <= 0) {
        return '';
    }
    return `
        <section class="stx-re-panel-card stx-re-memory-section ${input.helpers.escapeHtml(sectionClassName)}">
            <div class="stx-re-memory-section-head">
                <div>
                    <div class="stx-re-memory-section-kicker">${input.helpers.escapeHtml(kicker)}</div>
                    <div class="stx-re-memory-section-title">${input.helpers.escapeHtml(title)}</div>
                </div>
            </div>
            <div class="stx-re-role-center-asset-grid ${input.helpers.escapeHtml(gridClassName)}">
                ${assets.map((item: { name: string; detail: string }): string => `
                    <article class="stx-re-role-center-asset-item">
                        <span class="stx-re-role-center-asset-icon"><i class="${input.helpers.escapeHtml(input.resolveRoleCenterAssetIcon({ kind: assetKind, name: item.name, detail: item.detail, sourceRefs: [] }))}" aria-hidden="true"></i></span>
                        <strong>${input.helpers.escapeHtml(input.normalizeText(item.name) || '未命名条目')}</strong>
                        ${input.normalizeText(item.detail) ? `<div>${input.helpers.escapeHtml(input.normalizeText(item.detail))}</div>` : ''}
                        <small class="stx-re-role-center-asset-rarity">${input.helpers.escapeHtml(input.resolveRoleCenterAssetRarity({ kind: assetKind, name: item.name, detail: item.detail, sourceRefs: [] }))}</small>
                    </article>
                `).join('')}
            </div>
        </section>
    `;
}

/**
 * 功能：渲染角色中心中的关系事实区块。
 * @param input 渲染输入。
 * @returns 区块 HTML。
 */
function renderRelationshipSection(input: RoleCenterPanelRenderInput): string {
    if (input.selectedRole.relationshipFacts.length <= 0) {
        return '';
    }
    return `
        <section class="stx-re-panel-card stx-re-memory-section stx-re-role-center-relations">
            <div class="stx-re-memory-section-head">
                <div>
                    <div class="stx-re-memory-section-kicker">角色关系区</div>
                    <div class="stx-re-memory-section-title">关系事实列表</div>
                </div>
            </div>
            <div class="stx-re-role-center-fact-list">
                ${input.selectedRole.relationshipFacts.map((item): string => `
                    <article class="stx-re-role-center-relation-item stx-re-role-center-relation-node">
                        <div class="stx-re-role-center-relation-top stx-re-role-center-relation-head">
                            <strong>${input.helpers.escapeHtml(input.normalizeText(item.targetLabel) || '未标注对象')}</strong>
                            <span class="stx-re-memory-chip">${input.helpers.escapeHtml(input.normalizeText(item.label) || '关系')}</span>
                        </div>
                        <div class="stx-re-role-center-relation-detail">${input.helpers.escapeHtml(input.normalizeText(item.detail))}</div>
                    </article>
                `).join('')}
            </div>
        </section>
    `;
}

/**
 * 功能：渲染角色中心中的记忆卡列表区块。
 * @param input 渲染输入。
 * @returns 区块 HTML。
 */
function renderMemoryListSection(input: RoleCenterPanelRenderInput): string {
    return `
        <section class="stx-re-panel-card stx-re-memory-section stx-re-role-center-logbook">
            <div class="stx-re-memory-section-head">
                <div>
                    <div class="stx-re-memory-section-kicker">角色记忆列表</div>
                    <div class="stx-re-memory-section-title">${input.helpers.escapeHtml(input.selectedRoleLabel)} 的记忆卡</div>
                </div>
                <div class="stx-re-memory-chip-row stx-re-role-center-logbook-ledger">
                    <span class="stx-re-memory-chip">总数 ${input.helpers.escapeHtml(String(input.roleMemoryCards.length))}</span>
                    <span class="stx-re-memory-chip">对话 ${input.helpers.escapeHtml(String(input.categoryCountMap.get('dialogue') ?? 0))}</span>
                    <span class="stx-re-memory-chip">事件 ${input.helpers.escapeHtml(String(input.categoryCountMap.get('event') ?? 0))}</span>
                    <span class="stx-re-memory-chip">关系 ${input.helpers.escapeHtml(String(input.categoryCountMap.get('relationship') ?? 0))}</span>
                </div>
            </div>
            ${input.filteredMemoryCards.length > 0
                ? `<div class="stx-re-memory-entry-list">${input.filteredMemoryCards.map((card: MemoryCardSummary): string => {
                    const extra = card as MemoryCardSummary & Record<string, unknown>;
                    const title = input.buildReadableMemoryTitle(card, input.selectedRoleLabel);
                    const subtypeText = input.normalizeText(card.memorySubtype) || 'other';
                    const subtypeLabel = input.helpers.formatMemorySubtypeLabel(subtypeText);
                    const memoryTypeLabel = input.normalizeText(card.memoryType) || 'other';
                    const speakerLabel = input.normalizeText(extra.speakerLabel);
                    const rememberReason = input.normalizeText(extra.rememberReason ?? card.sourceReason);
                    const sourceMessageId = input.normalizeText(card.sourceMessageIds?.[0] ?? card.anchorMessageId);
                    const bodyText = input.normalizeText(card.memoryText);
                    return `
                        <article class="stx-re-panel-card stx-re-memory-entry stx-re-role-center-log-entry">
                            <div class="stx-re-memory-entry-head">
                                <div class="stx-re-memory-entry-title-wrap">
                                    <div class="stx-re-memory-entry-main">
                                        <div class="stx-re-memory-entry-title">${input.helpers.escapeHtml(title)}</div>
                                        <div class="stx-re-memory-chip-row">
                                            <span class="stx-re-memory-chip">类型 ${input.helpers.escapeHtml(memoryTypeLabel)}</span>
                                            <span class="stx-re-memory-chip">细分 ${input.helpers.escapeHtml(subtypeLabel)}</span>
                                            <span class="stx-re-memory-chip">归属 ${input.helpers.escapeHtml(input.selectedRoleLabel)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="stx-re-memory-mini-copy">${input.helpers.escapeHtml(bodyText || '暂无正文')}</div>
                            <div class="stx-re-memory-mini-links"><strong>说话人</strong> ${input.helpers.escapeHtml(speakerLabel || '暂无')}</div>
                            <div class="stx-re-memory-mini-links"><strong>来源消息</strong> ${input.helpers.escapeHtml(sourceMessageId || '暂无')}</div>
                            <div class="stx-re-memory-mini-links"><strong>重要原因</strong> ${input.helpers.escapeHtml(rememberReason || '暂无')}</div>
                        </article>
                    `;
                }).join('')}</div>`
                : '<div class="stx-re-empty">当前筛选条件下没有命中记忆卡。</div>'}
        </section>
    `;
}

/**
 * 功能：渲染角色中心主面板 HTML。
 * @param input 渲染输入。
 * @returns 角色中心整页 HTML。
 */
export function renderRoleCenterPanelHtml(input: RoleCenterPanelRenderInput): string {
    const relationshipSection = renderRelationshipSection(input);
    const memoryListSection = renderMemoryListSection(input);
    const identitySection = renderSimpleList(input, '角色属性区', '基础属性', input.selectedRole.identityFacts, 'stx-re-role-center-attributes');
    const originSection = renderSimpleList(input, '角色来历区', '来历事实', input.selectedRole.originFacts, 'stx-re-role-center-origin');
    const inventorySection = renderAssetSection(input, '角色物品区', '角色物品', input.selectedRole.items, 'stx-re-role-center-inventory-panel', 'stx-re-role-center-inventory-grid', 'item');
    const equipmentSection = renderAssetSection(input, '角色装备区', '角色装备', input.selectedRole.equipments, 'stx-re-role-center-equipment-panel', 'stx-re-role-center-equipment-grid', 'equipment');

    return `
        <div class="stx-re-memory-shell stx-re-role-center-shell">
            <section class="stx-re-panel-card stx-re-memory-console">
                <div class="stx-re-memory-console-grid">
                    <div class="stx-re-memory-console-main">
                        <div class="stx-re-memory-console-kicker">角色中心</div>
                        <div class="stx-re-memory-console-title">${input.helpers.escapeHtml(input.selectedRoleLabel)}</div>
                        <div class="stx-re-memory-console-subtitle">角色资料、关系、物品装备与角色记忆在同一视图下维护。</div>
                        <div class="stx-re-memory-console-ledger">
                            <span class="stx-re-memory-chip is-hero-chip">角色键 ${input.helpers.escapeHtml(input.selectedRole.actorKey)}</span>
                            <span class="stx-re-memory-chip is-hero-chip">别名 ${input.helpers.escapeHtml(input.selectedRole.aliases.join(' / ') || '无')}</span>
                            <span class="stx-re-memory-chip is-hero-chip">最近更新 ${input.helpers.escapeHtml(input.helpers.formatTimeLabel(input.selectedRole.updatedAt || 0))}</span>
                            <span class="stx-re-memory-chip is-hero-chip">记忆 ${input.helpers.escapeHtml(String(input.roleMemoryCards.length))} 条</span>
                        </div>
                    </div>
                    <div class="stx-re-memory-console-controls">
                        <label class="stx-re-memory-console-field">
                            <span class="stx-re-memory-console-field-label">搜索</span>
                            ${input.searchInputHtml}
                        </label>
                        <label class="stx-re-memory-console-field">
                            <span class="stx-re-memory-console-field-label">分类过滤</span>
                            ${input.categorySelectHtml}
                        </label>
                        <div class="stx-re-memory-console-actions">
                            ${input.setActiveButtonHtml}
                            ${input.recomputeButtonHtml}
                        </div>
                    </div>
                </div>
            </section>

            <div class="stx-re-memory-layout">
                <aside class="stx-re-memory-sidebar">
                    <section class="stx-re-panel-card stx-re-memory-side-card stx-re-role-center-roster">
                        <div class="stx-re-memory-section-kicker">角色名册</div>
                        <div class="stx-re-memory-side-title">只列真实角色（不含世界/未归属）</div>
                        <div class="stx-re-memory-actor-list">${input.actorButtonsHtml}</div>
                    </section>
                </aside>

                <div class="stx-re-memory-main stx-re-role-center-main">
                    <section class="stx-re-panel-card stx-re-memory-section stx-re-role-center-hero">
                        <div class="stx-re-role-center-hero-grid">
                            <div class="stx-re-role-center-avatar-panel">
                                <div class="stx-re-role-center-avatar-frame">
                                    <div class="stx-re-role-center-avatar-core">
                                        <i class="fa-solid ${input.normalizeActorKey(input.activeActorKey) === input.selectedRole.actorKey ? 'fa-crown' : 'fa-user'}" aria-hidden="true"></i>
                                    </div>
                                    <span class="stx-re-role-center-avatar-rank">${input.normalizeActorKey(input.activeActorKey) === input.selectedRole.actorKey ? '主视角' : '成员'}</span>
                                </div>
                                <div class="stx-re-role-center-avatar-copy">
                                    <div class="stx-re-memory-section-kicker">角色档案</div>
                                    <div class="stx-re-memory-side-title">${input.helpers.escapeHtml(input.selectedRoleLabel)}</div>
                                    <div class="stx-re-memory-console-subtitle">${input.helpers.escapeHtml(input.activeLocationText)}</div>
                                </div>
                            </div>
                            <div class="stx-re-role-center-stat-panel">
                                <div class="stx-re-memory-section-kicker">属性面板</div>
                                <div class="stx-re-role-center-stat-grid">
                                    ${input.statCards.map((item: RoleCenterStatCard): string => `
                                        <article class="stx-re-role-center-stat-card${item.toneClassName ? ` ${item.toneClassName}` : ''}">
                                            <span class="stx-re-role-center-stat-label">${input.helpers.escapeHtml(item.label)}</span>
                                            <strong class="stx-re-role-center-stat-value">${input.helpers.escapeHtml(item.value)}</strong>
                                            <small class="stx-re-role-center-stat-meta">${input.helpers.escapeHtml(item.meta)}</small>
                                        </article>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                    </section>
                    <section class="stx-re-panel-card stx-re-memory-section stx-re-role-center-equipment-preview">
                        <div class="stx-re-memory-section-head">
                            <div>
                                <div class="stx-re-memory-section-kicker">装备部位</div>
                                <div class="stx-re-memory-section-title">装备槽预览</div>
                            </div>
                        </div>
                        <div class="stx-re-role-center-equipment-grid">
                            ${input.equipmentSlots.map((item: RoleCenterAssetViewModel): string => `
                                <article class="stx-re-role-center-slot${item.isEmpty ? ' is-empty' : ''}">
                                    <span class="stx-re-role-center-slot-label">${input.helpers.escapeHtml(item.slotLabel)}</span>
                                    <div class="stx-re-role-center-slot-core">
                                        <i class="${input.helpers.escapeHtml(item.iconClassName)}" aria-hidden="true"></i>
                                    </div>
                                    <strong class="stx-re-role-center-slot-name">${input.helpers.escapeHtml(item.name)}</strong>
                                    <small class="stx-re-role-center-slot-detail">${input.helpers.escapeHtml(item.detail)}</small>
                                    <span class="stx-re-role-center-slot-rarity">${input.helpers.escapeHtml(item.rarityLabel)}</span>
                                </article>
                            `).join('')}
                        </div>
                    </section>
                    ${identitySection}
                    ${originSection}
                    ${relationshipSection}
                    ${inventorySection}
                    ${equipmentSection}
                    ${memoryListSection}
                </div>
            </div>
        </div>
    `;
}

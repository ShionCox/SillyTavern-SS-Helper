import { buildSharedButton } from '../../../../../_Components/sharedButton';
import { buildSharedInputField } from '../../../../../_Components/sharedInput';
import { buildSharedSelectField, hydrateSharedSelects } from '../../../../../_Components/sharedSelect';
import type { MemorySDKImpl } from '../../../sdk/memory-sdk';
import type {
    EditorExperienceSnapshot,
    MemoryCardSummary,
    RoleAssetEntry,
    RoleProfile,
} from '../../../../../SDK/stx';
import {
    renderRoleCenterPanelHtml,
    type RoleCenterAssetViewModel,
    type RoleCenterPanelRenderHelpers,
    type RoleCenterStatCard,
} from './roleCenterPanel';
import type { RecordEditorViewMeta } from '../types';

type RoleMemoryCategory = 'all' | 'dialogue' | 'event' | 'relationship' | 'identity' | 'world' | 'status' | 'other';

interface MemoryPageRenderHelpers {
    escapeHtml(text: string): string;
    buildTipAttr(text: string): string;
    formatTimeLabel(value: number): string;
    formatActorKeyLabel(actorKey: string): string;
    formatMemorySubtypeLabel(memorySubtype: string): string;
    [key: string]: unknown;
}

interface MemoryPageRenderOptions {
    contentArea: HTMLElement;
    currentMemoryActorKey: string;
    currentMemorySearchQuery: string;
    setCurrentMemoryActorKey(nextActorKey: string): void;
    setCurrentMemorySearchQuery(nextQuery: string): void;
    ensureRecordMemory(): Promise<MemorySDKImpl | null>;
    rerender(): Promise<void>;
    showSuccess(message: string): void;
    showError(message: string): void;
    experience: EditorExperienceSnapshot;
    roleProfiles: Record<string, RoleProfile>;
    memoryCards: MemoryCardSummary[];
    activeActorKey: string | null;
    helpers: MemoryPageRenderHelpers;
}

/**
 * 功能：收集当前聊天里真实出现过的角色键，仅用于角色中心左侧名册过滤。
 * @param experience 记录编辑器体验快照。
 * @param memoryCards 当前记忆卡列表。
 * @param profiles 当前角色资料映射。
 * @returns 当前聊天中实际出现过的角色键集合。
 */
function collectAppearedActorKeys(
    experience: EditorExperienceSnapshot,
    memoryCards: MemoryCardSummary[],
    profiles: Record<string, RoleProfile>,
): Set<string> {
    const appearedActorKeys = new Set<string>();
    const addActorKey = (value: unknown): void => {
        const actorKey = normalizeActorKey(value);
        if (!actorKey || isVirtualActorKey(actorKey) || !profiles[actorKey]) {
            return;
        }
        appearedActorKeys.add(actorKey);
    };

    addActorKey(experience.activeActorKey);
    memoryCards.forEach((card: MemoryCardSummary): void => addActorKey(card.ownerActorKey));
    (experience.groupMemory?.lanes ?? []).forEach((lane): void => addActorKey(lane.actorKey));
    (experience.groupMemory?.actorSalience ?? []).forEach((item): void => addActorKey(item.actorKey));
    (experience.groupMemory?.sharedScene?.participantActorKeys ?? []).forEach((actorKey: string): void => addActorKey(actorKey));
    (experience.canon?.characters ?? []).forEach((character): void => addActorKey(character.actorKey));

    return appearedActorKeys;
}

let currentRoleMemoryCategory: RoleMemoryCategory = 'all';

/**
 * 功能：角色中心页面元数据。
 */
export const MEMORY_PAGE_META: RecordEditorViewMeta = {
    label: '角色中心',
    icon: 'fa-solid fa-id-card-clip',
    title: '角色中心',
    subtitle: '按角色查看资料、关系、物品装备与角色记忆卡。',
    tip: '只展示真实角色；空区块不渲染。',
};

/**
 * 功能：归一化文本。
 * @param value 原始值。
 * @returns 清洗后的文本。
 */
function normalizeText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * 功能：归一化查找键。
 * @param value 原始值。
 * @returns 小写查找键。
 */
function normalizeLookup(value: unknown): string {
    return normalizeText(value).toLowerCase();
}

/**
 * 功能：归一化角色键，去掉常见内部噪音段。
 * @param value 原始角色键。
 * @returns 清洗后的角色键。
 */
function normalizeActorKey(value: unknown): string {
    let actorKey = normalizeText(value);
    if (!actorKey) {
        return '';
    }
    actorKey = actorKey.replace(/\s+[·•]\s+(mutation_summary|summary|memory|state|record|lifecycle)[^/]*$/i, '').trim();
    if (/^(character|assistant|role|name):/i.test(actorKey)) {
        actorKey = actorKey.split(':').slice(1).join(':').trim();
    }
    actorKey = actorKey.replace(/(?:^|[\\/:])mutation_summary:[\w-]+$/i, '').trim();
    actorKey = actorKey.replace(/[\s._:-]+$/g, '').trim();
    return actorKey;
}

/**
 * 功能：判断是否是虚拟角色键。
 * @param actorKey 角色键。
 * @returns 是否应忽略。
 */
function isVirtualActorKey(actorKey: string): boolean {
    const normalized = normalizeLookup(actorKey);
    if (!normalized) {
        return true;
    }
    if (normalized.startsWith('__')) {
        return true;
    }
    return ['world', 'system', 'unowned', 'unknown', 'none', 'global', 'scene'].includes(normalized)
        || /^(world|system|global)[:/]/.test(normalized)
        || /mutation_summary/.test(normalized);
}

/**
 * 功能：数组去重并清洗。
 * @param values 文本数组。
 * @returns 去重后的数组。
 */
function dedupeTexts(values: string[]): string[] {
    return Array.from(new Set(values.map((item: string): string => normalizeText(item)).filter(Boolean)));
}

/**
 * 功能：根据记忆卡推断分类。
 * @param card 记忆卡。
 * @returns 分类键。
 */
function resolveMemoryCategory(card: MemoryCardSummary): RoleMemoryCategory {
    const memoryType = normalizeLookup(card.memoryType);
    const memorySubtype = normalizeLookup(card.memorySubtype);
    if (memorySubtype === 'dialogue_quote' || memoryType === 'dialogue') {
        return 'dialogue';
    }
    if (memoryType === 'event') return 'event';
    if (memoryType === 'relationship') return 'relationship';
    if (memoryType === 'identity') return 'identity';
    if (memoryType === 'world') return 'world';
    if (memoryType === 'status') return 'status';
    return 'other';
}

/**
 * 功能：生成可读记忆标题，过滤内部键噪音。
 * @param card 记忆卡。
 * @param ownerLabel 归属角色名。
 * @returns 标题文本。
 */
function buildReadableMemoryTitle(card: MemoryCardSummary, ownerLabel: string): string {
    const stripOwnerPrefix = (text: string): string => {
        const normalized = normalizeText(text);
        if (!normalized || !ownerLabel) {
            return normalized;
        }
        const ownerPrefixes = [
            `${ownerLabel} · `,
            `${ownerLabel}路`,
            `${ownerLabel} - `,
        ];
        for (const prefix of ownerPrefixes) {
            if (normalized.startsWith(prefix)) {
                return normalizeText(normalized.slice(prefix.length));
            }
        }
        return normalized;
    };
    const isNoisy = (text: string): boolean => {
        const value = normalizeLookup(text);
        if (!value) {
            return true;
        }
        return /mutation_summary|recordkey|lifecycle|source_record|^h[0-9a-f]{6,}$|^_+$/.test(value)
            || /[:]{2}/.test(value);
    };
    const candidates = [
        stripOwnerPrefix(card.title),
        stripOwnerPrefix(card.subject),
    ];
    for (const candidate of candidates) {
        if (!candidate || isNoisy(candidate)) {
            continue;
        }
        return candidate;
    }
    const memoryText = normalizeText(card.memoryText);
    if (memoryText) {
        return memoryText.length > 24 ? `${memoryText.slice(0, 24)}…` : memoryText;
    }
    return '关键记忆';
}

/**
 * 功能：按查询词匹配记忆卡。
 * @param card 记忆卡。
 * @param query 查询词。
 * @param title 可读标题。
 * @param subtypeLabel 细分标签。
 * @returns 是否命中。
 */
function matchesMemoryQuery(card: MemoryCardSummary, query: string, title: string, subtypeLabel: string): boolean {
    const normalizedQuery = normalizeLookup(query);
    if (!normalizedQuery) {
        return true;
    }
    const extra = card as MemoryCardSummary & Record<string, unknown>;
    const speakerLabel = normalizeText(extra.speakerLabel);
    const reason = normalizeText(extra.rememberReason ?? card.sourceReason);
    const sourceMessage = normalizeText(card.sourceMessageIds?.[0] ?? card.anchorMessageId);
    const haystack = [
        title,
        card.memoryText,
        card.memorySubtype,
        card.memoryType,
        subtypeLabel,
        speakerLabel,
        reason,
        sourceMessage,
    ].map((item: unknown): string => normalizeLookup(item)).join('\n');
    return haystack.includes(normalizedQuery);
}

/**
 * 功能：根据装备文本推断装备槽位名称。
 * @param asset 装备条目。
 * @returns 装备槽位标签。
 */
function resolveEquipmentSlotLabel(asset: RoleAssetEntry): string {
    const haystack = normalizeLookup(`${asset.name} ${asset.detail}`);
    if (/weapon|武器|剑|刀|枪|弓|杖|匕首|法器/.test(haystack)) return '主武器';
    if (/shield|副手|盾|法典|书|挂件/.test(haystack)) return '副手';
    if (/head|helmet|头|冠|帽/.test(haystack)) return '头部';
    if (/chest|armor|胸|甲|衣|袍/.test(haystack)) return '躯干';
    if (/hand|glove|臂|手套|护腕/.test(haystack)) return '手部';
    if (/foot|boot|鞋|靴|足/.test(haystack)) return '足部';
    if (/ring|戒|amulet|neck|项链|吊坠/.test(haystack)) return '饰品';
    return '装备槽';
}

/**
 * 功能：为资产条目选择更贴近 RPG 的图标。
 * @param asset 资产条目。
 * @returns Font Awesome 图标类名。
 */
function resolveRoleCenterAssetIcon(asset: RoleAssetEntry): string {
    const haystack = normalizeLookup(`${asset.name} ${asset.detail}`);
    if (/weapon|武器|剑|刀|枪|弓|杖|匕首/.test(haystack)) return 'fa-solid fa-sword';
    if (/armor|甲|袍|胸|护甲/.test(haystack)) return 'fa-solid fa-shield-halved';
    if (/ring|戒|amulet|neck|项链|吊坠/.test(haystack)) return 'fa-solid fa-gem';
    if (/book|卷轴|法典|书/.test(haystack)) return 'fa-solid fa-book-open';
    if (/potion|药|瓶|药剂/.test(haystack)) return 'fa-solid fa-flask';
    if (/key|钥匙/.test(haystack)) return 'fa-solid fa-key';
    if (/coin|金币|货币|钱/.test(haystack)) return 'fa-solid fa-coins';
    return asset.kind === 'equipment' ? 'fa-solid fa-shield-halved' : 'fa-solid fa-box-open';
}

/**
 * 功能：根据资产信息生成简易稀有度标签。
 * @param asset 资产条目。
 * @returns 稀有度标签。
 */
function resolveRoleCenterAssetRarity(asset: RoleAssetEntry): string {
    const haystack = normalizeLookup(`${asset.name} ${asset.detail}`);
    if (/legend|神器|传说|神圣/.test(haystack)) return '传说';
    if (/epic|史诗|秘宝/.test(haystack)) return '史诗';
    if (/rare|稀有|精工/.test(haystack)) return '稀有';
    return '常规';
}

/**
 * 功能：把装备条目整理成固定槽位视图模型，便于渲染装备面板。
 * @param equipments 装备条目数组。
 * @returns 适合装备槽显示的条目数组。
 */
function buildRoleCenterEquipmentSlots(equipments: RoleAssetEntry[]): RoleCenterAssetViewModel[] {
    const preferredSlots = ['主武器', '副手', '头部', '躯干', '手部', '足部', '饰品'];
    const normalizedEquipments = Array.isArray(equipments) ? equipments : [];
    const assigned = new Map<string, RoleAssetEntry>();
    normalizedEquipments.forEach((asset: RoleAssetEntry): void => {
        const slotLabel = resolveEquipmentSlotLabel(asset);
        if (!assigned.has(slotLabel)) {
            assigned.set(slotLabel, asset);
        }
    });
    return preferredSlots.map((slotLabel: string): RoleCenterAssetViewModel => {
        const asset = assigned.get(slotLabel);
        if (!asset) {
            return {
                slotLabel,
                name: '空槽位',
                detail: '尚未记录',
                iconClassName: 'fa-regular fa-square',
                rarityLabel: '空',
                isEmpty: true,
            };
        }
        return {
            slotLabel,
            name: normalizeText(asset.name) || '未命名装备',
            detail: normalizeText(asset.detail) || '暂无说明',
            iconClassName: resolveRoleCenterAssetIcon(asset),
            rarityLabel: resolveRoleCenterAssetRarity(asset),
        };
    });
}

/**
 * 功能：汇总角色的核心数值卡片，用于右侧属性面板。
 * @param profile 当前角色资料。
 * @param roleMemoryCards 当前角色记忆卡。
 * @returns 属性卡片数组。
 */
function buildRoleCenterStatCards(profile: RoleProfile, roleMemoryCards: MemoryCardSummary[]): RoleCenterStatCard[] {
    const relationshipCount = Array.isArray(profile.relationshipFacts) ? profile.relationshipFacts.length : 0;
    const equipmentCount = Array.isArray(profile.equipments) ? profile.equipments.length : 0;
    const itemCount = Array.isArray(profile.items) ? profile.items.length : 0;
    const aliasCount = Array.isArray(profile.aliases) ? profile.aliases.length : 0;
    const organizationCount = Array.isArray(profile.organizationMemberships) ? profile.organizationMemberships.length : 0;
    const activeTaskCount = Array.isArray(profile.activeTasks) ? profile.activeTasks.length : 0;
    return [
        {
            label: '档案完整度',
            value: `${Math.min(99, 36 + profile.identityFacts.length * 8 + profile.originFacts.length * 6)}%`,
            meta: `${profile.identityFacts.length} 条属性 / ${profile.originFacts.length} 条来历`,
            toneClassName: 'is-accent',
        },
        {
            label: '记忆负载',
            value: `${roleMemoryCards.length}`,
            meta: roleMemoryCards.length > 0 ? '当前角色已沉淀记忆卡' : '当前没有记忆卡',
            toneClassName: roleMemoryCards.length > 6 ? 'is-warning' : '',
        },
        {
            label: '关系节点',
            value: `${relationshipCount}`,
            meta: relationshipCount > 0 ? '已连接到其他角色' : '尚未建立关系节点',
        },
        {
            label: '装备位',
            value: `${equipmentCount}`,
            meta: `${itemCount} 件背包物品`,
        },
        {
            label: '身份标签',
            value: `${aliasCount + profile.identityFacts.length}`,
            meta: `${aliasCount} 个别名`,
        },
        {
            label: '组织 / 任务',
            value: `${organizationCount} / ${activeTaskCount}`,
            meta: '所属势力组织 / 当前任务',
        },
    ];
}

/**
 * 功能：渲染角色中心页面。
 * @param options 渲染参数。
 * @returns 无返回值。
 */
export async function renderMemoryPage(options: MemoryPageRenderOptions): Promise<void> {
    const {
        contentArea,
        ensureRecordMemory,
        rerender,
        showSuccess,
        showError,
        experience,
        roleProfiles,
        memoryCards,
        activeActorKey,
        helpers,
    } = options;

    const normalizedProfiles = Object.values(roleProfiles ?? {})
        .filter((profile: RoleProfile): boolean => {
            const actorKey = normalizeActorKey(profile.actorKey);
            return Boolean(actorKey) && !isVirtualActorKey(actorKey);
        })
        .reduce<Record<string, RoleProfile>>((result: Record<string, RoleProfile>, profile: RoleProfile): Record<string, RoleProfile> => {
            const actorKey = normalizeActorKey(profile.actorKey);
            result[actorKey] = {
                ...profile,
                actorKey,
                displayName: normalizeText(profile.displayName) || actorKey,
                aliases: dedupeTexts(profile.aliases ?? []),
                identityFacts: dedupeTexts(profile.identityFacts ?? []),
                originFacts: dedupeTexts(profile.originFacts ?? []),
                relationshipFacts: Array.isArray(profile.relationshipFacts) ? profile.relationshipFacts : [],
                items: Array.isArray(profile.items) ? profile.items : [],
                equipments: Array.isArray(profile.equipments) ? profile.equipments : [],
                currentLocation: normalizeText(profile.currentLocation),
                organizationMemberships: dedupeTexts(profile.organizationMemberships ?? []),
                activeTasks: dedupeTexts(profile.activeTasks ?? []),
                updatedAt: Math.max(0, Number(profile.updatedAt ?? 0) || 0),
            };
            return result;
        }, {});
    const appearedActorKeys = collectAppearedActorKeys(experience, memoryCards, normalizedProfiles);
    const allProfiles = Object.values(normalizedProfiles)
        .filter((profile: RoleProfile): boolean => appearedActorKeys.has(profile.actorKey))
        .sort((left: RoleProfile, right: RoleProfile): number => {
            const timeDiff = Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0);
            if (timeDiff !== 0) {
                return timeDiff;
            }
            return normalizeText(left.displayName).localeCompare(normalizeText(right.displayName), 'zh-CN');
        });

    if (allProfiles.length <= 0) {
        const recomputeButton = buildSharedButton({
            label: '重算角色资料',
            variant: 'secondary',
            iconClassName: 'fa-solid fa-wand-magic-sparkles',
            className: 'stx-re-memory-toolbar-btn',
            attributes: {
                'data-role-recompute': 'true',
            },
        });
        contentArea.innerHTML = `
            <div class="stx-re-memory-shell stx-re-role-center-shell">
                <section class="stx-re-panel-card stx-re-memory-console">
                    <div class="stx-re-memory-console-kicker">角色中心</div>
                    <div class="stx-re-memory-console-title">当前没有可展示的真实角色</div>
                    <div class="stx-re-memory-console-subtitle">可先执行一次重算角色资料，再回到这里查看角色属性与角色记忆。</div>
                    <div class="stx-re-action-row">${recomputeButton}</div>
                </section>
            </div>
        `;
        contentArea.querySelector('[data-role-recompute]')?.addEventListener('click', (): void => {
            void ensureRecordMemory().then(async (memory: MemorySDKImpl | null): Promise<void> => {
                if (!memory) {
                    return;
                }
                await memory.chatState.recomputeRoleProfiles();
                await rerender();
                showSuccess('角色资料已重算');
            }).catch((error: unknown): void => {
                showError(`重算角色资料失败: ${String(error)}`);
            });
        });
        return;
    }

    const roleMap = new Map<string, RoleProfile>(allProfiles.map((profile: RoleProfile): [string, RoleProfile] => [profile.actorKey, profile]));
    const searchQuery = normalizeText(options.currentMemorySearchQuery);
    const filteredRoles = allProfiles.filter((profile: RoleProfile): boolean => {
        if (!searchQuery) {
            return true;
        }
        const aliasText = normalizeLookup((profile.aliases ?? []).join(' '));
        return normalizeLookup(profile.displayName).includes(normalizeLookup(searchQuery))
            || normalizeLookup(profile.actorKey).includes(normalizeLookup(searchQuery))
            || aliasText.includes(normalizeLookup(searchQuery));
    });

    let selectedActorKey = normalizeActorKey(options.currentMemoryActorKey);
    if (!selectedActorKey || !roleMap.has(selectedActorKey)) {
        selectedActorKey = (filteredRoles[0] ?? allProfiles[0]).actorKey;
        options.setCurrentMemoryActorKey(selectedActorKey);
    }
    const selectedRole = roleMap.get(selectedActorKey) ?? allProfiles[0];
    const selectedRoleLabel = normalizeText(selectedRole.displayName) || helpers.formatActorKeyLabel(selectedRole.actorKey);

    const roleMemoryCards = memoryCards
        .filter((card: MemoryCardSummary): boolean => normalizeActorKey(card.ownerActorKey) === selectedRole.actorKey)
        .sort((left: MemoryCardSummary, right: MemoryCardSummary): number => Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0));

    const memoryCategoryOptions: Array<{ value: RoleMemoryCategory; label: string }> = [
        { value: 'all', label: '全部分类' },
        { value: 'dialogue', label: '对话' },
        { value: 'event', label: '事件' },
        { value: 'relationship', label: '关系' },
        { value: 'identity', label: '身份' },
        { value: 'world', label: '世界' },
        { value: 'status', label: '状态' },
        { value: 'other', label: '其他' },
    ];
    if (!memoryCategoryOptions.some((item: { value: RoleMemoryCategory; label: string }): boolean => item.value === currentRoleMemoryCategory)) {
        currentRoleMemoryCategory = 'all';
    }

    const filteredMemoryCards = roleMemoryCards.filter((card: MemoryCardSummary): boolean => {
        const category = resolveMemoryCategory(card);
        if (currentRoleMemoryCategory !== 'all' && category !== currentRoleMemoryCategory) {
            return false;
        }
        const title = buildReadableMemoryTitle(card, selectedRoleLabel);
        const subtypeLabel = helpers.formatMemorySubtypeLabel(normalizeText(card.memorySubtype) || 'other');
        return matchesMemoryQuery(card, searchQuery, title, subtypeLabel);
    });

    const categoryCountMap = roleMemoryCards.reduce<Map<RoleMemoryCategory, number>>((map: Map<RoleMemoryCategory, number>, card: MemoryCardSummary): Map<RoleMemoryCategory, number> => {
        const category = resolveMemoryCategory(card);
        map.set(category, Number(map.get(category) ?? 0) + 1);
        return map;
    }, new Map<RoleMemoryCategory, number>());

    const actorButtons = (filteredRoles.length > 0 ? filteredRoles : allProfiles).map((profile: RoleProfile): string => {
        const actorKey = profile.actorKey;
        const roleCardsCount = memoryCards.filter((card: MemoryCardSummary): boolean => normalizeActorKey(card.ownerActorKey) === actorKey).length;
        const roleLabel = normalizeText(profile.displayName) || helpers.formatActorKeyLabel(actorKey);
        const aliasSummary = (profile.aliases ?? []).slice(0, 2).join(' / ');
        return `
            <button class="stx-re-memory-actor-btn${actorKey === selectedRole.actorKey ? ' is-active' : ''}${normalizeActorKey(activeActorKey) === actorKey ? ' is-focus' : ''}" data-role-actor="${helpers.escapeHtml(actorKey)}"${helpers.buildTipAttr(`切换到 ${roleLabel}`)}>
                <span class="stx-re-memory-actor-icon"><i class="fa-solid ${normalizeActorKey(activeActorKey) === actorKey ? 'fa-crown' : 'fa-user'}" aria-hidden="true"></i></span>
                <span class="stx-re-memory-actor-copy">
                    <span class="stx-re-memory-actor-name">${helpers.escapeHtml(roleLabel)}</span>
                    <span class="stx-re-memory-actor-sub">${helpers.escapeHtml(aliasSummary || actorKey)}</span>
                </span>
                <span class="stx-re-memory-actor-count">${helpers.escapeHtml(String(roleCardsCount))}</span>
            </button>
        `;
    }).join('');

    const searchInput = buildSharedInputField({
        id: 'stx-re-memory-search-input',
        type: 'search',
        value: searchQuery,
        className: 'stx-re-memory-search-input',
        attributes: {
            placeholder: '搜索角色名、记忆标题、细分或对话关键字',
            'data-tip': '用于角色名册和角色记忆列表的联动搜索。',
        },
    });
    const categorySelect = buildSharedSelectField({
        id: 'stx-re-role-memory-category',
        containerClassName: 'stx-shared-select-fluid',
        value: currentRoleMemoryCategory,
        triggerClassName: 'stx-re-memory-actor-select-trigger stx-shared-select-trigger-input stx-shared-select-trigger-36',
        listClassName: 'stx-re-memory-actor-select-list',
        optionClassName: 'stx-re-memory-actor-select-option',
        options: memoryCategoryOptions.map((item: { value: RoleMemoryCategory; label: string }) => ({
            value: item.value,
            label: item.label,
        })),
    });
    const recomputeButton = buildSharedButton({
        label: '重算角色资料',
        variant: 'secondary',
        iconClassName: 'fa-solid fa-wand-magic-sparkles',
        className: 'stx-re-memory-toolbar-btn',
        attributes: {
            'data-role-recompute': 'true',
        },
    });
    const setActiveButton = buildSharedButton({
        label: normalizeActorKey(activeActorKey) === selectedRole.actorKey ? '当前主视角' : '设为主视角',
        variant: normalizeActorKey(activeActorKey) === selectedRole.actorKey ? 'primary' : 'secondary',
        iconClassName: normalizeActorKey(activeActorKey) === selectedRole.actorKey ? 'fa-solid fa-crown' : 'fa-solid fa-compass',
        className: 'stx-re-memory-toolbar-btn',
        attributes: {
            'data-role-set-active': selectedRole.actorKey,
        },
    });

    const statCards = buildRoleCenterStatCards(selectedRole, roleMemoryCards);
    const equipmentSlots = buildRoleCenterEquipmentSlots(selectedRole.equipments);
    const activeLocation = selectedRole.relationshipFacts.find((item) => /地点|位于|驻留|常在|出没/.test(normalizeText(item.label) + normalizeText(item.detail)));
    const locationText = normalizeText(selectedRole.currentLocation)
        || (activeLocation ? normalizeText(activeLocation.detail) || normalizeText(activeLocation.label) : '');
    const organizationText = (selectedRole.organizationMemberships ?? []).slice(0, 3).join('、');
    const activeTaskText = (selectedRole.activeTasks ?? []).slice(0, 2).join('、');
    const activeLocationText = [
        `位置：${locationText || '未提取到稳定地点'}`,
        `组织：${organizationText || '暂无'}`,
        `任务：${activeTaskText || '暂无'}`,
    ].join(' ｜ ');
    const panelHelpers: RoleCenterPanelRenderHelpers = {
        escapeHtml: helpers.escapeHtml,
        formatMemorySubtypeLabel: helpers.formatMemorySubtypeLabel,
        formatTimeLabel: helpers.formatTimeLabel,
    };
    contentArea.innerHTML = renderRoleCenterPanelHtml({
        helpers: panelHelpers,
        selectedRole,
        selectedRoleLabel,
        activeActorKey,
        roleMemoryCards,
        filteredMemoryCards,
        categoryCountMap: categoryCountMap as Map<string, number>,
        actorButtonsHtml: actorButtons,
        searchInputHtml: searchInput,
        categorySelectHtml: categorySelect,
        setActiveButtonHtml: setActiveButton,
        recomputeButtonHtml: recomputeButton,
        statCards,
        equipmentSlots,
        activeLocationText,
        normalizeText,
        normalizeActorKey,
        buildReadableMemoryTitle,
        resolveRoleCenterAssetIcon,
        resolveRoleCenterAssetRarity,
    });

    hydrateSharedSelects(contentArea);

    const searchInputElement = contentArea.querySelector('#stx-re-memory-search-input') as HTMLInputElement | null;
    searchInputElement?.addEventListener('input', (): void => {
        const nextQuery = normalizeText(searchInputElement.value);
        const nextSelectionStart = searchInputElement.selectionStart ?? nextQuery.length;
        const nextSelectionEnd = searchInputElement.selectionEnd ?? nextQuery.length;
        options.setCurrentMemorySearchQuery(nextQuery);
        void rerender().then((): void => {
            const nextInput = contentArea.querySelector('#stx-re-memory-search-input') as HTMLInputElement | null;
            if (!nextInput) {
                return;
            }
            nextInput.focus();
            const start = Math.min(nextSelectionStart, nextInput.value.length);
            const end = Math.min(nextSelectionEnd, nextInput.value.length);
            nextInput.setSelectionRange(start, end);
        });
    });

    const categoryElement = contentArea.querySelector('#stx-re-role-memory-category') as HTMLSelectElement | null;
    categoryElement?.addEventListener('change', (): void => {
        const nextCategory = normalizeText(categoryElement.value) as RoleMemoryCategory;
        currentRoleMemoryCategory = memoryCategoryOptions.some((item: { value: RoleMemoryCategory; label: string }): boolean => item.value === nextCategory)
            ? nextCategory
            : 'all';
        void rerender();
    });

    contentArea.querySelectorAll('[data-role-actor]').forEach((button: Element): void => {
        button.addEventListener('click', (): void => {
            const actorKey = normalizeActorKey((button as HTMLElement).dataset.roleActor);
            if (!actorKey) {
                return;
            }
            options.setCurrentMemoryActorKey(actorKey);
            void rerender();
        });
    });

    contentArea.querySelector('[data-role-recompute]')?.addEventListener('click', (): void => {
        void ensureRecordMemory().then(async (memory: MemorySDKImpl | null): Promise<void> => {
            if (!memory) {
                return;
            }
            await memory.chatState.recomputeRoleProfiles();
            await rerender();
            showSuccess('角色资料已重算');
        }).catch((error: unknown): void => {
            showError(`重算角色资料失败: ${String(error)}`);
        });
    });

    contentArea.querySelector('[data-role-set-active]')?.addEventListener('click', (): void => {
        void ensureRecordMemory().then(async (memory: MemorySDKImpl | null): Promise<void> => {
            if (!memory) {
                return;
            }
            await memory.chatState.setActiveActorKey(selectedRole.actorKey);
            await rerender();
            showSuccess('主视角已更新');
        }).catch((error: unknown): void => {
            showError(`设置主视角失败: ${String(error)}`);
        });
    });
}

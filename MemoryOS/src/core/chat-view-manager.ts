import type {
    ChatMutationKind,
    LogicalChatView,
    LogicalMessageNode,
    TurnKind,
} from '../types';
import { getTavernMessageTextEvent } from '../../../SDK/tavern';

interface ChatViewBuildResult {
    view: LogicalChatView;
    changed: boolean;
}

interface NormalizedMessage {
    messageId: string;
    role: TurnKind;
    text: string;
    textSignature: string;
    createdAt: number;
    updatedAt: number;
}

/**
 * 功能：将宿主聊天快照重建为“逻辑消息视图”并产出差异分类。
 * 参数：
 *   chatKey (string)：当前聊天键。
 * 返回：
 *   ChatViewManager：逻辑视图管理器实例。
 */
export class ChatViewManager {
    private readonly chatKey: string;

    constructor(chatKey: string) {
        this.chatKey = chatKey;
    }

    /**
     * 功能：基于宿主聊天数组重建逻辑视图，并与上一版视图做差异分类。
     * 参数：
     *   chatList (unknown)：宿主原始聊天数组。
     *   previous (LogicalChatView | null)：上一版逻辑视图。
     * 返回：
     *   ChatViewBuildResult：包含新视图与是否发生变化。
     */
    public rebuildFromChat(chatList: unknown, previous: LogicalChatView | null): ChatViewBuildResult {
        const normalized = this.normalizeMessages(chatList);
        const nextVisibleMessages: LogicalMessageNode[] = normalized.map((item: NormalizedMessage, index: number): LogicalMessageNode => {
            const stableId = item.messageId || `idx:${index}`;
            return {
                nodeId: `${stableId}:${item.textSignature || 'empty'}`,
                messageId: item.messageId,
                role: item.role,
                text: item.text,
                textSignature: item.textSignature,
                isVisible: true,
                lifecycle: 'active',
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
            };
        });
        const previousVisible = previous?.visibleMessages ?? [];
        const mutationKinds = this.detectMutations(previousVisible, nextVisibleMessages);
        const supersededCandidates = this.collectSupersededCandidates(previousVisible, nextVisibleMessages);
        const editedRevisions = this.collectEditedRevisions(previousVisible, nextVisibleMessages);
        const deletedTurns = this.collectDeletedTurns(previousVisible, nextVisibleMessages);
        const branchRoots = this.collectBranchRoots(previousVisible, nextVisibleMessages, mutationKinds);
        const activeMessageIds = Array.from(new Set(
            nextVisibleMessages
                .map((node: LogicalMessageNode): string => String(node.messageId ?? '').trim())
                .filter(Boolean),
        ));
        const invalidatedMessageIds = Array.from(new Set(
            [...supersededCandidates, ...editedRevisions, ...deletedTurns]
                .map((node: LogicalMessageNode): string => String(node.messageId ?? '').trim())
                .filter(Boolean),
        ));
        const repairAnchorMessageId = String(branchRoots[0]?.messageId ?? '').trim()
            || String(nextVisibleMessages[nextVisibleMessages.length - 1]?.messageId ?? '').trim()
            || String(invalidatedMessageIds[0] ?? '').trim()
            || null;
        const snapshotHash = this.hashString(
            nextVisibleMessages
                .map((node: LogicalMessageNode): string => `${node.messageId}|${node.role}|${node.textSignature}`)
                .join('\n'),
        );
        const viewHash = this.hashString(
            `${snapshotHash}|${mutationKinds.join(',')}|${supersededCandidates.length}|${editedRevisions.length}|${deletedTurns.length}|${branchRoots.length}`,
        );
        const nextView: LogicalChatView = {
            chatKey: this.chatKey,
            visibleMessages: nextVisibleMessages,
            visibleUserTurns: nextVisibleMessages.filter((node: LogicalMessageNode): boolean => node.role === 'user'),
            visibleAssistantTurns: nextVisibleMessages.filter((node: LogicalMessageNode): boolean => node.role === 'assistant'),
            supersededCandidates,
            editedRevisions,
            deletedTurns,
            branchRoots,
            viewHash,
            snapshotHash,
            mutationKinds,
            activeMessageIds,
            invalidatedMessageIds,
            repairAnchorMessageId,
            rebuiltAt: Date.now(),
        };
        return {
            view: nextView,
            changed: previous?.viewHash !== nextView.viewHash,
        };
    }

    /**
     * 功能：将宿主消息结构归一化为可比对的轻量对象。
     * 参数：
     *   chatList (unknown)：宿主聊天数组。
     * 返回：
     *   NormalizedMessage[]：归一化后的消息数组。
     */
    private normalizeMessages(chatList: unknown): NormalizedMessage[] {
        if (!Array.isArray(chatList)) {
            return [];
        }
        const now = Date.now();
        return chatList
            .map((item: unknown, index: number): NormalizedMessage | null => {
                if (!item || typeof item !== 'object') {
                    return null;
                }
                const source = item as Record<string, unknown>;
                const messageId = String(
                    source._id
                    ?? source.id
                    ?? source.messageId
                    ?? source.mesid
                    ?? '',
                ).trim();
                const text = getTavernMessageTextEvent(source);
                const role = this.resolveRole(source);
                const ts = Number(source.send_date ?? source.ts ?? source.time ?? 0);
                const createdAt = Number.isFinite(ts) && ts > 0 ? ts : now + index;
                return {
                    messageId,
                    role,
                    text,
                    textSignature: this.normalizeTextSignature(text),
                    createdAt,
                    updatedAt: createdAt,
                };
            })
            .filter((item: NormalizedMessage | null): item is NormalizedMessage => {
                return item != null && item.textSignature.length > 0;
            });
    }

    /**
     * 功能：识别当前重建相对上一版视图的语义变动类型。
     * 参数：
     *   previous (LogicalMessageNode[])：上一版可见消息。
     *   next (LogicalMessageNode[])：当前可见消息。
     * 返回：
     *   ChatMutationKind[]：变动类型列表。
     */
    private detectMutations(previous: LogicalMessageNode[], next: LogicalMessageNode[]): ChatMutationKind[] {
        if (previous.length === 0 && next.length > 0) {
            return ['message_added'];
        }
        if (previous.length === 0 && next.length === 0) {
            return [];
        }

        const mutationSet = new Set<ChatMutationKind>();
        const previousById = new Map<string, LogicalMessageNode>();
        for (const node of previous) {
            if (node.messageId) {
                previousById.set(node.messageId, node);
            }
        }
        const nextById = new Map<string, LogicalMessageNode>();
        for (const node of next) {
            if (node.messageId) {
                nextById.set(node.messageId, node);
            }
        }

        for (const node of next) {
            if (!node.messageId || !previousById.has(node.messageId)) {
                mutationSet.add('message_added');
                continue;
            }
            const prev = previousById.get(node.messageId)!;
            if (prev.textSignature !== node.textSignature) {
                mutationSet.add('message_edited');
            }
        }

        for (const node of previous) {
            if (!node.messageId || !nextById.has(node.messageId)) {
                mutationSet.add('message_deleted');
            }
        }

        const removedAssistant = previous.filter((node: LogicalMessageNode): boolean => {
            return node.role === 'assistant' && Boolean(node.messageId) && !nextById.has(node.messageId);
        }).length;
        const addedAssistant = next.filter((node: LogicalMessageNode): boolean => {
            return node.role === 'assistant' && Boolean(node.messageId) && !previousById.has(node.messageId);
        }).length;
        if (removedAssistant > 0 && addedAssistant > 0) {
            mutationSet.add('message_swiped');
        }

        const prefixLength = this.getCommonPrefixLength(previous, next);
        if (previous.length > 0 && next.length > 0 && prefixLength < Math.min(previous.length, next.length) - 1) {
            mutationSet.add('chat_branched');
        }

        return Array.from(mutationSet);
    }

    /**
     * 功能：收集被新候选覆盖的旧 assistant 候选消息。
     * 参数：
     *   previous (LogicalMessageNode[])：上一版可见消息。
     *   next (LogicalMessageNode[])：当前可见消息。
     * 返回：
     *   LogicalMessageNode[]：被覆盖候选集合。
     */
    private collectSupersededCandidates(previous: LogicalMessageNode[], next: LogicalMessageNode[]): LogicalMessageNode[] {
        const nextIds = new Set(next.map((node: LogicalMessageNode): string => node.messageId).filter(Boolean));
        return previous
            .filter((node: LogicalMessageNode): boolean => {
                return node.role === 'assistant' && Boolean(node.messageId) && !nextIds.has(node.messageId);
            })
            .map((node: LogicalMessageNode): LogicalMessageNode => ({ ...node, lifecycle: 'swiped_out', isVisible: false }));
    }

    /**
     * 功能：收集被编辑替换的历史修订节点。
     * 参数：
     *   previous (LogicalMessageNode[])：上一版可见消息。
     *   next (LogicalMessageNode[])：当前可见消息。
     * 返回：
     *   LogicalMessageNode[]：历史修订集合。
     */
    private collectEditedRevisions(previous: LogicalMessageNode[], next: LogicalMessageNode[]): LogicalMessageNode[] {
        const nextById = new Map<string, LogicalMessageNode>();
        for (const node of next) {
            if (node.messageId) {
                nextById.set(node.messageId, node);
            }
        }
        return previous
            .filter((node: LogicalMessageNode): boolean => {
                if (!node.messageId || !nextById.has(node.messageId)) {
                    return false;
                }
                const newer = nextById.get(node.messageId)!;
                return newer.textSignature !== node.textSignature;
            })
            .map((node: LogicalMessageNode): LogicalMessageNode => ({ ...node, lifecycle: 'edited', isVisible: false }));
    }

    /**
     * 功能：收集从可见视图中被删除的节点。
     * 参数：
     *   previous (LogicalMessageNode[])：上一版可见消息。
     *   next (LogicalMessageNode[])：当前可见消息。
     * 返回：
     *   LogicalMessageNode[]：删除节点集合。
     */
    private collectDeletedTurns(previous: LogicalMessageNode[], next: LogicalMessageNode[]): LogicalMessageNode[] {
        const nextIds = new Set(next.map((node: LogicalMessageNode): string => node.messageId).filter(Boolean));
        return previous
            .filter((node: LogicalMessageNode): boolean => {
                return Boolean(node.messageId) && !nextIds.has(node.messageId);
            })
            .map((node: LogicalMessageNode): LogicalMessageNode => ({ ...node, lifecycle: 'deleted', isVisible: false }));
    }

    /**
     * 功能：根据前缀差异识别分支根节点。
     * 参数：
     *   previous (LogicalMessageNode[])：上一版可见消息。
     *   next (LogicalMessageNode[])：当前可见消息。
     *   mutationKinds (ChatMutationKind[])：已识别变动类型。
     * 返回：
     *   LogicalMessageNode[]：分支根集合。
     */
    private collectBranchRoots(
        previous: LogicalMessageNode[],
        next: LogicalMessageNode[],
        mutationKinds: ChatMutationKind[],
    ): LogicalMessageNode[] {
        if (!mutationKinds.includes('chat_branched')) {
            return [];
        }
        const prefixLength = this.getCommonPrefixLength(previous, next);
        const root = next[prefixLength];
        if (!root) {
            return [];
        }
        return [{ ...root, lifecycle: 'branch_root' }];
    }

    /**
     * 功能：计算两组消息的公共前缀长度。
     * 参数：
     *   left (LogicalMessageNode[])：左侧消息序列。
     *   right (LogicalMessageNode[])：右侧消息序列。
     * 返回：
     *   number：公共前缀长度。
     */
    private getCommonPrefixLength(left: LogicalMessageNode[], right: LogicalMessageNode[]): number {
        const max = Math.min(left.length, right.length);
        let count = 0;
        for (let index = 0; index < max; index += 1) {
            const a = left[index]!;
            const b = right[index]!;
            if (a.messageId && b.messageId) {
                if (a.messageId !== b.messageId || a.textSignature !== b.textSignature) {
                    break;
                }
                count += 1;
                continue;
            }
            if (a.role !== b.role || a.textSignature !== b.textSignature) {
                break;
            }
            count += 1;
        }
        return count;
    }

    /**
     * 功能：解析消息角色。
     * 参数：
     *   source (Record<string, unknown>)：宿主消息对象。
     * 返回：
     *   TurnKind：消息角色。
     */
    private resolveRole(source: Record<string, unknown>): TurnKind {
        if (source.is_system === true || source.isSystem === true || source.role === 'system') {
            return 'system';
        }
        if (source.is_user === true || source.isUser === true || source.role === 'user') {
            return 'user';
        }
        return 'assistant';
    }

    /**
     * 功能：标准化文本签名。
     * 参数：
     *   value (string)：原始文本。
     * 返回：
     *   string：归一化签名。
     */
    private normalizeTextSignature(value: string): string {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    /**
     * 功能：计算轻量哈希。
     * 参数：
     *   input (string)：输入文本。
     * 返回：
     *   string：哈希值。
     */
    private hashString(input: string): string {
        let hash = 5381;
        for (let index = 0; index < input.length; index += 1) {
            hash = ((hash << 5) + hash) ^ input.charCodeAt(index);
        }
        return `h${(hash >>> 0).toString(16)}`;
    }
}

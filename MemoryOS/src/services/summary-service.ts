import { readMemoryLLMApi, runSummaryOrchestrator } from '../memory-summary';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import { readMemoryOSSettings } from '../settings/store';
import { EntryRepository } from '../repository/entry-repository';
import type { MemoryEntry, RoleEntryMemory, SummarySnapshot, WorldProfileBinding } from '../types';

/**
 * 功能：定义从聊天消息捕获总结的输入。
 */
export interface CaptureSummaryFromChatInput {
    messages: Array<{ role?: string; content?: string; name?: string }>;
    actorHints?: Array<{ actorKey: string; displayName?: string }>;
    title?: string;
}

/**
 * 功能：统一承接总结捕获与总结编排链路。
 */
export class SummaryService {
    private readonly chatKey: string;
    private readonly repository: EntryRepository;

    constructor(chatKey: string, repository: EntryRepository) {
        this.chatKey = String(chatKey ?? '').trim();
        this.repository = repository;
    }

    /**
     * 功能：从当前聊天消息自动生成结构化总结。
     * @param input 消息输入。
     * @returns 总结快照。
     */
    async captureSummaryFromChat(input: CaptureSummaryFromChatInput): Promise<SummarySnapshot | null> {
        const normalizedMessages = Array.isArray(input.messages)
            ? input.messages.filter((item: { role?: string }): boolean => this.normalizeText(item.role) !== 'system')
            : [];
        if (normalizedMessages.length <= 0) {
            return null;
        }
        for (const actorHint of Array.isArray(input.actorHints) ? input.actorHints : []) {
            await this.repository.ensureActorProfile({
                ...actorHint,
                displayNameSource: 'summary_hint',
            });
        }
        const settings = readMemoryOSSettings();
        const llm = readMemoryLLMApi();
        const summaryResult = await runSummaryOrchestrator({
            dependencies: {
                listEntries: async (): Promise<MemoryEntry[]> => this.repository.listEntries(),
                listRoleMemories: async (actorKey?: string): Promise<RoleEntryMemory[]> => this.repository.listRoleMemories(actorKey),
                listSummarySnapshots: async (limit?: number): Promise<SummarySnapshot[]> => this.repository.listSummarySnapshots(limit),
                getWorldProfileBinding: async (): Promise<WorldProfileBinding | null> => this.repository.getWorldProfileBinding(),
                getTimelineProfile: async () => this.repository.getTimelineProfile(),
                putTimelineProfile: async (profile) => this.repository.putTimelineProfile(profile),
                appendMutationHistory: async (history): Promise<void> => this.repository.appendMutationHistory(history),
                getEntry: async (entryId: string) => this.repository.getEntry(entryId),
                applySummarySnapshot: async (summaryInput) => this.applySummaryArchive(summaryInput),
                deleteEntry: async (entryId: string, options) => this.repository.deleteEntry(entryId, options),
            },
            llm,
            pluginId: MEMORY_OS_PLUGIN_ID,
            chatKey: this.chatKey,
            messages: normalizedMessages,
            retrievalRulePack: settings.retrievalRulePack,
        });
        return summaryResult.snapshot;
    }

    private normalizeText(value: unknown): string {
        return String(value ?? '').replace(/\s+/g, ' ').trim();
    }

    /**
     * 功能：存档总结快照，并复用统一落盘诊断结果。
     * @param input 总结快照输入
     * @returns 存档后的总结快照
     */
    private async applySummaryArchive(input: {
        title?: string;
        content: string;
        normalizedSummary?: SummarySnapshot['normalizedSummary'];
        actorKeys: string[];
        entryUpserts?: Parameters<EntryRepository['applySummarySnapshot']>[0]['entryUpserts'];
        refreshBindings?: Parameters<EntryRepository['applySummarySnapshot']>[0]['refreshBindings'];
    }): Promise<SummarySnapshot> {
        return this.repository.applySummarySnapshot(input);
    }
}

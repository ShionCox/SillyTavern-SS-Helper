import type { EventEnvelope } from '../../../../SDK/stx';
import type { RecallCandidate } from '../../types';
import {
    buildScoredCandidate,
    normalizeText,
    readEventPayloadText,
    readSourceLimit,
    type RecallSourceContext,
    type SummaryRecord,
} from './shared';

export async function collectRecentRecallCandidates(context: RecallSourceContext): Promise<RecallCandidate[]> {
    const sourceLimit = readSourceLimit(context, 'events', 8);
    const candidates: RecallCandidate[] = [];

    if (context.plan.sections.includes('EVENTS')) {
        const visibleMessages = context.logicalView?.visibleMessages ?? [];
        if (visibleMessages.length > 0) {
            visibleMessages.slice(Math.max(0, visibleMessages.length - sourceLimit)).forEach((node): void => {
                const time = new Date(node.updatedAt || node.createdAt || Date.now()).toLocaleTimeString();
                const candidate = buildScoredCandidate(context, {
                    candidateId: `event:${node.messageId}`,
                    recordKey: node.messageId,
                    recordKind: 'event',
                    source: 'events',
                    sectionHint: 'EVENTS',
                    title: `${node.role}:${node.messageId}`,
                    rawText: `[${time}] chat.message.${node.role}: ${node.text}`,
                    confidence: 0.72,
                    updatedAt: Number(node.updatedAt || node.createdAt || Date.now()),
                    continuityScore: 1,
                    recencyWindowDays: 7,
                });
                if (candidate) {
                    candidates.push(candidate);
                }
            });
        } else {
            context.recentEvents.slice(0, sourceLimit).forEach((event: EventEnvelope<unknown>): void => {
                const time = new Date(event.ts).toLocaleTimeString();
                const eventText = readEventPayloadText(event.payload);
                const candidate = buildScoredCandidate(context, {
                    candidateId: `event:${(event as { id?: string }).id ?? `${event.type}:${event.ts}`}`,
                    recordKey: normalizeText(String((event as { id?: string }).id ?? `${event.type}:${event.ts}`)),
                    recordKind: 'event',
                    source: 'events',
                    sectionHint: 'EVENTS',
                    title: normalizeText(event.type),
                    rawText: `[${time}] ${event.type}: ${eventText}`,
                    confidence: 0.64,
                    updatedAt: Number(event.ts ?? Date.now()),
                    continuityScore: 0.9,
                    recencyWindowDays: 7,
                });
                if (candidate) {
                    candidates.push(candidate);
                }
            });
        }
    }

    if (context.plan.sections.includes('LAST_SCENE')) {
        const [sceneSummaries, messageSummaries] = await Promise.all([
            context.summariesManager.query({ level: 'scene', limit: 4 }),
            context.summariesManager.query({ level: 'message', limit: 4 }),
        ]) as [SummaryRecord[], SummaryRecord[]];
        [...sceneSummaries, ...messageSummaries]
            .sort((left: SummaryRecord, right: SummaryRecord): number => Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0))
            .slice(0, Math.max(4, sourceLimit - 2))
            .forEach((summary: SummaryRecord): void => {
                const candidate = buildScoredCandidate(context, {
                    candidateId: `scene:${normalizeText(summary.summaryId || `${summary.title}:${summary.createdAt}`)}`,
                    recordKey: normalizeText(summary.summaryId || `${summary.title}:${summary.createdAt}`),
                    recordKind: 'summary',
                    source: 'summaries',
                    sectionHint: 'LAST_SCENE',
                    title: normalizeText(summary.title || 'scene'),
                    rawText: `${summary.title ? `${summary.title}: ` : ''}${summary.content ?? ''}`,
                    confidence: Number(summary.encodeScore ?? 0.6),
                    updatedAt: Number(summary.createdAt ?? Date.now()),
                    continuityScore: 1,
                    recencyWindowDays: 10,
                });
                if (candidate) {
                    candidates.push(candidate);
                }
            });
        if (context.groupMemory?.sharedScene?.currentScene) {
            const candidate = buildScoredCandidate(context, {
                candidateId: 'shared-scene:current',
                recordKey: 'shared-scene:current',
                recordKind: 'state',
                source: 'state',
                sectionHint: 'LAST_SCENE',
                title: '当前场景',
                rawText: `当前场景: ${context.groupMemory.sharedScene.currentScene}`,
                confidence: 0.82,
                updatedAt: Number(context.groupMemory.sharedScene.updatedAt ?? Date.now()),
                continuityScore: 1,
            });
            if (candidate) {
                candidates.push(candidate);
            }
        }
        if (context.groupMemory?.sharedScene?.currentConflict) {
            const candidate = buildScoredCandidate(context, {
                candidateId: 'shared-scene:conflict',
                recordKey: 'shared-scene:conflict',
                recordKind: 'state',
                source: 'state',
                sectionHint: 'LAST_SCENE',
                title: '当前冲突',
                rawText: `当前冲突: ${context.groupMemory.sharedScene.currentConflict}`,
                confidence: 0.78,
                updatedAt: Number(context.groupMemory.sharedScene.updatedAt ?? Date.now()),
                continuityScore: 0.92,
            });
            if (candidate) {
                candidates.push(candidate);
            }
        }
        (context.groupMemory?.sharedScene?.pendingEvents ?? []).slice(-3).forEach((eventText: string, index: number): void => {
            const candidate = buildScoredCandidate(context, {
                candidateId: `pending-event:${index}:${eventText}`,
                recordKey: `pending-event:${index}`,
                recordKind: 'event',
                source: 'events',
                sectionHint: 'LAST_SCENE',
                title: '未完成事件',
                rawText: `未完成事件: ${eventText}`,
                confidence: 0.76,
                updatedAt: Number(context.groupMemory?.sharedScene?.updatedAt ?? Date.now()),
                continuityScore: 0.94,
                recencyWindowDays: 7,
            });
            if (candidate) {
                candidates.push(candidate);
            }
        });
    }

    return candidates;
}
import type { GroupMemoryState } from '../types';
import { clamp01, normalizeMemoryText } from './memory-intelligence';

export interface GroupRelationshipSeed {
    relationshipKey: string;
    actorKey: string;
    targetKey: string;
    scope: 'self_target' | 'group_pair';
    participantKeys: string[];
    baseline: number;
    text: string;
    detail: string;
}

/**
 * 功能：从群聊记忆里构建可用于关系图计算的种子。
 * @param selfActorKey 当前主角色键。
 * @param groupMemory 群聊记忆状态。
 * @returns 关系图种子列表。
 */
export function buildGroupRelationshipSeeds(selfActorKey: string, groupMemory: GroupMemoryState | null): GroupRelationshipSeed[] {
    if (!groupMemory || !Array.isArray(groupMemory.lanes) || groupMemory.lanes.length === 0) {
        return [];
    }
    const salienceMap: Map<string, number> = new Map(
        (Array.isArray(groupMemory.actorSalience) ? groupMemory.actorSalience : []).map((item): [string, number] => [
            normalizeMemoryText(item.actorKey),
            clamp01(Number(item.score ?? 0)),
        ]),
    );
    const sharedSceneText: string = normalizeMemoryText([
        groupMemory.sharedScene?.currentScene ?? '',
        groupMemory.sharedScene?.currentConflict ?? '',
        ...(Array.isArray(groupMemory.sharedScene?.groupConsensus) ? groupMemory.sharedScene!.groupConsensus.slice(-3) : []),
        ...(Array.isArray(groupMemory.sharedScene?.pendingEvents) ? groupMemory.sharedScene!.pendingEvents.slice(-3) : []),
    ].filter(Boolean).join('；'));
    const lanes = groupMemory.lanes
        .map((lane) => ({
            ...lane,
            actorKey: normalizeMemoryText(lane.actorKey),
            displayName: normalizeMemoryText(lane.displayName),
            relationshipDelta: normalizeMemoryText(lane.relationshipDelta),
            lastEmotion: normalizeMemoryText(lane.lastEmotion),
            recentGoal: normalizeMemoryText(lane.recentGoal),
        }))
        .filter((lane) => lane.actorKey);
    const seeds: GroupRelationshipSeed[] = [];

    lanes
        .filter((lane) => lane.actorKey !== selfActorKey)
        .forEach((lane): void => {
            const baseline: number = clamp01(
                Number(lane.recentMessageIds?.length ?? 0) * 0.08
                + (lane.lastActiveAt > 0 ? 0.12 : 0)
                + Number(salienceMap.get(lane.actorKey) ?? 0) * 0.42
                + (lane.relationshipDelta ? 0.12 : 0),
            );
            const detail: string = normalizeMemoryText(lane.displayName || lane.actorKey);
            const text: string = normalizeMemoryText([
                lane.relationshipDelta,
                lane.lastEmotion,
                lane.recentGoal,
                sharedSceneText,
            ].filter(Boolean).join('；'));
            seeds.push({
                relationshipKey: `${selfActorKey}::${lane.actorKey}`,
                actorKey: selfActorKey,
                targetKey: lane.actorKey,
                scope: 'self_target',
                participantKeys: [selfActorKey, lane.actorKey],
                baseline,
                text,
                detail,
            });
        });

    for (let index = 0; index < lanes.length; index += 1) {
        const left = lanes[index];
        if (!left || left.actorKey === selfActorKey) {
            continue;
        }
        for (let inner = index + 1; inner < lanes.length; inner += 1) {
            const right = lanes[inner];
            if (!right || right.actorKey === selfActorKey || right.actorKey === left.actorKey) {
                continue;
            }
            const pairKeys: string[] = [left.actorKey, right.actorKey].sort();
            const pairNames: string[] = [left.displayName || left.actorKey, right.displayName || right.actorKey];
            const detail: string = normalizeMemoryText(pairNames.join(' / '));
            const text: string = normalizeMemoryText([
                left.relationshipDelta,
                right.relationshipDelta,
                left.lastEmotion,
                right.lastEmotion,
                left.recentGoal,
                right.recentGoal,
                sharedSceneText,
            ].filter(Boolean).join('；'));
            const baseline: number = clamp01(
                Number(salienceMap.get(left.actorKey) ?? 0) * 0.24
                + Number(salienceMap.get(right.actorKey) ?? 0) * 0.24
                + Number(left.recentMessageIds?.length ?? 0) * 0.04
                + Number(right.recentMessageIds?.length ?? 0) * 0.04
                + (sharedSceneText ? 0.12 : 0),
            );
            seeds.push({
                relationshipKey: `${pairKeys[0]}::${pairKeys[1]}`,
                actorKey: pairKeys[0],
                targetKey: pairKeys[1],
                scope: 'group_pair',
                participantKeys: pairKeys,
                baseline,
                text,
                detail,
            });
        }
    }

    return seeds;
}

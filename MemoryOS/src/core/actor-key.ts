const STRICT_ACTOR_KEY_PATTERN = /^actor_[a-z0-9_]+$/;

/**
 * 功能：仅做最小语法级归一化，便于对 actorKey 执行严格校验。
 * @param value 原始角色键。
 * @returns 仅做去空格与小写化后的结果。
 */
export function normalizeStrictActorKeySyntax(value: unknown): string {
    return String(value ?? '').trim().toLowerCase();
}

/**
 * 功能：判断输入是否满足 MemoryOS 当前允许的严格 actorKey 协议。
 * @param value 原始角色键。
 * @returns 是否为 `user` 或 `actor_*` 形式。
 */
export function isStrictActorKey(value: unknown): boolean {
    const normalizedValue = normalizeStrictActorKeySyntax(value);
    return normalizedValue === 'user' || STRICT_ACTOR_KEY_PATTERN.test(normalizedValue);
}

/**
 * 功能：断言输入满足严格 actorKey 协议，不满足时直接抛出错误。
 * @param value 原始角色键。
 * @param context 错误上下文。
 * @returns 通过校验的标准 actorKey。
 */
export function assertStrictActorKey(value: unknown, context: string = 'actorKey'): string {
    const normalizedValue = normalizeStrictActorKeySyntax(value);
    if (!isStrictActorKey(normalizedValue)) {
        throw new Error(`invalid_actor_key:${context}:${String(value ?? '').trim() || '<empty>'}`);
    }
    return normalizedValue;
}

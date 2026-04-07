/**
 * 功能：定义检索模式三态枚举。
 * 说明：
 *   - lexical_only — 仅使用词法检索链（BM25 / n-gram / 编辑距离等）
 *   - vector_only — 仅使用向量检索链（当 provider 不可用时返回空 + 诊断）
 *   - hybrid — 同时使用词法 + 向量，融合排序后输出
 */
export type RetrievalMode = 'lexical_only' | 'vector_only' | 'hybrid';

/**
 * 功能：把原始字符串归一化为合法 RetrievalMode。
 * @param value 原始值。
 * @param fallback 无法识别时的回退值。
 * @returns 归一化后的 RetrievalMode。
 */
export function normalizeRetrievalMode(
    value: unknown,
    fallback: RetrievalMode = 'lexical_only',
): RetrievalMode {
    const text = String(value ?? '').trim().toLowerCase();
    if (text === 'lexical_only' || text === 'vector_only' || text === 'hybrid') {
        return text;
    }
    return fallback;
}

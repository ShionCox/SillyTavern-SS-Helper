/**
 * 功能：计算编辑距离。
 * @param left 左字符串。
 * @param right 右字符串。
 * @returns 编辑距离。
 */
export function computeEditDistance(left: string, right: string): number {
    const a = String(left ?? '');
    const b = String(right ?? '');
    if (!a) {
        return b.length;
    }
    if (!b) {
        return a.length;
    }
    const rows = a.length + 1;
    const cols = b.length + 1;
    const matrix: number[][] = Array.from({ length: rows }, (): number[] => Array(cols).fill(0));
    for (let i = 0; i < rows; i += 1) {
        matrix[i][0] = i;
    }
    for (let j = 0; j < cols; j += 1) {
        matrix[0][j] = j;
    }
    for (let i = 1; i < rows; i += 1) {
        for (let j = 1; j < cols; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost,
            );
        }
    }
    return matrix[rows - 1][cols - 1];
}

/**
 * 功能：将编辑距离转换为相似度分数。
 * @param left 左字符串。
 * @param right 右字符串。
 * @returns 0~1 相似度。
 */
export function computeEditSimilarity(left: string, right: string): number {
    const a = String(left ?? '');
    const b = String(right ?? '');
    const maxLength = Math.max(a.length, b.length);
    if (maxLength <= 0) {
        return 0;
    }
    const distance = computeEditDistance(a, b);
    return clamp01(1 - (distance / maxLength));
}

/**
 * 功能：提取文本 token，兼容中文与英文词。
 * @param text 输入文本。
 * @returns token 列表。
 */
export function tokenizeText(text: string): string[] {
    const normalized = String(text ?? '').toLowerCase();
    const lexical = normalized.match(/[\p{L}\p{N}_-]+/gu) ?? [];
    const hanTokens = buildHanBigrams(normalized);
    return dedupeTokens([...lexical, ...hanTokens]);
}

/**
 * 功能：构建字符 n-gram 集合。
 * @param text 输入文本。
 * @param n n-gram 大小。
 * @returns n-gram 集合。
 */
export function buildCharacterNGrams(text: string, n: number = 3): Set<string> {
    const source = String(text ?? '').toLowerCase().replace(/\s+/g, '');
    const size = Math.max(1, Number(n) || 3);
    if (source.length <= size) {
        return new Set(source ? [source] : []);
    }
    const result = new Set<string>();
    for (let index = 0; index <= source.length - size; index += 1) {
        result.add(source.slice(index, index + size));
    }
    return result;
}

/**
 * 功能：计算 n-gram Jaccard 相似度。
 * @param left 左文本。
 * @param right 右文本。
 * @returns 0~1 相似度。
 */
export function computeNGramSimilarity(left: string, right: string): number {
    const leftSet = buildCharacterNGrams(left, 3);
    const rightSet = buildCharacterNGrams(right, 3);
    if (leftSet.size <= 0 || rightSet.size <= 0) {
        return 0;
    }
    let intersection = 0;
    for (const item of leftSet) {
        if (rightSet.has(item)) {
            intersection += 1;
        }
    }
    const union = leftSet.size + rightSet.size - intersection;
    return union > 0 ? clamp01(intersection / union) : 0;
}

/**
 * 功能：限制到 0~1 区间。
 * @param value 原始值。
 * @returns 限制结果。
 */
export function clamp01(value: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(0, Math.min(1, Number(numeric.toFixed(6))));
}

/**
 * 功能：计算时间衰减权重。
 * @param updatedAt 更新时间戳。
 * @param halfLifeMs 半衰期（毫秒），默认 30 天。
 * @returns 0~1 权重。
 */
export function computeRecencyWeight(updatedAt: number, halfLifeMs: number = 30 * 24 * 3600 * 1000): number {
    const elapsed = Math.max(0, Date.now() - (Number(updatedAt) || 0));
    return clamp01(Math.exp(-0.693 * elapsed / Math.max(1, halfLifeMs)));
}

/**
 * 功能：计算记忆度权重。
 * @param memoryPercent 记忆度百分比。
 * @returns 0~1 权重。
 */
export function computeMemoryWeight(memoryPercent: number): number {
    return clamp01((Number(memoryPercent) || 0) / 100);
}

/**
 * 功能：合并种子评分细节。
 * @param parts 各项分值。
 * @returns 加权总分。
 */
export function mergeSeedScoreBreakdown(parts: {
    bm25: number;
    ngram: number;
    editDistance: number;
    memoryWeight: number;
    recencyWeight: number;
}): number {
    return clamp01(Number((
        parts.bm25 * 0.55
        + parts.ngram * 0.15
        + parts.editDistance * 0.08
        + parts.memoryWeight * 0.12
        + parts.recencyWeight * 0.10
    ).toFixed(6)));
}

/**
 * 功能：计算图扩散增益。
 * @param seedScore 种子分数。
 * @param edgeWeight 边权重。
 * @param decay 衰减系数。
 * @returns 扩散增益。
 */
export function applyGraphBoost(seedScore: number, edgeWeight: number, decay: number = 0.65): number {
    return clamp01(Number((seedScore * edgeWeight * decay).toFixed(6)));
}

/**
 * 功能：施加多样性惩罚。
 * @param score 原始分数。
 * @param penalty 惩罚值。
 * @returns 惩罚后分数。
 */
export function applyDiversityPenalty(score: number, penalty: number): number {
    return clamp01(Number((score - Math.abs(penalty)).toFixed(6)));
}

/**
 * 功能：构建中文双字 token。
 * @param text 输入文本。
 * @returns 双字 token 列表。
 */
function buildHanBigrams(text: string): string[] {
    const result: string[] = [];
    const hanSegments = String(text ?? '').match(/[\p{Script=Han}]+/gu) ?? [];
    for (const segment of hanSegments) {
        if (segment.length <= 1) {
            result.push(segment);
            continue;
        }
        for (let index = 0; index < segment.length - 1; index += 1) {
            result.push(segment.slice(index, index + 2));
        }
    }
    return result;
}

/**
 * 功能：去重 token 并去空。
 * @param tokens token 列表。
 * @returns 去重结果。
 */
function dedupeTokens(tokens: string[]): string[] {
    const merged: string[] = [];
    for (const token of tokens) {
        const normalized = String(token ?? '').trim();
        if (normalized && !merged.includes(normalized)) {
            merged.push(normalized);
        }
    }
    return merged;
}


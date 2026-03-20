import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

interface ApiTestConfig {
    generationUrl: string;
    generationKey: string;
    generationModel: string;
    generationHeaders: Record<string, string>;
    generationBody: Record<string, unknown>;
    embedUrl: string;
    embedKey: string;
    embedModel: string;
    embedHeaders: Record<string, string>;
    embedBody: Record<string, unknown>;
    rerankUrl: string;
    rerankKey: string;
    rerankModel: string;
    rerankHeaders: Record<string, string>;
    rerankBody: Record<string, unknown>;
}

/**
 * 功能：为不同能力补全常见的默认接口路径。
 * @param url 原始地址。
 * @param kind 接口能力类型。
 * @returns 规范化后的接口地址。
 */
function resolveApiUrl(url: string, kind: 'generation' | 'embed' | 'rerank'): string {
    const normalized = String(url || '').trim().replace(/\/+$/, '');
    if (!normalized) {
        return '';
    }
    if (kind === 'generation') {
        if (/\/chat\/completions$/i.test(normalized) || /\/responses$/i.test(normalized)) {
            return normalized;
        }
        if (/\/v\d+$/i.test(normalized)) {
            return `${normalized}/chat/completions`;
        }
        return normalized;
    }
    if (kind === 'embed') {
        if (/\/embeddings$/i.test(normalized)) {
            return normalized;
        }
        if (/\/v\d+$/i.test(normalized)) {
            return `${normalized}/embeddings`;
        }
        return normalized;
    }
    if (/\/rerank$/i.test(normalized)) {
        return normalized;
    }
    if (/\/v\d+$/i.test(normalized)) {
        return `${normalized}/rerank`;
    }
    return normalized;
}

/**
 * 功能：解析简单的 `.env` 文件内容。
 * @param source `.env` 原始文本。
 * @returns 键值映射。
 */
function parseEnvSource(source: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = source.split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }
        const separatorIndex = trimmed.indexOf('=');
        if (separatorIndex <= 0) {
            continue;
        }
        const key = trimmed.slice(0, separatorIndex).trim();
        let value = trimmed.slice(separatorIndex + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
            value = value.slice(1, -1);
        }
        result[key] = value;
    }
    return result;
}

/**
 * 功能：读取测试环境变量，支持 `process.env` 与多个 `.env` 候选文件。
 * @returns 合并后的环境变量映射。
 */
function loadEnvRecord(): Record<string, string> {
    const candidates = [
        resolve(__dirname, './.env.memoryos.test'),
        resolve(__dirname, './.env'),
        resolve(__dirname, '../../.env.memoryos.test'),
        resolve(__dirname, '../../.env'),
    ];
    const merged: Record<string, string> = {};
    for (const candidate of candidates) {
        if (!existsSync(candidate)) {
            continue;
        }
        Object.assign(merged, parseEnvSource(readFileSync(candidate, 'utf8')));
    }
    for (const [key, value] of Object.entries(process.env)) {
        if (typeof value === 'string' && value) {
            merged[key] = value;
        }
    }
    return merged;
}

/**
 * 功能：安全解析 JSON 配置，解析失败时回落为空对象。
 * @param value JSON 文本。
 * @returns 解析结果。
 */
function parseJsonRecord(value: string): Record<string, unknown> {
    const trimmed = String(value || '').trim();
    if (!trimmed) {
        return {};
    }
    try {
        const parsed = JSON.parse(trimmed);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : {};
    } catch {
        return {};
    }
}

/**
 * 功能：根据 `.env` 记录构建接口测试配置。
 * @param env 环境变量映射。
 * @returns 测试配置。
 */
function buildApiTestConfig(env: Record<string, string>): ApiTestConfig {
    const buildHeaders = (prefix: 'GENERATION' | 'EMBED' | 'RERANK'): Record<string, string> => {
        const customHeaders = parseJsonRecord(env[`MEMORYOS_TEST_${prefix}_HEADERS`] || '');
        const key = String(env[`MEMORYOS_TEST_${prefix}_KEY`] || '').trim();
        return {
            'Content-Type': 'application/json',
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
            ...Object.entries(customHeaders).reduce<Record<string, string>>((result, [headerKey, headerValue]) => {
                result[headerKey] = String(headerValue ?? '');
                return result;
            }, {}),
        };
    };

    return {
        generationUrl: resolveApiUrl(String(env.MEMORYOS_TEST_GENERATION_URL || '').trim(), 'generation'),
        generationKey: String(env.MEMORYOS_TEST_GENERATION_KEY || '').trim(),
        generationModel: String(env.MEMORYOS_TEST_GENERATION_MODEL || '').trim(),
        generationHeaders: buildHeaders('GENERATION'),
        generationBody: parseJsonRecord(env.MEMORYOS_TEST_GENERATION_BODY_JSON || ''),
        embedUrl: resolveApiUrl(String(env.MEMORYOS_TEST_EMBED_URL || '').trim(), 'embed'),
        embedKey: String(env.MEMORYOS_TEST_EMBED_KEY || '').trim(),
        embedModel: String(env.MEMORYOS_TEST_EMBED_MODEL || '').trim(),
        embedHeaders: buildHeaders('EMBED'),
        embedBody: parseJsonRecord(env.MEMORYOS_TEST_EMBED_BODY_JSON || ''),
        rerankUrl: resolveApiUrl(String(env.MEMORYOS_TEST_RERANK_URL || '').trim(), 'rerank'),
        rerankKey: String(env.MEMORYOS_TEST_RERANK_KEY || '').trim(),
        rerankModel: String(env.MEMORYOS_TEST_RERANK_MODEL || '').trim(),
        rerankHeaders: buildHeaders('RERANK'),
        rerankBody: parseJsonRecord(env.MEMORYOS_TEST_RERANK_BODY_JSON || ''),
    };
}

/**
 * 功能：判断某组接口测试配置是否填写完整。
 * @param values 待检查的字段值。
 * @returns 是否完整。
 */
function hasRequiredValues(...values: string[]): boolean {
    return values.every((value: string): boolean => Boolean(String(value || '').trim()));
}

/**
 * 功能：发送 JSON 请求并返回解析后的结果。
 * @param url 请求地址。
 * @param headers 请求头。
 * @param body 请求体。
 * @returns 响应状态与 JSON 数据。
 */
async function postJson(
    url: string,
    headers: Record<string, string>,
    body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: any; rawText: string }> {
    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    const text = await response.text();
    let data: any = {};
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = { rawText: text };
        }
    }
    return {
        ok: response.ok,
        status: response.status,
        data,
        rawText: text,
    };
}

/**
 * 功能：把测试结果打印到终端，便于直接查看接口返回。
 * @param label 测试标签。
 * @param response 接口响应结果。
 * @returns 无返回值。
 */
function printTestResult(
    label: string,
    response: { ok: boolean; status: number; data: any; rawText: string },
): void {
    const preview = JSON.stringify(response.data, null, 2);
    console.log(`\n[${label}] 状态=${response.status} ok=${response.ok}`);
    console.log(preview.length > 4000 ? `${preview.slice(0, 4000)}\n...` : preview);
}

const envRecord = loadEnvRecord();
const config = buildApiTestConfig(envRecord);

const generationReady = hasRequiredValues(config.generationUrl, config.generationModel);
const embedReady = hasRequiredValues(config.embedUrl, config.embedModel);
const rerankReady = hasRequiredValues(config.rerankUrl, config.rerankModel);

const generationIt = generationReady ? it : it.skip;
const embedIt = embedReady ? it : it.skip;
const rerankIt = rerankReady ? it : it.skip;
const GENERATION_TIMEOUT_MS = 15000;
const EMBED_TIMEOUT_MS = 10000;
const RERANK_TIMEOUT_MS = 15000;

describe('ai api env integration', (): void => {
    generationIt('大模型接口可返回有效文本', async (): Promise<void> => {
        const response = await postJson(config.generationUrl, config.generationHeaders, {
            model: config.generationModel,
            messages: [
                {
                    role: 'system',
                    content: '你是测试助手。请只返回一句简体中文，说明接口连通成功。',
                },
                {
                    role: 'user',
                    content: '请返回一句用于确认大模型接口正常的简短中文。',
                },
            ],
            temperature: 0.1,
            max_tokens: 80,
            ...config.generationBody,
        });

        printTestResult('生成接口', response);
        expect(response.ok).toBe(true);
        const content = String(
            response.data?.choices?.[0]?.message?.content
            || response.data?.output?.[0]?.content?.[0]?.text
            || response.data?.text
            || '',
        ).trim();
        expect(content.length).toBeGreaterThan(0);
    }, GENERATION_TIMEOUT_MS);

    embedIt('向量接口可返回有效向量', async (): Promise<void> => {
        const response = await postJson(config.embedUrl, config.embedHeaders, {
            model: config.embedModel,
            input: 'Alice 是一名冷静克制的调查员，优先依据证据行动。',
            ...config.embedBody,
        });

        printTestResult('向量接口', response);
        expect(response.ok).toBe(true);
        const vector = response.data?.data?.[0]?.embedding || response.data?.embeddings?.[0] || [];
        expect(Array.isArray(vector)).toBe(true);
        expect(vector.length).toBeGreaterThan(0);
    }, EMBED_TIMEOUT_MS);

    rerankIt('重排接口可返回有效排序结果', async (): Promise<void> => {
        const response = await postJson(config.rerankUrl, config.rerankHeaders, {
            model: config.rerankModel,
            query: '世界规则与角色关系',
            documents: [
                'Alice 与 Bob 是长期合作的搭档，遇到风险时通常优先互相掩护。',
                '这个世界中公开施法会留下可追踪痕迹，容易暴露施术者位置。',
                '今天城外下了很大的雨。',
            ],
            top_n: 2,
            ...config.rerankBody,
        });

        printTestResult('重排接口', response);
        expect(response.ok).toBe(true);
        const results = response.data?.results || response.data?.data || [];
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBeGreaterThan(0);
    }, RERANK_TIMEOUT_MS);
});

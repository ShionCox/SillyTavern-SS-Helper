export function getMessageTextSafe(message: any): string {
    if (!message) return '';

    // 优先读取当前 swipe
    if (Array.isArray(message.swipes) && typeof message.swipe_id === 'number') {
        const id = message.swipe_id;
        if (id >= 0 && id < message.swipes.length) {
            const swipe = message.swipes[id];

            if (typeof swipe === 'string') return swipe;
            if (swipe && typeof swipe === 'object') {
                if (typeof swipe.mes === 'string') return swipe.mes;
                if (typeof swipe.content === 'string') return swipe.content;
                if (typeof swipe.text === 'string') return swipe.text;
            }
        }
    }

    if (typeof message.mes === 'string') return message.mes;
    if (typeof message.content === 'string') return message.content;
    if (typeof message.text === 'string') return message.text;

    return '';
}

export function setMessageTextSafe(message: any, newText: string) {
    if (!message) return message;

    if (typeof message.mes !== 'undefined') {
        message.mes = newText;
    }

    if (typeof message.content !== 'undefined') {
        message.content = newText;
    }

    if (typeof message.text !== 'undefined') {
        message.text = newText;
    }

    if (Array.isArray(message.swipes) && typeof message.swipe_id === 'number') {
        const id = message.swipe_id;
        if (id >= 0 && id < message.swipes.length) {
            const swipe = message.swipes[id];

            if (typeof swipe === 'string') {
                message.swipes[id] = newText;
            } else if (swipe && typeof swipe === 'object') {
                if (typeof swipe.mes !== 'undefined') swipe.mes = newText;
                if (typeof swipe.content !== 'undefined') swipe.content = newText;
                if (typeof swipe.text !== 'undefined') swipe.text = newText;
            }
        }
    }

    return message;
}

export function isDiceLikeJson(body: string): boolean {
    if (!body) return false;
    return [
        /"type"\s*:\s*"dice_events"/i,
        /"rolls"\s*:/i,
        /"check_result"\s*:/i,
        /"dice"\s*:/i,
        /"dc"\s*:/i,
    ].some((re) => re.test(body));
}

export function stripRollJsonBlocks(text: string): string {
    if (!text) return text;

    let output = text;

    // 1. 按行解析剥离 ```rolljson ... ```
    // 这种按行解析可以避免大正则灾难性回溯和未闭合导致的误删
    const lines = output.split('\n');
    const keptLines: string[] = [];
    let inRollJsonBlock = false;
    let inNormalJsonBlock = false;
    let jsonBuffer: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();

        if (!inRollJsonBlock && !inNormalJsonBlock) {
            if (trimmed.startsWith('```rolljson')) {
                inRollJsonBlock = true;
                continue;
            }
            if (trimmed.startsWith('```json')) {
                inNormalJsonBlock = true;
                jsonBuffer = [];
                continue;
            }
            keptLines.push(line);
        } else if (inRollJsonBlock) {
            if (trimmed === '```') {
                inRollJsonBlock = false;
            }
            // 在 rolljson 内部的行直接丢弃
        } else if (inNormalJsonBlock) {
            if (trimmed === '```') {
                inNormalJsonBlock = false;
                const blockContent = jsonBuffer.join('\n');
                // 检查这个 json 块是否看起来像我们的骰子数据
                if (!isDiceLikeJson(blockContent)) {
                    // 如果不像，那就原样放回去（把开头和结尾也补回来）
                    keptLines.push('```json');
                    keptLines.push(...jsonBuffer);
                    keptLines.push('```');
                }
            } else {
                jsonBuffer.push(line);
            }
        }
    }

    output = keptLines.join('\n');

    // 2. 删除 html/pre 包裹的事件块
    output = output.replace(/<pre[^>]*>[\s\S]*?"type"\s*:\s*"dice_events"[\s\S]*?<\/pre>/gi, '');

    // 3. 删除你自己注入的 managed summary block 和其他内部块
    output = output.replace(
        /<!--\s*ROLLHELPER_INTERNAL_START\s*-->[\s\S]*?<!--\s*ROLLHELPER_INTERNAL_END\s*-->/gi,
        ''
    );
    output = output.replace(
        /<!--\s*ROLLHELPER_SUMMARY_START\s*-->[\s\S]*?<!--\s*ROLLHELPER_SUMMARY_END\s*-->/gi,
        ''
    );

    // 4. 清理多余空行，最多保留两个连续空行
    output = output.replace(/\n{3,}/g, '\n\n').trim();

    return output;
}

export function sanitizeAssistantMessageForSummary(message: any, options?: { blockInternalTags?: boolean }) {
    if (!message) return message;

    try {
        const rawText = getMessageTextSafe(message);
        const cleanedText = stripRollJsonBlocks(rawText);

        setMessageTextSafe(message, cleanedText);

        // 追加兼容其他系统读取行为的跳过标识
        message._skipHorae = true;
        message.extra = {
            ...(message.extra || {}),
            rollhelper_sanitized: true,
            skip_summary: true,
            skip_memory: true,
        };
    } catch (err) {
        console.warn("[RollHelper] sanitizeAssistantMessageForSummary caught an error", err);
    }

    return message;
}


/**
 * 功能：判断一个 JSON 片段是否像 RollHelper 的骰子事件数据。
 * @param body 原始 JSON 文本。
 * @returns 是否命中骰子事件特征。
 */
function isRollHelperDiceJsonEvent(body: string): boolean {
  return /"type"\s*:\s*"dice_events"/i.test(String(body ?? ""));
}

/**
 * 功能：判断一段尾部文本是否像被模型打断的裸骰子事件控制块。
 * @param body 原始尾部文本。
 * @returns 是否命中裸控制块特征。
 */
function isLikelyBareDiceEventArtifactEvent(body: string): boolean {
  const text = String(body ?? "");
  const markers = [
    /"type"\s*:\s*"dice_events"/i,
    /"version"\s*:\s*"1"/i,
    /"events"\s*:/i,
    /"id"\s*:/i,
    /"title"\s*:/i,
    /"checkDice"\s*:/i,
    /"difficulty"\s*:/i,
    /"desc"\s*:/i,
  ];
  const hits = markers.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
  return text.trim().startsWith("{") && hits >= 3;
}

/**
 * 功能：清理正文尾部裸露的骰子事件控制块。
 * @param raw 原始文本。
 * @returns 清理后的文本。
 */
function stripBareTailDiceEventArtifactEvent(raw: string): string {
  const text = String(raw ?? "");
  const matches = Array.from(text.matchAll(/"type"\s*:\s*"dice_events"/gi));
  if (matches.length <= 0) return text;

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const anchorIndex = Number(matches[index].index);
    if (!Number.isFinite(anchorIndex) || anchorIndex < 0) continue;
    const start = text.lastIndexOf("{", anchorIndex);
    if (start < 0) continue;
    const tail = text.slice(start);
    if (!isLikelyBareDiceEventArtifactEvent(tail)) continue;
    return `${text.slice(0, start).trimEnd()} `;
  }

  return text;
}

/**
 * 功能：移除 MVU 在运行期追加到正文尾部的变量更新控制块。
 * @param raw 原始文本。
 * @returns 清理后的文本。
 */
export function stripMvuUpdateVariableArtifactsEvent(raw: string): string {
  return String(raw ?? "")
    .replace(/```(?:[A-Za-z0-9_-]+)?\s*<UpdateVariable\b[\s\S]*?<\/UpdateVariable>\s*```/gi, " ")
    .replace(/<UpdateVariable\b[^>]*>[\s\S]*?<\/UpdateVariable>/gi, " ")
    .replace(/<UpdateVariable\s*\/?>/gi, " ");
}

/**
 * 功能：移除 RollHelper 在助手消息里追加、随后又异步删掉的 rolljson / dice_events 控制块。
 * @param raw 原始文本。
 * @returns 清理后的文本。
 */
export function stripRollHelperArtifactsEvent(raw: string): string {
  const stripFencedRollJson = (value: string): string => {
    const lines = String(value ?? "").split("\n");
    const keptLines: string[] = [];
    let inRollJsonBlock = false;
    let inJsonBlock = false;
    let jsonBuffer: string[] = [];

    const flushJsonBlock = (): void => {
      const blockContent = jsonBuffer.join("\n");
      if (!isRollHelperDiceJsonEvent(blockContent)) {
        keptLines.push("```json");
        keptLines.push(...jsonBuffer);
        keptLines.push("```");
      }
      jsonBuffer = [];
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!inRollJsonBlock && !inJsonBlock) {
        if (trimmed.startsWith("```rolljson")) {
          inRollJsonBlock = true;
          continue;
        }
        if (trimmed.startsWith("```json")) {
          inJsonBlock = true;
          jsonBuffer = [];
          continue;
        }
        keptLines.push(line);
        continue;
      }

      if (inRollJsonBlock) {
        if (trimmed === "```") {
          inRollJsonBlock = false;
        }
        continue;
      }

      if (trimmed === "```") {
        inJsonBlock = false;
        flushJsonBlock();
      } else {
        jsonBuffer.push(line);
      }
    }

    if (inJsonBlock && jsonBuffer.length > 0) {
      flushJsonBlock();
    }

    return keptLines.join("\n");
  };

  return stripBareTailDiceEventArtifactEvent(stripFencedRollJson(String(raw ?? "")))
    .replace(/<pre[^>]*>[\s\S]*?"type"\s*:\s*"dice_events"[\s\S]*?<\/pre>/gi, " ")
    .replace(/<!--\s*ROLLHELPER_INTERNAL_START\s*-->[\s\S]*?<!--\s*ROLLHELPER_INTERNAL_END\s*-->/gi, " ")
    .replace(/<!--\s*ROLLHELPER_SUMMARY_START\s*-->[\s\S]*?<!--\s*ROLLHELPER_SUMMARY_END\s*-->/gi, " ");
}

/**
 * 功能：清理宿主/运行时注入到消息文本中的临时控制块和占位节点，避免污染正文。
 * @param raw 原始文本。
 * @returns 清理后的文本。
 */
export function stripRuntimePlaceholderArtifactsEvent(raw: string): string {
  return stripRollHelperArtifactsEvent(stripMvuUpdateVariableArtifactsEvent(String(raw ?? "")))
    .replace(/<StatusPlaceHolderImpl\s*\/?>/gi, " ")
    .replace(/<StatusPlaceholderImpl\s*\/?>/gi, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 功能：判断一个 JSON 片段是否像 RollHelper 的骰子事件数据。
 * @param body 原始 JSON 文本。
 * @returns 是否命中骰子事件特征。
 */
function isRollHelperDiceJsonEvent(body: string): boolean {
  return /"type"\s*:\s*"dice_events"/i.test(String(body ?? ""));
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

  return stripFencedRollJson(String(raw ?? ""))
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
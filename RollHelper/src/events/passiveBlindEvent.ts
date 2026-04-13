import {
  getSillyTavernContextEvent,
  listTavernActiveWorldbooksEvent,
  saveTavernWorldbookEntryEvent,
} from "../../../SDK/tavern";
import type {
  BlindGuidanceEvent,
  DicePluginSettingsEvent,
  EventResultGradeEvent,
  PassiveDiscoveryEvent,
} from "../types/eventDomainEvent";
import { simpleHashEvent } from "../core/utilsEvent";

const PASSIVE_TAG_REGEX_Event = /<!--\s*RH_PASSIVE\b([\s\S]*?)-->\s*([\s\S]*?)(?=(?:<!--\s*RH_PASSIVE\b)|$)/gi;

type PassiveRuleEvent = {
  discoveryId: string;
  bookName: string;
  entryId: string;
  title: string;
  type: string;
  dc: number;
  priority: number;
  scope: "once" | "persistent";
  content: string;
};

function normalizeTextEvent(value: unknown): string {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim();
}

function normalizeInlineTextEvent(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseHeaderLinesEvent(headerText: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = normalizeTextEvent(headerText)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    const match = /^([a-zA-Z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (!match) continue;
    result[match[1].trim().toLowerCase()] = match[2].trim();
  }
  return result;
}

function parseAliasesEvent(settings: DicePluginSettingsEvent): Record<string, string[]> {
  const defaults: Record<string, string[]> = {
    perception: ["察觉", "感知", "观察"],
    investigation: ["调查", "侦查", "搜索"],
    insight: ["洞察", "意志", "观察人心"],
  };
  const raw = String(settings.passiveSkillAliasesText ?? "").trim();
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return defaults;
    }
    const merged: Record<string, string[]> = { ...defaults };
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const normalizedKey = normalizeInlineTextEvent(key).toLowerCase();
      if (!normalizedKey) continue;
      const values = Array.isArray(value)
        ? value.map((item) => normalizeInlineTextEvent(item)).filter(Boolean)
        : String(value ?? "")
            .split(/[,\n|]/)
            .map((item) => normalizeInlineTextEvent(item))
            .filter(Boolean);
      if (values.length > 0) merged[normalizedKey] = values;
    }
    return merged;
  } catch {
    return defaults;
  }
}

export function resolvePassiveSkillNameMapEvent(settings: DicePluginSettingsEvent): Record<string, string> {
  const aliases = parseAliasesEvent(settings);
  const result: Record<string, string> = {};
  for (const [passiveType, skillAliases] of Object.entries(aliases)) {
    if (!Array.isArray(skillAliases) || skillAliases.length <= 0) continue;
    result[passiveType] = skillAliases[0];
  }
  return result;
}

export function resolvePassiveScoresEvent(
  settings: DicePluginSettingsEvent,
  resolveSkillModifierBySkillNameEvent: (skillName: string, settings?: DicePluginSettingsEvent) => number
): Record<string, { skillName: string; score: number }> {
  const result: Record<string, { skillName: string; score: number }> = {};
  const skillMap = resolvePassiveSkillNameMapEvent(settings);
  for (const [passiveType, skillName] of Object.entries(skillMap)) {
    result[passiveType] = {
      skillName,
      score: Number(settings.passiveFormulaBase || 0) + resolveSkillModifierBySkillNameEvent(skillName, settings),
    };
  }
  return result;
}

function getLoadedWorldbookEntriesEvent(): Array<{ bookName: string; entryId: string; rawEntry: unknown }> {
  const globalRef = globalThis as Record<string, unknown> & {
    SillyTavern?: Record<string, unknown>;
  };
  const context = getSillyTavernContextEvent() as Record<string, unknown> | null;
  const activeBooks = new Set(listTavernActiveWorldbooksEvent(64).map((item) => normalizeInlineTextEvent(item)));
  const sourceCandidates = [
    globalRef.world_info,
    globalRef.SillyTavern?.world_info,
    context?.world_info,
    context?.worldInfo,
    context?.worldInfoBooks,
  ];
  const results: Array<{ bookName: string; entryId: string; rawEntry: unknown }> = [];
  for (const source of sourceCandidates) {
    if (!source) continue;
    if (Array.isArray(source)) {
      for (const item of source) {
        if (!item || typeof item !== "object") continue;
        const record = item as Record<string, unknown>;
        const bookName = normalizeInlineTextEvent(record.name ?? record.title ?? record.id ?? record.book);
        const entries = record.entries && typeof record.entries === "object" ? record.entries as Record<string, unknown> : null;
        if (!bookName || !entries || (activeBooks.size > 0 && !activeBooks.has(bookName))) continue;
        for (const [entryId, rawEntry] of Object.entries(entries)) {
          results.push({ bookName, entryId, rawEntry });
        }
      }
      continue;
    }
    if (typeof source !== "object") continue;
    for (const [fallbackName, maybeBook] of Object.entries(source as Record<string, unknown>)) {
      if (!maybeBook || typeof maybeBook !== "object") continue;
      const record = maybeBook as Record<string, unknown>;
      const entries = record.entries && typeof record.entries === "object" ? record.entries as Record<string, unknown> : null;
      const bookName = normalizeInlineTextEvent(record.name ?? record.title ?? record.id ?? fallbackName);
      if (!bookName || !entries || (activeBooks.size > 0 && !activeBooks.has(bookName))) continue;
      for (const [entryId, rawEntry] of Object.entries(entries)) {
        results.push({ bookName, entryId, rawEntry });
      }
    }
  }
  return results;
}

function parsePassiveRulesFromEntryEvent(bookName: string, entryId: string, rawEntry: unknown): PassiveRuleEvent[] {
  if (!rawEntry || typeof rawEntry !== "object") return [];
  const source = rawEntry as Record<string, unknown>;
  const entryTitle = normalizeInlineTextEvent(source.comment ?? source.title ?? entryId) || entryId;
  const content = normalizeTextEvent(source.content);
  if (!content) return [];
  const matches = Array.from(content.matchAll(PASSIVE_TAG_REGEX_Event));
  return matches
    .map((match, index): PassiveRuleEvent | null => {
      const headers = parseHeaderLinesEvent(match[1] ?? "");
      const body = normalizeTextEvent(match[2] ?? "");
      if (!body) return null;
      const discoveryId = normalizeInlineTextEvent(headers.id) || `${bookName}:${entryId}:${index}`;
      return {
        discoveryId,
        bookName,
        entryId,
        title: entryTitle,
        type: normalizeInlineTextEvent(headers.type || "perception").toLowerCase(),
        dc: Math.max(0, Math.floor(Number(headers.dc) || 0)),
        priority: Number.isFinite(Number(headers.priority)) ? Math.floor(Number(headers.priority)) : 0,
        scope: headers.scope === "once" ? "once" : "persistent",
        content: body,
      };
    })
    .filter((item): item is PassiveRuleEvent => Boolean(item));
}

function collectPassiveRulesEvent(): PassiveRuleEvent[] {
  return getLoadedWorldbookEntriesEvent()
    .flatMap((item) => parsePassiveRulesFromEntryEvent(item.bookName, item.entryId, item.rawEntry))
    .sort((left, right) => {
      if (right.priority !== left.priority) return right.priority - left.priority;
      if (right.dc !== left.dc) return right.dc - left.dc;
      return left.discoveryId.localeCompare(right.discoveryId);
    });
}

export function buildPassiveContextHashEvent(
  settings: DicePluginSettingsEvent,
  userText: string,
  passiveScores: Record<string, { skillName: string; score: number }>,
  rules: PassiveRuleEvent[]
): string {
  return simpleHashEvent(
    JSON.stringify({
      passiveFormulaBase: settings.passiveFormulaBase,
      worldbookPassiveMode: settings.worldbookPassiveMode,
      userText: normalizeInlineTextEvent(userText),
      activeWorldbooks: listTavernActiveWorldbooksEvent(64).map((item) => normalizeInlineTextEvent(item)),
      passiveScores,
      rules: rules.map((item) => [item.discoveryId, item.type, item.dc, item.priority, item.scope]),
    })
  );
}

export function resolvePassiveDiscoveriesEvent(
  settings: DicePluginSettingsEvent,
  userText: string,
  passiveDiscoveriesCache: Record<string, PassiveDiscoveryEvent>,
  resolveSkillModifierBySkillNameEvent: (skillName: string, settings?: DicePluginSettingsEvent) => number
): { discoveries: PassiveDiscoveryEvent[]; contextHash: string } {
  const passiveScores = resolvePassiveScoresEvent(settings, resolveSkillModifierBySkillNameEvent);
  const rules = collectPassiveRulesEvent();
  const contextHash = buildPassiveContextHashEvent(settings, userText, passiveScores, rules);
  const discoveries = rules
    .map((rule): PassiveDiscoveryEvent | null => {
      const scoreInfo = passiveScores[rule.type];
      if (!scoreInfo || scoreInfo.score < rule.dc) return null;
      if (rule.scope === "once" && passiveDiscoveriesCache[rule.discoveryId]) return null;
      return {
        discoveryId: rule.discoveryId,
        bookName: rule.bookName,
        entryId: rule.entryId,
        title: rule.title,
        type: rule.type,
        skillName: scoreInfo.skillName,
        passiveScore: scoreInfo.score,
        dc: rule.dc,
        priority: rule.priority,
        scope: rule.scope,
        content: rule.content,
        matchedAt: Date.now(),
        source: "worldbook_passive",
      };
    })
    .filter((item): item is PassiveDiscoveryEvent => Boolean(item))
    .slice(0, 5);
  return { discoveries, contextHash };
}

function buildBlindInstructionEvent(item: BlindGuidanceEvent): string {
  const targetText = normalizeInlineTextEvent(item.targetLabel || "");
  const noteText = normalizeInlineTextEvent(item.note || "");
  const contextText = targetText ? `触发片段是「${targetText}」。` : "";
  const noteHint = noteText ? `附加说明：${noteText}。` : "";
  if (item.natState === "nat20") {
    return `玩家掷出了暗骰大成功。${contextText}${noteHint}必须安排极其有利、明确且戏剧化的正向结果，但不要透露点数。`;
  }
  if (item.natState === "nat1") {
    return `玩家掷出了暗骰大失败。${contextText}${noteHint}必须安排显著误判、风险或滑稽后果，但不要透露点数。`;
  }
  switch (item.resultGrade) {
    case "critical_success":
      return `这是一次暗骰大成功。${contextText}${noteHint}用强烈成功口吻推进剧情，但不要暴露检定值。`;
    case "critical_failure":
      return `这是一次暗骰大失败。${contextText}${noteHint}允许给出错误信息、危险误判或触发新的风险，但不要暴露检定值。`;
    case "success":
    case "partial_success":
      return `这是一次暗骰成功。${contextText}${noteHint}自然描述玩家获得的信息、收益或新优势，不要提及掷骰过程。`;
    default:
      return `这是一次暗骰失败。${contextText}${noteHint}可以提供错误线索、模糊判断、自信的误判或一无所获，并附带叙事代价，但不要提及掷骰过程。`;
  }
}

export function buildBlindGuidanceBlockEvent(queue: BlindGuidanceEvent[], startTag: string, endTag: string): string {
  if (!Array.isArray(queue) || queue.length <= 0) return "";
  const lines: string[] = [startTag, `v=1 count=${queue.length}`];
  for (const item of queue) {
    lines.push(
      `- event="${normalizeInlineTextEvent(item.eventTitle)}" skill="${normalizeInlineTextEvent(item.skill)}" expr="${normalizeInlineTextEvent(
        item.diceExpr
      )}" total=${item.total} success=${item.success === null ? "unknown" : item.success ? "1" : "0"} grade=${item.resultGrade} nat=${item.natState} target="${normalizeInlineTextEvent(
        item.targetLabel
      )}" sourceId="${normalizeInlineTextEvent(item.sourceId || "")}"`
    );
    lines.push(`  instruction: ${buildBlindInstructionEvent(item)}`);
  }
  lines.push(endTag);
  return lines.join("\n");
}

export function buildPassiveDiscoveryBlockEvent(
  discoveries: PassiveDiscoveryEvent[],
  startTag: string,
  endTag: string
): string {
  if (!Array.isArray(discoveries) || discoveries.length <= 0) return "";
  const lines: string[] = [startTag, `v=1 count=${discoveries.length}`];
  for (const item of discoveries) {
    lines.push(
      `- type=${item.type} skill="${normalizeInlineTextEvent(item.skillName)}" passive=${item.passiveScore} dc=${item.dc} id="${normalizeInlineTextEvent(
        item.discoveryId
      )}"`
    );
    lines.push(`  reveal: ${normalizeInlineTextEvent(item.content)}`);
    lines.push("  instruction: 这是被动检定自动发现的信息。请自然描写，不要提及系统、DC、被动检定或暗骰；如果其中有值得继续追查的线索，只能在最终剧情正文的关键短词上使用 rh-trigger，严禁写进 outcomes、事件 desc 或其他结构化字段。");
  }
  lines.push(endTag);
  return lines.join("\n");
}

export function resolveNatStateEvent(rolls: number[] | undefined, sides: number): "nat1" | "nat20" | "none" {
  if (!Array.isArray(rolls) || rolls.length <= 0) return "none";
  const first = Number(rolls[0] ?? 0);
  if (sides === 20 && first === 1) return "nat1";
  if (sides === 20 && first === 20) return "nat20";
  return "none";
}

export function normalizeBlindGuidanceEvent(input: {
  rollId: string;
  roundId?: string;
  eventId?: string;
  eventTitle: string;
  skill: string;
  diceExpr: string;
  total: number;
  success: boolean | null;
  resultGrade: EventResultGradeEvent | undefined;
  natState: "nat1" | "nat20" | "none";
  targetLabel?: string;
  rolledAt: number;
  source: BlindGuidanceEvent["source"];
  sourceAssistantMsgId?: string;
  sourceFloorKey?: string;
  origin?: BlindGuidanceEvent["origin"];
  sourceId?: string;
  note?: string;
  createdAt?: number;
  expiresAt?: number | null;
  consumed?: boolean;
  consumedAt?: number;
  invalidatedAt?: number;
  archivedAt?: number;
  state?: BlindGuidanceEvent["state"];
  dedupeKey?: string;
}): BlindGuidanceEvent {
  return {
    rollId: input.rollId,
    roundId: input.roundId,
    eventId: String(input.eventId ?? input.rollId),
    eventTitle: input.eventTitle,
    skill: input.skill,
    diceExpr: input.diceExpr,
    total: input.total,
    success: input.success,
    resultGrade: input.resultGrade ?? "failure",
    natState: input.natState,
    targetLabel: String(input.targetLabel ?? ""),
    rolledAt: input.rolledAt,
    source: input.source,
    sourceAssistantMsgId: input.sourceAssistantMsgId,
    sourceFloorKey: input.sourceFloorKey,
    origin: input.origin,
    sourceId: input.sourceId,
    note: input.note,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
    consumed: input.consumed === true,
    consumedAt: input.consumedAt,
    invalidatedAt: input.invalidatedAt,
    archivedAt: input.archivedAt,
    state: input.state,
    dedupeKey: input.dedupeKey,
  };
}

export function buildPassiveWorldbookTemplateEvent(): string {
  return [
    "【场景标题】废弃钟楼二层",
    "",
    "【触发关键词】钟楼, 废墟, 木梯, 灰尘, 破窗",
    "",
    "【正文示例】",
    "二层地板被风雨泡得发黑，踩上去会发出细碎的呻吟。东侧破窗不断灌进冷风，把垂落的麻绳吹得轻轻摇晃。房间中央散着几只翻倒的木箱，墙角堆着旧祭器和早已干裂的布幔。",
    "",
    "<!-- RH_PASSIVE",
    "type=perception",
    "dc=15",
    "id=belltower_ceiling_spider",
    "priority=80",
    "scope=once",
    "-->",
    "抬头时，角色注意到天花板横梁上倒吊着一只巨大的灰背蜘蛛，它正停在木箱正上方，一动不动地等待猎物靠近。",
    "",
    "靠近木箱后，灰尘中能看到一些不太自然的拖拽痕迹，像是最近有什么东西被搬动过。",
    "",
    "<!-- RH_PASSIVE",
    "type=investigation",
    "dc=13",
    "id=belltower_false_bottom",
    "priority=60",
    "scope=persistent",
    "-->",
    "角色检查木箱细节时，发现最下面那只箱子的底板厚度异常，内部很可能藏着一个夹层。",
    "",
    "西侧墙面残留着褪色壁画，只能勉强辨认出一位捧钟祈祷的修士。",
    "",
    "<!-- RH_PASSIVE",
    "type=insight",
    "dc=14",
    "id=belltower_lurker_intent",
    "priority=50",
    "scope=once",
    "-->",
    "角色隐约感觉这里并不只是年久失修那么简单。现场的凌乱不像自然坍塌，更像有人刻意翻找过某样重要物件，而且行动者离开得很匆忙。",
    "",
    "【作者提示】",
    "1. 把上面的整段内容当作一个完整世界书条目即可，不需要把 RH_PASSIVE 单独拆出去。",
    "2. `type` 目前支持 perception / investigation / insight。",
    "3. `dc` 是被动检定门槛，`id` 用于去重，`priority` 越高越优先注入，`scope` 可选 once 或 persistent。",
    "4. RH_PASSIVE 后面的正文就是命中后提供给 AI 的隐藏信息；未命中时这段信息不会注入。",
    '5. 如果命中后的信息里有值得继续点击或调查的词，AI 下一轮只能把它写在剧情正文的关键位置，例如 <rh-trigger action="调查" skill="调查">词语</rh-trigger>；不要把 rh-trigger 放进 outcomes、事件 desc 或任何结构化字段。',
  ].join("\n");
}

export async function createPassiveTemplateWorldbookEntryEvent(bookName: string): Promise<boolean> {
  const normalizedBookName = normalizeInlineTextEvent(bookName);
  if (!normalizedBookName) return false;
  return saveTavernWorldbookEntryEvent(normalizedBookName, {
    uid: `rh_passive_${Date.now()}`,
    key: ["RH_PASSIVE", "被动检定示例"],
    keysecondary: [],
    comment: "RollHelper 被动检定示例",
    content: buildPassiveWorldbookTemplateEvent(),
  } as never);
}

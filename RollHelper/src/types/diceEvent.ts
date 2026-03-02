export interface DiceResult {
  expr: string;
  count: number;
  sides: number;
  modifier: number;
  rolls: number[];
  rawTotal: number;
  total: number;
  keepMode?: "kh" | "kl";
  keepCount?: number;
  keptRolls?: number[];
  droppedRolls?: number[];
  selectionMode?: "keep_highest" | "keep_lowest" | "none";
  exploding?: boolean;
  explosionTriggered?: boolean;
}

export interface DiceOptions {
  adv?: boolean;
  dis?: boolean;
  explode?: boolean;
  rule?: string;
}

export interface DiceMeta {
  last?: DiceResult;
  lastTotal?: number;
}

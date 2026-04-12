import DiceBox from "../vendor/dice-box/index.js";

export type DicePhysicsState = {
  id: number | string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
};

export type DiceRollDescriptor = {
  id?: number | string;
  dieType?: string;
  value?: number;
};

export type DiceTransformPayload = {
  position?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number; w: number };
  scaleMultiplier?: number;
  wake?: boolean;
};

export type CompositePairRole = "single" | "tens" | "ones";

export type FocusedDieInfo = {
  id: number | string;
  dieType: string | null;
  value: number | null;
  groupKey: string;
  groupOrder: number;
  pairRole: CompositePairRole;
  logicalResultValue: number | null;
};

export type FocusedDieRuntimeState = {
  id: number | string;
  dieType: string | null;
  value: number | null;
  groupKey: string;
  groupOrder: number;
  pairRole: CompositePairRole;
  logicalResultValue: number | null;
  state: DicePhysicsState;
};

export type DiceBoxInstance = InstanceType<typeof DiceBox>;

export const DEFAULT_DICE_FOCUS_SPACING_X = 1.9;
export const DEFAULT_DICE_FOCUS_SPACING_Y = 1.55;
export const DEFAULT_DICE_FOCUS_MAX_PER_ROW = 5;
export const DEFAULT_DICE_FOCUS_POSITION = {
  x: 0,
  y: 0.9,
  z: 0,
} as const;
export const DEFAULT_DICE_FOCUS_SCALE_MULTIPLIER = 1.34;
export const DEFAULT_DICE_FOCUS_MOVE_DURATION_MS = 560;
export const DEFAULT_D100_PARTNER_ID_OFFSET = 10_000;
export const DEFAULT_COMPOSITE_GROUP_PAIR_SPACING_X = 1.46;
export const DEFAULT_COMPOSITE_GROUP_SPACING_X = 3.05;
export const DEFAULT_COMPOSITE_GROUP_SPACING_Y = 1.72;
export const DEFAULT_COMPOSITE_GROUP_PAIR_DEPTH_OFFSET = 0.12;
export const DEFAULT_COMPOSITE_PRIMARY_DIE_SCALE_RATIO = 1;
export const DEFAULT_COMPOSITE_SECONDARY_DIE_SCALE_RATIO = 0.8;

/**
 * 功能：等待下一帧，便于逐帧驱动聚焦动画。
 * @returns 下一帧时间戳。
 */
export function nextFrameEvent(): Promise<number> {
  return new Promise((resolve) => {
    requestAnimationFrame(resolve);
  });
}

/**
 * 功能：对两个数字执行线性插值。
 * @param start 起始值。
 * @param end 结束值。
 * @param progress 插值进度。
 * @returns 插值后的数值。
 */
export function lerpEvent(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

/**
 * 功能：提供更自然的缓出曲线。
 * @param progress 原始线性进度。
 * @returns 缓动后的进度。
 */
export function easeOutCubicEvent(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

/**
 * 功能：归一化四元数，避免插值时出现畸变。
 * @param quaternion 原始四元数。
 * @returns 归一化后的四元数。
 */
export function normalizeQuaternionEvent(quaternion: DicePhysicsState["rotation"]): DicePhysicsState["rotation"] {
  const length = Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w) || 1;
  return {
    x: quaternion.x / length,
    y: quaternion.y / length,
    z: quaternion.z / length,
    w: quaternion.w / length,
  };
}

/**
 * 功能：对两个四元数执行球面线性插值。
 * @param start 起始四元数。
 * @param end 结束四元数。
 * @param progress 插值进度。
 * @returns 插值后的四元数。
 */
export function slerpQuaternionEvent(
  start: DicePhysicsState["rotation"],
  end: DicePhysicsState["rotation"],
  progress: number,
): DicePhysicsState["rotation"] {
  let from = normalizeQuaternionEvent(start);
  let to = normalizeQuaternionEvent(end);
  let dot = from.x * to.x + from.y * to.y + from.z * to.z + from.w * to.w;

  if (dot < 0) {
    dot = -dot;
    to = {
      x: -to.x,
      y: -to.y,
      z: -to.z,
      w: -to.w,
    };
  }

  if (dot > 0.9995) {
    return normalizeQuaternionEvent({
      x: lerpEvent(from.x, to.x, progress),
      y: lerpEvent(from.y, to.y, progress),
      z: lerpEvent(from.z, to.z, progress),
      w: lerpEvent(from.w, to.w, progress),
    });
  }

  const theta0 = Math.acos(Math.min(Math.max(dot, -1), 1));
  const theta = theta0 * progress;
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(theta0);
  const s0 = Math.cos(theta) - dot * sinTheta / sinTheta0;
  const s1 = sinTheta / sinTheta0;

  return {
    x: s0 * from.x + s1 * to.x,
    y: s0 * from.y + s1 * to.y,
    z: s0 * from.z + s1 * to.z,
    w: s0 * from.w + s1 * to.w,
  };
}

/**
 * 功能：读取当前这一轮所有可用于聚焦的骰子元数据。
 * @param box 骰子盒实例。
 * @returns 当前轮次的骰子聚焦信息列表。
 */
export function resolveFocusedDiceEvent(box: DiceBoxInstance): FocusedDieInfo[] {
  const rollDiceData = (box as unknown as { rollDiceData?: Record<string, DiceRollDescriptor> }).rollDiceData ?? {};
  const getDieData = (targetId: number | string) => (box as unknown as {
    getDieData?: (id: number | string) => { value?: number | null } | null;
  }).getDieData?.(targetId) ?? null;
  const focusedDice: FocusedDieInfo[] = [];

  Object.values(rollDiceData)
    .filter((die): die is DiceRollDescriptor & { id: number | string } => die?.id !== undefined && die?.id !== null)
    .forEach((die, index) => {
      const dieType = die.dieType ?? null;
      const value = typeof die.value === "number" ? die.value : null;

      if (dieType !== "d100") {
        focusedDice.push({
          id: die.id,
          dieType,
          value,
          groupKey: `single-${String(die.id)}`,
          groupOrder: index,
          pairRole: "single" as const,
          logicalResultValue: value,
        } satisfies FocusedDieInfo);
        return;
      }

      const logicalResultValue = value;
      const partnerId = getD100PartnerDieIdEvent(die.id);
      const partnerValue = getDieData(partnerId)?.value;

      focusedDice.push({
        id: die.id,
        dieType: "d100",
        value: normalizeD100TensValueEvent(value),
        groupKey: `d100-${String(die.id)}`,
        groupOrder: index,
        pairRole: "tens" as const,
        logicalResultValue,
      } satisfies FocusedDieInfo);
      focusedDice.push({
        id: partnerId,
        dieType: "d10",
        value: typeof partnerValue === "number" ? partnerValue : 10,
        groupKey: `d100-${String(die.id)}`,
        groupOrder: index,
        pairRole: "ones" as const,
        logicalResultValue,
      } satisfies FocusedDieInfo);
    });

  return focusedDice;
}

/**
 * 功能：读取指定骰子的当前物理状态。
 * @param box 骰子盒实例。
 * @param dieId 骰子标识。
 * @returns 当前骰子状态；读取失败时返回空值。
 */
export async function getDieStateEvent(
  box: DiceBoxInstance,
  dieId: number | string,
): Promise<DicePhysicsState | null> {
  return (box as unknown as {
    getDieState: (targetId: number | string) => Promise<DicePhysicsState | null>;
  }).getDieState(dieId);
}

/**
 * 功能：把当前聚焦骰子列表转换成包含物理状态的运行时列表。
 * @param box 骰子盒实例。
 * @param dice 当前聚焦骰子元数据。
 * @returns 可直接用于聚焦动画的骰子列表。
 */
export async function resolveFocusedDiceRuntimeStatesEvent(
  box: DiceBoxInstance,
  dice: FocusedDieInfo[],
): Promise<FocusedDieRuntimeState[]> {
  const runtimeStates = await Promise.all(
    dice.map(async (die) => {
      const state = await getDieStateEvent(box, die.id);
      if (!state) {
        return null;
      }
      return {
        ...die,
        id: die.id,
        dieType: die.dieType,
        value: die.value,
        state,
      } satisfies FocusedDieRuntimeState;
    }),
  );

  return runtimeStates.filter((entry): entry is FocusedDieRuntimeState => Boolean(entry));
}

/**
 * 功能：计算多颗骰子在聚焦阶段的横向排列偏移。
 * @param count 骰子数量。
 * @param spacingX 骰子之间的横向间距。
 * @returns 每颗骰子的横向偏移数组。
 */
export function buildFocusOffsetsEvent(count: number, spacingX: number = DEFAULT_DICE_FOCUS_SPACING_X): number[] {
  if (count <= 1) {
    return [0];
  }

  const startX = -((count - 1) * spacingX) / 2;
  return Array.from({ length: count }, (_value, index) => startX + index * spacingX);
}

type FocusGridPosition = {
  x: number;
  y: number;
  z: number;
};

type FocusDieGroup = {
  key: string;
  order: number;
  members: FocusedDieRuntimeState[];
};

/**
 * 功能：根据骰子数量生成居中网格布局，超过单行上限时自动换行。
 * @param count 骰子数量。
 * @param spacingX 横向间距。
 * @param spacingY 纵向间距。
 * @param maxPerRow 单行最多显示数量。
 * @returns 每颗骰子在聚焦阶段的平面偏移位置。
 */
export function buildFocusGridPositionsEvent(
  count: number,
  spacingX: number = DEFAULT_DICE_FOCUS_SPACING_X,
  spacingY: number = DEFAULT_DICE_FOCUS_SPACING_Y,
  maxPerRow: number = DEFAULT_DICE_FOCUS_MAX_PER_ROW,
): FocusGridPosition[] {
  if (count <= 0) {
    return [];
  }

  const rowCount = Math.ceil(count / Math.max(1, maxPerRow));
  const rows = Array.from({ length: rowCount }, (_unused, rowIndex) => {
    const start = rowIndex * maxPerRow;
    const rowSize = Math.min(maxPerRow, count - start);
    const rowStartX = -((rowSize - 1) * spacingX) / 2;
    const rowCenterOffsetZ = ((rowCount - 1) * spacingY) / 2 - rowIndex * spacingY;
    return Array.from({ length: rowSize }, (_unused2, itemIndex) => ({
      x: rowStartX + itemIndex * spacingX,
      y: 0,
      z: rowCenterOffsetZ,
    }));
  });

  return rows.flat();
}

/**
 * 功能：根据骰子数量计算聚焦缩放倍率，避免多骰重叠。
 * @param count 骰子数量。
 * @param baseScaleMultiplier 单骰基础缩放倍率。
 * @returns 当前聚焦阶段应使用的缩放倍率。
 */
export function getFocusScaleMultiplierEvent(
  count: number,
  baseScaleMultiplier: number = DEFAULT_DICE_FOCUS_SCALE_MULTIPLIER,
): number {
  if (count <= 1) {
    return baseScaleMultiplier;
  }

  return baseScaleMultiplier * Math.max(0.72, 1 - (count - 1) * 0.08);
}

/**
 * 功能：根据骰子编号推导 D100 伙伴骰编号。
 * @param dieId D100 主骰编号。
 * @returns 伙伴 d10 的编号。
 */
export function getD100PartnerDieIdEvent(dieId: number | string): number | string {
  if (typeof dieId === "number") {
    return dieId + DEFAULT_D100_PARTNER_ID_OFFSET;
  }

  const numericDieId = Number(dieId);
  if (Number.isFinite(numericDieId)) {
    return numericDieId + DEFAULT_D100_PARTNER_ID_OFFSET;
  }

  return `${String(dieId)}${DEFAULT_D100_PARTNER_ID_OFFSET}`;
}

/**
 * 功能：把 D100 结果归一化为十位骰展示值。
 * @param value D100 逻辑总值。
 * @returns 十位骰应使用的结果值。
 */
export function normalizeD100TensValueEvent(value: number | null): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value === 100) {
    return 0;
  }

  return Math.max(0, Math.min(90, Math.floor(value / 10) * 10));
}

/**
 * 功能：返回复合骰中的缩放比例。
 * @param pairRole 当前骰子在分组中的角色。
 * @returns 该角色的缩放倍率。
 */
export function getCompositeDieScaleRatioEvent(pairRole: CompositePairRole): number {
  return pairRole === "ones"
    ? DEFAULT_COMPOSITE_SECONDARY_DIE_SCALE_RATIO
    : DEFAULT_COMPOSITE_PRIMARY_DIE_SCALE_RATIO;
}

/**
 * 功能：返回复合骰在纵向上的错位偏移。
 * @param pairRole 当前骰子在分组中的角色。
 * @returns 纵向偏移量。
 */
export function getCompositeDieDepthOffsetEvent(pairRole: CompositePairRole): number {
  return pairRole === "ones"
    ? DEFAULT_COMPOSITE_GROUP_PAIR_DEPTH_OFFSET
    : -DEFAULT_COMPOSITE_GROUP_PAIR_DEPTH_OFFSET;
}

/**
 * 功能：把骰子按复合分组整理并稳定排序。
 * @param dice 已带物理状态的骰子列表。
 * @returns 分组后的骰子列表。
 */
export function getDiceGroupsEvent(dice: FocusedDieRuntimeState[]): FocusDieGroup[] {
  const groups = new Map<string, FocusDieGroup>();

  dice.forEach((die) => {
    const currentGroup = groups.get(die.groupKey) ?? {
      key: die.groupKey,
      order: die.groupOrder,
      members: [],
    };
    currentGroup.members.push(die);
    groups.set(die.groupKey, currentGroup);
  });

  const roleOrder: Record<CompositePairRole, number> = {
    single: 0,
    tens: 0,
    ones: 1,
  };

  return [...groups.values()]
    .sort((left, right) => left.order - right.order)
    .map((group) => ({
      ...group,
      members: [...group.members].sort((left, right) => roleOrder[left.pairRole] - roleOrder[right.pairRole]),
    }));
}

/**
 * 功能：判断当前聚焦列表中是否包含复合骰分组。
 * @param dice 已带物理状态的骰子列表。
 * @returns 是否存在多成员分组。
 */
export function hasCompositeDiceGroupsEvent(dice: FocusedDieRuntimeState[]): boolean {
  return getDiceGroupsEvent(dice).some((group) => group.members.length > 1);
}

type AnimateDiceFocusLayoutOptions = {
  box: DiceBoxInstance;
  dice: FocusedDieRuntimeState[];
  focusPosition?: { x: number; y: number; z: number };
  spacingX?: number;
  spacingY?: number;
  maxPerRow?: number;
  baseScaleMultiplier?: number;
  durationMs?: number;
};

/**
 * 功能：使用 RollHelper 统一的聚焦规则，把多颗骰子居中并逐个应用展示层矫正。
 * @param options 聚焦动画所需参数。
 * @returns 动画完成后的 Promise。
 */
export async function animateDiceFocusLayoutEvent(options: AnimateDiceFocusLayoutOptions): Promise<void> {
  const {
    box,
    dice,
    focusPosition = DEFAULT_DICE_FOCUS_POSITION,
    spacingX = 1.9,
    spacingY = DEFAULT_DICE_FOCUS_SPACING_Y,
    maxPerRow = DEFAULT_DICE_FOCUS_MAX_PER_ROW,
    baseScaleMultiplier = DEFAULT_DICE_FOCUS_SCALE_MULTIPLIER,
    durationMs = DEFAULT_DICE_FOCUS_MOVE_DURATION_MS,
  } = options;

  if (!dice.length) {
    return;
  }

  const setDieVisualTransform = (id: number | string, transform: DiceTransformPayload): void => {
    (box as unknown as {
      setDieVisualTransform: (targetId: number | string, payload: DiceTransformPayload) => void;
    }).setDieVisualTransform(id, transform);
  };
  const getDieFocusRotation = (
    id: number | string,
    dieType: string | null,
    resultValue: number | null,
  ): DicePhysicsState["rotation"] | null =>
    (box as unknown as {
      getDieFocusRotation: (
        targetId: number | string,
        focusOptions?: { dieType?: string | null; resultValue?: number | null },
      ) => DicePhysicsState["rotation"] | null;
    }).getDieFocusRotation(id, {
      dieType,
      resultValue,
    });

  const focusScaleMultiplier = getFocusScaleMultiplierEvent(dice.length, baseScaleMultiplier);
  const focusTargets = hasCompositeDiceGroupsEvent(dice)
    ? (() => {
      const groups = getDiceGroupsEvent(dice);
      const groupOffsets = buildFocusGridPositionsEvent(
        groups.length,
        DEFAULT_COMPOSITE_GROUP_SPACING_X,
        DEFAULT_COMPOSITE_GROUP_SPACING_Y,
        maxPerRow,
      );

      return groups.flatMap((group, groupIndex) => {
        const baseOffset = groupOffsets[groupIndex] ?? { x: 0, y: 0, z: 0 };
        const startX = -((group.members.length - 1) * DEFAULT_COMPOSITE_GROUP_PAIR_SPACING_X) / 2;
        return group.members.map((entry, memberIndex) => ({
          ...entry,
          targetPosition: {
            x: focusPosition.x + baseOffset.x + startX + memberIndex * DEFAULT_COMPOSITE_GROUP_PAIR_SPACING_X,
            y: focusPosition.y + baseOffset.y + getCompositeDieDepthOffsetEvent(entry.pairRole),
            z: focusPosition.z + baseOffset.z,
          },
          targetRotation: getDieFocusRotation(entry.id, entry.dieType, entry.value) ?? entry.state.rotation,
          targetScaleMultiplier: focusScaleMultiplier * getCompositeDieScaleRatioEvent(entry.pairRole),
        }));
      });
    })()
    : (() => {
      const sortedDice = [...dice].sort((left, right) => left.state.position.x - right.state.position.x);
      const focusOffsets = buildFocusGridPositionsEvent(sortedDice.length, spacingX, spacingY, maxPerRow);
      return sortedDice.map((entry, index) => ({
        ...entry,
        targetPosition: {
          x: focusPosition.x + (focusOffsets[index]?.x ?? 0),
          y: focusPosition.y + (focusOffsets[index]?.y ?? 0),
          z: focusPosition.z + (focusOffsets[index]?.z ?? 0),
        },
        targetRotation: getDieFocusRotation(entry.id, entry.dieType, entry.value) ?? entry.state.rotation,
        targetScaleMultiplier: focusScaleMultiplier,
      }));
    })();

  const focusAnimationStartedAt = performance.now();
  let currentFrameAt = focusAnimationStartedAt;

  while (currentFrameAt - focusAnimationStartedAt < durationMs) {
    const rawProgress = Math.min(1, (currentFrameAt - focusAnimationStartedAt) / durationMs);
    const easedProgress = easeOutCubicEvent(rawProgress);

    focusTargets.forEach((entry) => {
      setDieVisualTransform(entry.id, {
        position: {
          x: lerpEvent(entry.state.position.x, entry.targetPosition.x, easedProgress),
          y: lerpEvent(entry.state.position.y, entry.targetPosition.y, easedProgress),
          z: lerpEvent(entry.state.position.z, entry.targetPosition.z, easedProgress),
        },
        rotation: slerpQuaternionEvent(entry.state.rotation, entry.targetRotation, easedProgress),
        scaleMultiplier: lerpEvent(1, entry.targetScaleMultiplier, easedProgress),
      });
    });

    currentFrameAt = await nextFrameEvent();
  }

  focusTargets.forEach((entry) => {
    setDieVisualTransform(entry.id, {
      position: entry.targetPosition,
      rotation: entry.targetRotation,
      scaleMultiplier: entry.targetScaleMultiplier,
    });
  });
}

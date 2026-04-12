import DiceBox from "../../src/vendor/dice-box/index.js";
import {
  DEFAULT_DICE_FOCUS_MOVE_DURATION_MS,
  DEFAULT_DICE_FOCUS_POSITION,
  DEFAULT_DICE_FOCUS_SCALE_MULTIPLIER,
  animateDiceFocusLayoutEvent,
  buildFocusGridPositionsEvent,
  easeOutCubicEvent,
  getDieStateEvent,
  getFocusScaleMultiplierEvent,
  lerpEvent,
  resolveFocusedDiceEvent,
  slerpQuaternionEvent,
  type DiceBoxInstance,
  type DicePhysicsState,
  type FocusedDieRuntimeState,
} from "../../src/core/diceFocusRuntime";
import {
  createFocusPoseConfig,
  formatDieResultLabel,
  getDiePoseEulerDeg,
  getDieResultOptions,
  getSupportedDieTypes,
  hasDiePoseConfig,
  normalizeDieResultValueKey,
  setDiePoseEulerDeg,
  stringifyFocusPoseConfig,
} from "../../src/vendor/dice-box/focusPoseConfig.js";
import {
  createQuaternionFromPoseEuler,
  quaternionToEulerDeg,
} from "../../src/vendor/dice-box/components/world.onscreen.js";
import { RotationGizmo } from "@babylonjs/core/Gizmos/rotationGizmo";
import { UtilityLayerRenderer } from "@babylonjs/core/Rendering/utilityLayerRenderer";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

type PoseEulerDeg = { x: number; y: number; z: number };
type StatusKind = "idle" | "success" | "error";
type FocusPoseConfig = ReturnType<typeof createFocusPoseConfig>;
type GizmoCoordinateSpace = "local" | "global";
type CompositePairRole = "single" | "tens" | "ones";
type CalibrationDieMeta = {
  id: number | string;
  dieType: string;
  value: number | null;
  groupKey: string;
  groupLabel: string;
  groupOrder: number;
  pairRole: CompositePairRole;
  logicalResultValue: number | null;
};
type CalibrationFocusedDieRuntimeState = FocusedDieRuntimeState & CalibrationDieMeta;
type CalibrationUndoSnapshot = {
  poseConfig: FocusPoseConfig;
  draftPoseConfig: FocusPoseConfig;
  selectedDieType: string;
  selectedResultValue: number;
  selectedPoseEulerDeg: PoseEulerDeg;
  isCurrentPoseSaved: boolean;
  selectedDieTypeForEdit: string | null;
  selectedDieResultValue: number | null;
};
type CalibrationState = {
  poseConfig: FocusPoseConfig;
  draftPoseConfig: FocusPoseConfig;
  selectedDieType: string;
  selectedResultValue: number;
  copySourceResultValue: number | null;
  rotationSnapDeg: number;
  gizmoCoordinateSpace: GizmoCoordinateSpace;
  currentDice: CalibrationFocusedDieRuntimeState[];
  currentRollValues: number[];
  currentActualDieId: number | string | null;
  currentActualResultValue: number | null;
  selectedDieId: number | string | null;
  selectedDieTypeForEdit: string | null;
  selectedDieResultValue: number | null;
  selectedPoseEulerDeg: PoseEulerDeg;
  isCurrentPoseSaved: boolean;
  testHistory: Array<{ formula: string; resultText: string }>;
  undoStack: CalibrationUndoSnapshot[];
};

type DirectDieDragState = {
  pointerId: number;
  dieId: number | string;
  startArcballVector: Vector3;
  startQuaternion: { x: number; y: number; z: number; w: number };
  hasDragged: boolean;
  pointerTarget: Element | null;
};

const STORAGE_KEY = "rollhelper.calibration.focus-pose-config.v1";
const POSE_PRECISION = 3;
const MAX_UNDO_STACK_SIZE = 80;
const FOCUS_SPACING_X = 1.85;
const FOCUS_SPACING_Y = 1.55;
const FOCUS_MAX_PER_ROW = 5;
const DIRECT_DIE_DRAG_MIN_DOT = 0.99995;
const COMPOSITE_GROUP_PAIR_SPACING_X = 1.18;
const COMPOSITE_GROUP_SPACING_X = 2.56;
const COMPOSITE_GROUP_SPACING_Y = 1.72;
const COMPOSITE_GROUP_PAIR_DEPTH_OFFSET = 0.12;
const COMPOSITE_PRIMARY_DIE_SCALE_RATIO = 1;
const COMPOSITE_SECONDARY_DIE_SCALE_RATIO = 0.8;
const D100_PARTNER_ID_OFFSET = 10_000;
const D100_GROUPED_TARGET_COUNT = 10;

const dieTypeSelect = document.getElementById("die-type-select") as HTMLSelectElement;
const resultGrid = document.getElementById("result-grid") as HTMLDivElement;
const rollTargetButton = document.getElementById("roll-target-btn") as HTMLButtonElement;
const testRollButton = document.getElementById("test-roll-btn") as HTMLButtonElement;
const replayFocusButton = document.getElementById("replay-focus-btn") as HTMLButtonElement;
const savePoseButton = document.getElementById("save-pose-btn") as HTMLButtonElement;
const resetPoseButton = document.getElementById("reset-pose-btn") as HTMLButtonElement;
const statusLine = document.getElementById("status-line") as HTMLDivElement;
const currentResultValueText = document.getElementById("current-result-value") as HTMLDivElement;
const currentResultText = document.getElementById("current-result-text") as HTMLDivElement;
const currentDieTypeText = document.getElementById("current-die-type") as HTMLDivElement;
const currentSelectedDieText = document.getElementById("current-selected-die") as HTMLDivElement;
const currentGroupSummaryText = document.getElementById("current-group-summary") as HTMLDivElement;
const currentPoseStatusText = document.getElementById("current-pose-status") as HTMLDivElement;
const statResult = document.getElementById("stat-result") as HTMLDivElement;
const statPoseStatus = document.getElementById("stat-pose-status") as HTMLDivElement;
const statSelectedDieValue = document.getElementById("stat-selected-die-value") as HTMLDivElement;
const statX = document.getElementById("stat-x") as HTMLDivElement;
const statY = document.getElementById("stat-y") as HTMLDivElement;
const statZ = document.getElementById("stat-z") as HTMLDivElement;
const statSaved = document.getElementById("stat-saved") as HTMLDivElement;
const applyConfigButton = document.getElementById("apply-config-btn") as HTMLButtonElement;
const copyJsonButton = document.getElementById("copy-json-btn") as HTMLButtonElement;
const downloadJsonButton = document.getElementById("download-json-btn") as HTMLButtonElement;
const configOutput = document.getElementById("config-output") as HTMLTextAreaElement;
const testFormulaInput = document.getElementById("test-formula-input") as HTMLInputElement;
const testResultMain = document.getElementById("test-result-main") as HTMLDivElement;
const testResultSub = document.getElementById("test-result-sub") as HTMLDivElement;
const testHistory = document.getElementById("test-history") as HTMLDivElement;
const eulerXInput = document.getElementById("euler-x") as HTMLInputElement;
const eulerYInput = document.getElementById("euler-y") as HTMLInputElement;
const eulerZInput = document.getElementById("euler-z") as HTMLInputElement;
const previewContainer = document.getElementById("dice-preview-container") as HTMLDivElement;
const copySourceResultSelect = document.getElementById("copy-source-result-select") as HTMLSelectElement;
const copySourcePoseButton = document.getElementById("copy-source-pose-btn") as HTMLButtonElement;
const rotationSnapSelect = document.getElementById("rotation-snap-select") as HTMLSelectElement;
const coordinateSpaceSelect = document.getElementById("coordinate-space-select") as HTMLSelectElement;

const initialDieType = getSupportedDieTypes()[0] ?? "d20";
const initialResultOptions = getDieResultOptions(initialDieType);
const initialSelectedResultValue = initialResultOptions[0] ?? 1;
const initialCopySourceResultValue = initialResultOptions.find((value) => value !== initialSelectedResultValue) ?? null;

const initialPoseConfig = loadStoredPoseConfigEvent();

const state: CalibrationState = {
  poseConfig: initialPoseConfig,
  draftPoseConfig: JSON.parse(stringifyFocusPoseConfig(initialPoseConfig)) as FocusPoseConfig,
  selectedDieType: initialDieType,
  selectedResultValue: initialSelectedResultValue,
  copySourceResultValue: initialCopySourceResultValue,
  rotationSnapDeg: Number(rotationSnapSelect.value || 10),
  gizmoCoordinateSpace: (coordinateSpaceSelect.value === "global" ? "global" : "local"),
  currentDice: [],
  currentRollValues: [],
  currentActualDieId: null,
  currentActualResultValue: null,
  selectedDieId: null,
  selectedDieTypeForEdit: null,
  selectedDieResultValue: null,
  selectedPoseEulerDeg: { x: 0, y: 0, z: 0 },
  isCurrentPoseSaved: true,
  testHistory: [],
  undoStack: [],
};

let calibratorDiceBox: DiceBoxInstance | null = null;
let utilityLayer: UtilityLayerRenderer | null = null;
let rotationGizmo: RotationGizmo | null = null;
let globalRotationProxyNode: TransformNode | null = null;
let directDieDragState: DirectDieDragState | null = null;
let hasBoundScenePicking = false;
let hasPendingEulerInputCheckpoint = false;

function clonePoseConfigEvent(config: FocusPoseConfig): FocusPoseConfig {
  return JSON.parse(stringifyFocusPoseConfig(config)) as FocusPoseConfig;
}

function createUndoSnapshotEvent(): CalibrationUndoSnapshot {
  return {
    poseConfig: clonePoseConfigEvent(state.poseConfig),
    draftPoseConfig: clonePoseConfigEvent(state.draftPoseConfig),
    selectedDieType: state.selectedDieType,
    selectedResultValue: state.selectedResultValue,
    selectedPoseEulerDeg: sanitizePoseEulerEvent(state.selectedPoseEulerDeg),
    isCurrentPoseSaved: state.isCurrentPoseSaved,
    selectedDieTypeForEdit: state.selectedDieTypeForEdit,
    selectedDieResultValue: state.selectedDieResultValue,
  };
}

function pushUndoSnapshotEvent(): void {
  state.undoStack.push(createUndoSnapshotEvent());
  if (state.undoStack.length > MAX_UNDO_STACK_SIZE) {
    state.undoStack.splice(0, state.undoStack.length - MAX_UNDO_STACK_SIZE);
  }
}

function renderCalibrationSceneEvent(): void {
  if (!calibratorDiceBox) {
    return;
  }

  const scene = (calibratorDiceBox as unknown as {
    getScene: () => { render?: () => void } | null;
  }).getScene();

  scene?.render?.();
}

function getRotationSnapRadEvent(): number {
  return state.rotationSnapDeg * Math.PI / 180;
}

function applyRotationSnapEvent(): void {
  const stepValue = String(state.rotationSnapDeg || 1);
  eulerXInput.step = stepValue;
  eulerYInput.step = stepValue;
  eulerZInput.step = stepValue;

  if (rotationGizmo) {
    rotationGizmo.snapDistance = getRotationSnapRadEvent();
  }
}

function getSelectedDieMeshEvent(): {
  position?: { x: number; y: number; z: number; set?: (x: number, y: number, z: number) => void };
  absolutePosition?: { x: number; y: number; z: number };
  rotationQuaternion?: { x: number; y: number; z: number; w: number } | null;
  rotation?: { x: number; y: number; z: number };
  getWorldMatrix?: () => { getRow?: (index: number) => { toVector3?: () => { x: number; y: number; z: number } } | null };
} | null {
  if (!calibratorDiceBox || state.selectedDieId == null) {
    return null;
  }

  return (calibratorDiceBox as unknown as {
    getDieMesh: (id: number | string) => unknown | null;
  }).getDieMesh(state.selectedDieId) as {
    position?: { x: number; y: number; z: number; set?: (x: number, y: number, z: number) => void };
    absolutePosition?: { x: number; y: number; z: number };
    rotationQuaternion?: { x: number; y: number; z: number; w: number } | null;
    rotation?: { x: number; y: number; z: number };
    getWorldMatrix?: () => { getRow?: (index: number) => { toVector3?: () => { x: number; y: number; z: number } } | null };
  } | null;
}

function ensureGlobalRotationProxyEvent(): TransformNode | null {
  if (globalRotationProxyNode) {
    return globalRotationProxyNode;
  }

  if (!calibratorDiceBox) {
    return null;
  }

  const scene = (calibratorDiceBox as unknown as {
    getScene: () => unknown | null;
  }).getScene();

  if (!scene) {
    return null;
  }

  globalRotationProxyNode = new TransformNode("calibration-global-rotation-proxy", scene as never);
  globalRotationProxyNode.rotationQuaternion = Quaternion.Identity();
  globalRotationProxyNode.setEnabled(false);
  return globalRotationProxyNode;
}

function resetGlobalRotationProxyRotationEvent(): void {
  const proxy = ensureGlobalRotationProxyEvent();
  if (!proxy) {
    return;
  }

  if (!proxy.rotationQuaternion) {
    proxy.rotationQuaternion = Quaternion.Identity();
    return;
  }

  proxy.rotationQuaternion.set(0, 0, 0, 1);
}

function syncGlobalRotationProxyFromMeshEvent(mesh = getSelectedDieMeshEvent()): void {
  const proxy = ensureGlobalRotationProxyEvent();
  if (!proxy || !mesh) {
    return;
  }

  const worldPosition = mesh.getWorldMatrix?.().getRow?.(3)?.toVector3?.()
    ?? mesh.absolutePosition
    ?? mesh.position
    ?? null;

  if (worldPosition) {
    proxy.position.set(worldPosition.x, worldPosition.y, worldPosition.z);
  }

  resetGlobalRotationProxyRotationEvent();
  proxy.setEnabled(true);
}

function isIdentityQuaternionEvent(quaternion: { x: number; y: number; z: number; w: number }): boolean {
  return Math.abs(quaternion.x) <= 0.000001
    && Math.abs(quaternion.y) <= 0.000001
    && Math.abs(quaternion.z) <= 0.000001
    && Math.abs(quaternion.w - 1) <= 0.000001;
}

function applyGlobalRotationProxyDeltaEvent(): boolean {
  const proxy = ensureGlobalRotationProxyEvent();
  const mesh = getSelectedDieMeshEvent();
  const meshQuaternion = readMeshQuaternionEvent(mesh ?? null);

  if (!calibratorDiceBox || state.selectedDieId == null || !proxy?.rotationQuaternion || !meshQuaternion) {
    return false;
  }

  const deltaQuaternion = new Quaternion(
    proxy.rotationQuaternion.x,
    proxy.rotationQuaternion.y,
    proxy.rotationQuaternion.z,
    proxy.rotationQuaternion.w,
  );

  if (isIdentityQuaternionEvent(deltaQuaternion)) {
    return false;
  }

  deltaQuaternion.normalize();
  const currentQuaternion = new Quaternion(
    meshQuaternion.x,
    meshQuaternion.y,
    meshQuaternion.z,
    meshQuaternion.w,
  );
  currentQuaternion.normalize();

  const nextQuaternion = deltaQuaternion.multiply(currentQuaternion);
  nextQuaternion.normalize();

  (calibratorDiceBox as unknown as {
    setDieVisualTransform: (id: number | string, transform: { rotation?: { x: number; y: number; z: number; w: number } }) => void;
  }).setDieVisualTransform(state.selectedDieId, {
    rotation: {
      x: nextQuaternion.x,
      y: nextQuaternion.y,
      z: nextQuaternion.z,
      w: nextQuaternion.w,
    },
  });

  syncGlobalRotationProxyFromMeshEvent(mesh);
  return true;
}

function applyGizmoCoordinateSpaceEvent(): void {
  if (!rotationGizmo) {
    return;
  }

  const useLocalSpace = state.gizmoCoordinateSpace === "local";
  const customRotationQuaternion = useLocalSpace ? null : Quaternion.Identity();
  const selectedMesh = getSelectedDieMeshEvent();

  if (useLocalSpace) {
    if (globalRotationProxyNode) {
      globalRotationProxyNode.setEnabled(false);
      resetGlobalRotationProxyRotationEvent();
    }
    (rotationGizmo as unknown as { attachedNode?: unknown | null }).attachedNode = selectedMesh;
  } else {
    if (selectedMesh) {
      syncGlobalRotationProxyFromMeshEvent(selectedMesh);
      (rotationGizmo as unknown as { attachedNode?: unknown | null }).attachedNode = ensureGlobalRotationProxyEvent();
    } else {
      if (globalRotationProxyNode) {
        globalRotationProxyNode.setEnabled(false);
        resetGlobalRotationProxyRotationEvent();
      }
      (rotationGizmo as unknown as { attachedNode?: unknown | null }).attachedNode = null;
    }
  }

  rotationGizmo.updateGizmoRotationToMatchAttachedMesh = useLocalSpace;
  rotationGizmo.customRotationQuaternion = customRotationQuaternion;

  const axisGizmos = [rotationGizmo.xGizmo, rotationGizmo.yGizmo, rotationGizmo.zGizmo];
  axisGizmos.forEach((gizmo) => {
    gizmo.updateGizmoRotationToMatchAttachedMesh = useLocalSpace;
    gizmo.customRotationQuaternion = customRotationQuaternion;
  });

  renderCalibrationSceneEvent();
}

function loadStoredPoseConfigEvent(): FocusPoseConfig {
  return createFocusPoseConfig();
}

function persistPoseConfigEvent(): void {
  window.localStorage.setItem(STORAGE_KEY, stringifyFocusPoseConfig(state.poseConfig));
}

async function undoLastCalibrationStepEvent(): Promise<void> {
  const snapshot = state.undoStack.pop();
  if (!snapshot) {
    setStatusEvent("当前没有可撤回的校准步骤。");
    return;
  }

  state.poseConfig = clonePoseConfigEvent(snapshot.poseConfig);
  state.draftPoseConfig = clonePoseConfigEvent(snapshot.draftPoseConfig);
  state.selectedDieType = snapshot.selectedDieType;
  state.selectedResultValue = snapshot.selectedResultValue;
  state.selectedPoseEulerDeg = sanitizePoseEulerEvent(snapshot.selectedPoseEulerDeg);
  state.isCurrentPoseSaved = snapshot.isCurrentPoseSaved;
  state.selectedDieTypeForEdit = snapshot.selectedDieTypeForEdit;
  state.selectedDieResultValue = snapshot.selectedDieResultValue;

  renderDieTypeSelectEvent();
  renderResultButtonsEvent();

  if (state.selectedDieId != null && state.selectedDieTypeForEdit && state.selectedDieResultValue != null) {
    setSelectedDieVisualPoseEvent(state.selectedPoseEulerDeg);
  }

  refreshPanelsEvent();
  setStatusEvent("已撤回上一步校准操作。", "success");
}

function delayEvent(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function nextFrameEvent(): Promise<number> {
  return new Promise((resolve) => window.requestAnimationFrame(resolve));
}

function roundPoseValueEvent(value: number): number {
  const normalized = Number.isFinite(value) ? value : 0;
  return Math.round(normalized * 10 ** POSE_PRECISION) / 10 ** POSE_PRECISION;
}

function sanitizePoseEulerEvent(pose: Partial<PoseEulerDeg> | null | undefined): PoseEulerDeg {
  return {
    x: roundPoseValueEvent(Number(pose?.x ?? 0)),
    y: roundPoseValueEvent(Number(pose?.y ?? 0)),
    z: roundPoseValueEvent(Number(pose?.z ?? 0)),
  };
}

function arePosesEqualEvent(left: PoseEulerDeg, right: PoseEulerDeg): boolean {
  return Math.abs(left.x - right.x) <= 0.001
    && Math.abs(left.y - right.y) <= 0.001
    && Math.abs(left.z - right.z) <= 0.001;
}

function setStatusEvent(text: string, kind: StatusKind = "idle"): void {
  statusLine.textContent = text;
  statusLine.dataset.status = kind;
}

function resolveDiceAssetPathEvent(): string {
  const assetUrl = new URL("../../assets/dice-box/", import.meta.url).href;
  return assetUrl.endsWith("/") ? assetUrl : `${assetUrl}/`;
}

function syncPreviewCanvasVisibilityEvent(): void {
  const previewContainer = document.getElementById("dice-preview-container") as HTMLDivElement | null;
  const canvas = previewContainer?.querySelector(".dice-box-canvas") as HTMLCanvasElement | null;
  if (!previewContainer || !canvas) {
    return;
  }

  const rect = previewContainer.getBoundingClientRect();
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  canvas.style.visibility = "visible";
  canvas.style.opacity = "1";
  if (rect.width > 0) {
    canvas.width = Math.round(rect.width);
  }
  if (rect.height > 0) {
    canvas.height = Math.round(rect.height);
  }
}

async function initCalibratorDiceBoxEvent(): Promise<DiceBoxInstance> {
  if (calibratorDiceBox) {
    return calibratorDiceBox;
  }

  calibratorDiceBox = new DiceBox("#dice-preview-container", {
    assetPath: resolveDiceAssetPathEvent(),
    origin: "",
    theme: "default",
    themeColor: "#4287f5",
    offscreen: false,
    scale: 6,
    gravity: 2,
    startingHeight: 9,
    throwForce: 5.8,
    restitution: 0.46,
    friction: 0.52,
    linearDamping: 0.24,
    angularDamping: 0.2,
    settleTimeout: 5800,
  });

  await calibratorDiceBox.init();
  await (calibratorDiceBox as unknown as {
    loadTheme: (theme: string) => Promise<unknown>;
  }).loadTheme("default");

  calibratorDiceBox.show();
  syncPreviewCanvasVisibilityEvent();
  calibratorDiceBox.resizeWorld();
  bindScenePickingEvent(calibratorDiceBox);

  window.addEventListener("resize", () => {
    syncPreviewCanvasVisibilityEvent();
    calibratorDiceBox?.resizeWorld();
  });

  return calibratorDiceBox;
}

function buildSingleDieNotationEvent(dieType: string): string | { sides: number; qty: number; data?: string } {
  return dieType === "d100" ? { sides: 100, qty: 1, data: "single" } : `1${dieType}`;
}

function resolveTestNotationEvent(): string | { sides: number; qty: number; data?: string } {
  const rawFormula = testFormulaInput.value.trim();
  return rawFormula || buildSingleDieNotationEvent(state.selectedDieType);
}

function formatTestNotationLabelEvent(notation: string | { sides: number; qty: number; data?: string }): string {
  if (typeof notation === "string") {
    return notation;
  }
  if (notation.sides === 100 && notation.data === "single") {
    return "1d100";
  }
  return `${notation.qty ?? 1}d${notation.sides}`;
}

function getCurrentDiceMetaEvent(box: DiceBoxInstance): CalibrationDieMeta[] {
  const getDieData = (targetId: number | string) => (box as unknown as {
    getDieData?: (id: number | string) => { value?: number | null } | null;
  }).getDieData?.(targetId) ?? null;
  const rollDiceData = (box as unknown as {
    rollDiceData?: Record<string, { id?: number | string; dieType?: string; value?: number }>;
  }).rollDiceData ?? {};

  return Object.values(rollDiceData)
    .filter((die): die is { id: number | string; dieType?: string; value?: number } => die?.id !== undefined && die?.id !== null)
    .flatMap((die, index) => {
      const dieType = die.dieType ?? state.selectedDieType;
      const value = typeof die.value === "number" ? die.value : null;

      if (dieType !== "d100") {
        return [{
          id: die.id,
          dieType,
          value,
          groupKey: `single-${String(die.id)}`,
          groupLabel: `第${String(index + 1).padStart(2, "0")}组 · ${dieType.toUpperCase()} ${value == null ? "--" : formatDieResultLabel(dieType, value)}`,
          groupOrder: index,
          pairRole: "single" as const,
          logicalResultValue: value,
        } satisfies CalibrationDieMeta];
      }

      const logicalResultValue = typeof die.value === "number" ? die.value : 0;
      const tensResultValue = Number(normalizeDieResultValueKey("d100", logicalResultValue) ?? 0);
      const partnerId = getD100PartnerDieIdEvent(die.id);
      const partnerValue = getDieData(partnerId)?.value;
      const groupLabel = `第${String(index + 1).padStart(2, "0")}组 · ${formatDieResultLabel("d100", logicalResultValue)}`;

      return [
        {
          id: die.id,
          dieType: "d100",
          value: tensResultValue,
          groupKey: `d100-${String(die.id)}`,
          groupLabel,
          groupOrder: index,
          pairRole: "tens" as const,
          logicalResultValue,
        } satisfies CalibrationDieMeta,
        {
          id: partnerId,
          dieType: "d10",
          value: typeof partnerValue === "number" ? partnerValue : 10,
          groupKey: `d100-${String(die.id)}`,
          groupLabel,
          groupOrder: index,
          pairRole: "ones" as const,
          logicalResultValue,
        } satisfies CalibrationDieMeta,
      ];
    });
}

async function waitForStableDiceStateEvent(box: DiceBoxInstance, dice: CalibrationDieMeta[]): Promise<CalibrationFocusedDieRuntimeState[]> {
  await delayEvent(120);
  await nextFrameEvent();
  await nextFrameEvent();

  const runtimeStates = await Promise.all(
    dice.map(async (die) => {
      const stateSnapshot = await getDieStateEvent(box, die.id);
      if (!stateSnapshot) {
        return null;
      }
      return {
        ...die,
        id: die.id,
        dieType: die.dieType,
        value: die.value,
        state: stateSnapshot,
      } satisfies CalibrationFocusedDieRuntimeState;
    }),
  );

  return runtimeStates.filter((entry): entry is CalibrationFocusedDieRuntimeState => Boolean(entry));
}

function getCurrentDiceValuesEvent(): number[] {
  if (state.currentRollValues.length) {
    return [...state.currentRollValues];
  }

  if (state.currentActualResultValue == null) {
    return [];
  }

  return [state.currentActualResultValue];
}

function buildRollResultsSummaryTextEvent(
  dieType: string,
  rollResults: Array<{ value?: number; modifier?: number; rolls?: Array<{ value?: number }> }>,
): string {
  if (!rollResults.length) {
    return "--";
  }

  const groupTexts = rollResults.map((group) => {
    const totalValue = Number(group.value);
    const totalText = Number.isFinite(totalValue) ? formatDieResultLabel(dieType, totalValue) : "--";
    const rollValues = Array.isArray(group.rolls)
      ? group.rolls
        .map((roll) => Number(roll?.value))
        .filter((value) => Number.isFinite(value))
      : [];

    if (rollValues.length <= 1 && !group.modifier) {
      return totalText;
    }

    const rollText = rollValues.length
      ? rollValues.map((value) => formatDieResultLabel(dieType, value)).join(" + ")
      : "--";
    const modifierValue = Number(group.modifier ?? 0);
    const modifierText = modifierValue
      ? modifierValue > 0
        ? ` + ${modifierValue}`
        : ` - ${Math.abs(modifierValue)}`
      : "";
    return `${totalText}（${rollText}${modifierText}）`;
  });

  return groupTexts.join(" / ");
}

function getD100PartnerDieIdEvent(dieId: number | string): number | string {
  if (typeof dieId === "number") {
    return dieId + D100_PARTNER_ID_OFFSET;
  }

  const numericDieId = Number(dieId);
  if (Number.isFinite(numericDieId)) {
    return numericDieId + D100_PARTNER_ID_OFFSET;
  }

  return `${String(dieId)}${D100_PARTNER_ID_OFFSET}`;
}

function getPairRoleTextEvent(pairRole: CompositePairRole): string {
  switch (pairRole) {
    case "tens":
      return "十位骰";
    case "ones":
      return "个位骰";
    default:
      return "单骰";
  }
}

function getCompositeDieScaleRatioEvent(pairRole: CompositePairRole): number {
  return pairRole === "ones"
    ? COMPOSITE_SECONDARY_DIE_SCALE_RATIO
    : COMPOSITE_PRIMARY_DIE_SCALE_RATIO;
}

function getCompositeDieDepthOffsetEvent(pairRole: CompositePairRole): number {
  return pairRole === "ones"
    ? COMPOSITE_GROUP_PAIR_DEPTH_OFFSET
    : -COMPOSITE_GROUP_PAIR_DEPTH_OFFSET;
}

function getDiceGroupsEvent(dice: CalibrationFocusedDieRuntimeState[] = state.currentDice): Array<{
  key: string;
  label: string;
  order: number;
  members: CalibrationFocusedDieRuntimeState[];
}> {
  const groups = new Map<string, {
    key: string;
    label: string;
    order: number;
    members: CalibrationFocusedDieRuntimeState[];
  }>();

  dice.forEach((die) => {
    const currentGroup = groups.get(die.groupKey) ?? {
      key: die.groupKey,
      label: die.groupLabel,
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

function hasCompositeDiceGroupsEvent(dice: CalibrationFocusedDieRuntimeState[] = state.currentDice): boolean {
  return getDiceGroupsEvent(dice).some((group) => group.members.length > 1);
}

function getCurrentGroupSummaryTextEvent(): string {
  const groups = getDiceGroupsEvent();
  if (!groups.length) {
    return "分组 --";
  }

  const compositeGroups = groups.filter((group) => group.members.length > 1);
  if (!compositeGroups.length) {
    return `分组 ${groups.length} 组`;
  }

  const previewText = compositeGroups.slice(0, 3).map((group) => group.label).join(" / ");
  return `分组 ${compositeGroups.length} 组，每组 2 骰${previewText ? ` · ${previewText}` : ""}`;
}

function buildSelectedDieTextEvent(): string {
  const selectedDie = getSelectedDieEntryEvent();
  if (!selectedDie) {
    return "选中骰子 --";
  }

  const groupText = selectedDie.groupLabel ? ` · ${selectedDie.groupLabel}` : "";
  const roleText = selectedDie.pairRole !== "single" ? ` · ${getPairRoleTextEvent(selectedDie.pairRole)}` : "";
  return `选中骰子 ${String(selectedDie.id)}${groupText}${roleText}`;
}

function buildCurrentResultDisplayEvent(): {
  headline: string;
  subtitle: string;
  statText: string;
  testMain: string;
  testSub: string;
} {
  const groups = getDiceGroupsEvent();
  const compositeGroupCount = groups.filter((group) => group.members.length > 1).length;
  if (compositeGroupCount > 0) {
    const groupPreviewText = groups.slice(0, 5).map((group) => group.label).join(" / ");
    const selectedLabel = formatDieResultLabel(state.selectedDieType, state.selectedResultValue);
    return {
      headline: `${compositeGroupCount} 组`,
      subtitle: state.selectedDieType === "d100"
        ? `D100 双骰分组预览 · 当前目标 ${selectedLabel}`
        : `复合骰分组预览 · 当前目标 ${selectedLabel}`,
      statText: `${compositeGroupCount} 组`,
      testMain: `${compositeGroupCount} 组`,
      testSub: `当前共 ${compositeGroupCount} 组、每组 2 骰；${groupPreviewText}${groups.length > 5 ? " ..." : ""}`,
    };
  }

  const values = getCurrentDiceValuesEvent();
  if (!values.length) {
    const selectedLabel = formatDieResultLabel(state.selectedDieType, state.selectedResultValue);
    return {
      headline: "--",
      subtitle: `目标结果面 ${selectedLabel}`,
      statText: "--",
      testMain: "--",
      testSub: `当前目标结果面 ${selectedLabel}。`,
    };
  }

  if (values.length === 1) {
    const currentValue = values[0];
    const currentLabel = formatDieResultLabel(
      state.selectedDieType,
      Number(normalizeDieResultValueKey(state.selectedDieType, currentValue) ?? currentValue),
    );
    const selectedLabel = formatDieResultLabel(state.selectedDieType, state.selectedResultValue);
    return {
      headline: currentLabel,
      subtitle: `目标结果面 ${selectedLabel}`,
      statText: currentLabel,
      testMain: currentLabel,
      testSub: `当前目标结果面 ${selectedLabel}。`,
    };
  }

  const labels = values.map((value) =>
    formatDieResultLabel(
      state.selectedDieType,
      Number(normalizeDieResultValueKey(state.selectedDieType, value) ?? value),
    ),
  );
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    headline: `合计 ${total}`,
    subtitle: `实际结果：${labels.join(" / ")}`,
    statText: `合计 ${total}`,
    testMain: `合计 ${total}`,
    testSub: `实际结果：${labels.join(" / ")}`,
  };
}

function getSelectedDieEntryEvent(): CalibrationFocusedDieRuntimeState | null {
  if (state.selectedDieId == null) {
    return null;
  }
  return state.currentDice.find((die) => die.id === state.selectedDieId) ?? null;
}

function getSelectedSavedPoseEvent(): PoseEulerDeg {
  if (!state.selectedDieTypeForEdit || state.selectedDieResultValue == null) {
    return { x: 0, y: 0, z: 0 };
  }
  return sanitizePoseEulerEvent(getDiePoseEulerDeg(state.poseConfig, state.selectedDieTypeForEdit, state.selectedDieResultValue));
}

function getSelectedDraftPoseEvent(): PoseEulerDeg {
  if (!state.selectedDieTypeForEdit || state.selectedDieResultValue == null) {
    return { x: 0, y: 0, z: 0 };
  }
  return sanitizePoseEulerEvent(getDiePoseEulerDeg(state.draftPoseConfig, state.selectedDieTypeForEdit, state.selectedDieResultValue));
}

function hasSelectedDraftPoseConfigEvent(): boolean {
  return Boolean(
    state.selectedDieTypeForEdit
    && state.selectedDieResultValue != null
    && hasDiePoseConfig(state.draftPoseConfig, state.selectedDieTypeForEdit, state.selectedDieResultValue),
  );
}

function updateSelectedDraftPoseEvent(pose: PoseEulerDeg): void {
  if (!state.selectedDieTypeForEdit || state.selectedDieResultValue == null) {
    return;
  }

  setDiePoseEulerDeg(
    state.draftPoseConfig,
    state.selectedDieTypeForEdit,
    state.selectedDieResultValue,
    sanitizePoseEulerEvent(pose),
  );
}

function beginEulerInputHistoryCheckpointEvent(): void {
  if (hasPendingEulerInputCheckpoint || state.selectedDieId == null) {
    return;
  }
  hasPendingEulerInputCheckpoint = true;
  pushUndoSnapshotEvent();
}

function endEulerInputHistoryCheckpointEvent(): void {
  hasPendingEulerInputCheckpoint = false;
}

function updateEulerInputValuesEvent(pose: PoseEulerDeg): void {
  eulerXInput.value = String(pose.x);
  eulerYInput.value = String(pose.y);
  eulerZInput.value = String(pose.z);
}

function buildConfigOutputTextEvent(): string {
  return stringifyFocusPoseConfig(state.draftPoseConfig);
}

function refreshConfigOutputEvent(): void {
  configOutput.value = buildConfigOutputTextEvent();
}

function getPoseStatusTextEvent(): { plain: string; rich: string } {
  if (!state.selectedDieTypeForEdit || state.selectedDieResultValue == null) {
    return {
      plain: "未选中",
      rich: "未选中",
    };
  }

  const isConfigured = hasDiePoseConfig(state.draftPoseConfig, state.selectedDieTypeForEdit, state.selectedDieResultValue);
  return {
    plain: isConfigured ? "已配置" : "未配置",
    rich: isConfigured ? '<span class="tag-configured">已配置</span>' : '<span class="tag-unconfigured">未配置</span>',
  };
}

function getSelectedDieValueTextEvent(): string {
  if (!state.selectedDieTypeForEdit || state.selectedDieResultValue == null) {
    return "--";
  }

  return formatDieResultLabel(state.selectedDieTypeForEdit, state.selectedDieResultValue);
}

function getAvailableCopySourceResultValuesEvent(): number[] {
  return getDieResultOptions(state.selectedDieType).filter((value) => value !== state.selectedResultValue);
}

function syncCopySourceResultSelectionEvent(): void {
  const availableValues = getAvailableCopySourceResultValuesEvent();
  if (!availableValues.length) {
    state.copySourceResultValue = null;
    return;
  }

  if (state.copySourceResultValue != null && availableValues.includes(state.copySourceResultValue)) {
    return;
  }

  state.copySourceResultValue = availableValues[0] ?? null;
}

function renderCopySourceResultOptionsEvent(): void {
  syncCopySourceResultSelectionEvent();
  copySourceResultSelect.innerHTML = "";

  const availableValues = getAvailableCopySourceResultValuesEvent();
  copySourceResultSelect.disabled = availableValues.length === 0;
  copySourcePoseButton.disabled = availableValues.length === 0;

  if (!availableValues.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "无可复制来源";
    copySourceResultSelect.appendChild(option);
    return;
  }

  availableValues.forEach((resultValue) => {
    const option = document.createElement("option");
    const isConfigured = hasDiePoseConfig(state.draftPoseConfig, state.selectedDieType, resultValue);
    option.value = String(resultValue);
    option.selected = resultValue === state.copySourceResultValue;
    option.textContent = `${formatDieResultLabel(state.selectedDieType, resultValue)}${isConfigured ? "（已配置）" : "（未配置）"}`;
    copySourceResultSelect.appendChild(option);
  });
}

function refreshPanelsEvent(): void {
  const resultDisplay = buildCurrentResultDisplayEvent();
  const poseStatus = getPoseStatusTextEvent();
  const selectedDieValueText = getSelectedDieValueTextEvent();
  currentResultValueText.textContent = resultDisplay.headline;
  currentResultText.textContent = state.selectedDieTypeForEdit && state.selectedDieResultValue != null
    ? `${resultDisplay.subtitle} · 正在编辑 ${state.selectedDieTypeForEdit.toUpperCase()} / ${formatDieResultLabel(state.selectedDieTypeForEdit, state.selectedDieResultValue)}`
    : resultDisplay.subtitle;
  currentDieTypeText.textContent = `目标骰型 ${state.selectedDieType.toUpperCase()}`;
  currentSelectedDieText.textContent = buildSelectedDieTextEvent();
  currentGroupSummaryText.textContent = getCurrentGroupSummaryTextEvent();
  currentPoseStatusText.innerHTML = `${poseStatus.rich}${state.isCurrentPoseSaved ? ' <span class="tag-configured">已落盘</span>' : ' <span class="tag-unconfigured">未落盘</span>'}`;

  statResult.textContent = resultDisplay.statText;
  statPoseStatus.textContent = poseStatus.plain;
  statSelectedDieValue.textContent = selectedDieValueText;
  statX.textContent = String(state.selectedPoseEulerDeg.x);
  statY.textContent = String(state.selectedPoseEulerDeg.y);
  statZ.textContent = String(state.selectedPoseEulerDeg.z);
  statSaved.textContent = state.isCurrentPoseSaved ? "是" : "否";
  testResultMain.textContent = resultDisplay.testMain;
  testResultSub.textContent = resultDisplay.testSub;
  testHistory.textContent = state.testHistory.length
    ? `最近结果：${state.testHistory.map((item) => `${item.formula}=${item.resultText}`).join(" / ")}`
    : "最近结果：--";

  updateEulerInputValuesEvent(state.selectedPoseEulerDeg);
  refreshConfigOutputEvent();
}

function renderDieTypeSelectEvent(): void {
  dieTypeSelect.innerHTML = "";
  for (const dieType of getSupportedDieTypes()) {
    const option = document.createElement("option");
    option.value = dieType;
    option.textContent = dieType.toUpperCase();
    option.selected = dieType === state.selectedDieType;
    dieTypeSelect.appendChild(option);
  }
}

function renderResultButtonsEvent(): void {
  resultGrid.innerHTML = "";
  for (const resultValue of getDieResultOptions(state.selectedDieType)) {
    const button = document.createElement("button");
    const isConfigured = hasDiePoseConfig(state.draftPoseConfig, state.selectedDieType, resultValue);
    button.type = "button";
    button.className = `result-btn${resultValue === state.selectedResultValue ? " is-active" : ""}${isConfigured ? " is-configured" : " is-unconfigured"}`;
    button.textContent = formatDieResultLabel(state.selectedDieType, resultValue);
    button.title = isConfigured ? "该结果面已调整三轴姿态" : "该结果面尚未配置，将以 0,0,0 兜底";
    button.addEventListener("click", () => {
      state.selectedResultValue = resultValue;
      if (state.selectedDieType === "d100") {
        const preferredDie = state.currentDice.find((die) => die.dieType === "d100" && die.pairRole === "tens" && die.logicalResultValue === resultValue);
        state.currentActualDieId = preferredDie?.id ?? state.currentActualDieId;
        state.currentActualResultValue = resultValue;
      }
      renderResultButtonsEvent();
      refreshPanelsEvent();
    });
    resultGrid.appendChild(button);
  }
  renderCopySourceResultOptionsEvent();
}

function releaseDirectDieDragPointerCaptureEvent(): void {
  if (!directDieDragState?.pointerTarget || !("releasePointerCapture" in directDieDragState.pointerTarget)) {
    return;
  }

  try {
    (directDieDragState.pointerTarget as Element & { releasePointerCapture: (pointerId: number) => void }).releasePointerCapture(directDieDragState.pointerId);
  } catch {
    // 某些浏览器在 capture 已丢失时会抛错，这里静默忽略即可。
  }
}

function clearDirectDieDragStateEvent(): void {
  releaseDirectDieDragPointerCaptureEvent();
  directDieDragState = null;
}

function detachRotationGizmoEvent(): void {
  clearDirectDieDragStateEvent();
  if (rotationGizmo) {
    (rotationGizmo as unknown as { attachedNode?: unknown | null }).attachedNode = null;
  }
  if (globalRotationProxyNode) {
    globalRotationProxyNode.setEnabled(false);
    resetGlobalRotationProxyRotationEvent();
  }
  renderCalibrationSceneEvent();
}

function doesPickedNodeBelongToDieEvent(pickedNode: unknown, dieNode: unknown): boolean {
  let cursor = pickedNode as { parent?: unknown } | null;
  while (cursor) {
    if (cursor === dieNode) {
      return true;
    }
    cursor = (cursor.parent as { parent?: unknown } | null) ?? null;
  }
  return false;
}

function readMeshQuaternionEvent(mesh: {
  rotationQuaternion?: { x: number; y: number; z: number; w: number } | null;
  rotation?: { x: number; y: number; z: number };
} | null): { x: number; y: number; z: number; w: number } | null {
  if (!mesh) {
    return null;
  }
  if (mesh.rotationQuaternion) {
    return {
      x: mesh.rotationQuaternion.x,
      y: mesh.rotationQuaternion.y,
      z: mesh.rotationQuaternion.z,
      w: mesh.rotationQuaternion.w,
    };
  }
  if (mesh.rotation) {
    const quaternion = Quaternion.FromEulerAngles(mesh.rotation.x, mesh.rotation.y, mesh.rotation.z);
    return {
      x: quaternion.x,
      y: quaternion.y,
      z: quaternion.z,
      w: quaternion.w,
    };
  }
  return null;
}

function getArcballVectorFromClientEvent(clientX: number, clientY: number): Vector3 | null {
  const rect = previewContainer.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const size = Math.min(rect.width, rect.height);
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const normalizedX = (clientX - centerX) / (size / 2);
  const normalizedY = (centerY - clientY) / (size / 2);
  const lengthSquared = normalizedX * normalizedX + normalizedY * normalizedY;

  if (lengthSquared > 1) {
    const length = Math.sqrt(lengthSquared) || 1;
    return new Vector3(normalizedX / length, normalizedY / length, 0);
  }

  return new Vector3(normalizedX, normalizedY, Math.sqrt(1 - lengthSquared));
}

function createArcballQuaternionEvent(from: Vector3, to: Vector3): Quaternion {
  const startVector = from.normalizeToNew();
  const endVector = to.normalizeToNew();
  const dot = Math.min(1, Math.max(-1, Vector3.Dot(startVector, endVector)));

  if (dot >= DIRECT_DIE_DRAG_MIN_DOT) {
    return Quaternion.Identity();
  }

  if (dot <= -DIRECT_DIE_DRAG_MIN_DOT) {
    const fallbackAxis = Math.abs(startVector.x) < 0.9 ? Vector3.Right() : Vector3.Up();
    const axis = Vector3.Cross(startVector, fallbackAxis).normalize();
    return Quaternion.RotationAxis(axis, Math.PI);
  }

  const axis = Vector3.Cross(startVector, endVector).normalize();
  const angle = Math.acos(dot);
  return Quaternion.RotationAxis(axis, angle);
}

function resolveArcballVectorsForCoordinateSpaceEvent(
  startVector: Vector3,
  currentVector: Vector3,
  startQuaternion: Quaternion,
): { start: Vector3; current: Vector3 } {
  if (state.gizmoCoordinateSpace === "global") {
    return {
      start: startVector,
      current: currentVector,
    };
  }

  const inverseStartQuaternion = startQuaternion.clone();
  inverseStartQuaternion.conjugateInPlace();
  inverseStartQuaternion.normalize();

  const localStartVector = Vector3.Zero();
  const localCurrentVector = Vector3.Zero();
  startVector.rotateByQuaternionToRef(inverseStartQuaternion, localStartVector);
  currentVector.rotateByQuaternionToRef(inverseStartQuaternion, localCurrentVector);

  return {
    start: localStartVector.normalize(),
    current: localCurrentVector.normalize(),
  };
}

function beginDirectDieDragEvent(pointerEvent: PointerEvent, dieId: number | string): void {
  const meshQuaternion = readMeshQuaternionEvent(getSelectedDieMeshEvent());
  const startArcballVector = getArcballVectorFromClientEvent(pointerEvent.clientX, pointerEvent.clientY);
  if (!meshQuaternion || !startArcballVector) {
    return;
  }

  const pointerTarget = pointerEvent.target instanceof Element ? pointerEvent.target : null;
  if (pointerTarget && "setPointerCapture" in pointerTarget) {
    try {
      (pointerTarget as Element & { setPointerCapture: (pointerId: number) => void }).setPointerCapture(pointerEvent.pointerId);
    } catch {
      // 某些环境下无法设置 capture，不影响基础拖拽。
    }
  }

  directDieDragState = {
    pointerId: pointerEvent.pointerId,
    dieId,
    startArcballVector,
    startQuaternion: meshQuaternion,
    hasDragged: false,
    pointerTarget,
  };

  if (rotationGizmo) {
    (rotationGizmo as unknown as { attachedNode?: unknown | null }).attachedNode = null;
    renderCalibrationSceneEvent();
  }
}

function applyDirectDieDragDeltaEvent(clientX: number, clientY: number): void {
  if (!calibratorDiceBox || !directDieDragState || state.selectedDieId == null || directDieDragState.dieId !== state.selectedDieId) {
    return;
  }

  const currentArcballVector = getArcballVectorFromClientEvent(clientX, clientY);
  if (!currentArcballVector) {
    return;
  }

  const startQuaternion = new Quaternion(
    directDieDragState.startQuaternion.x,
    directDieDragState.startQuaternion.y,
    directDieDragState.startQuaternion.z,
    directDieDragState.startQuaternion.w,
  );
  startQuaternion.normalize();

  const arcballVectors = resolveArcballVectorsForCoordinateSpaceEvent(
    directDieDragState.startArcballVector,
    currentArcballVector,
    startQuaternion,
  );

  const dragQuaternion = createArcballQuaternionEvent(arcballVectors.start, arcballVectors.current);

  if (isIdentityQuaternionEvent(dragQuaternion)) {
    return;
  }

  if (!directDieDragState.hasDragged) {
    pushUndoSnapshotEvent();
    directDieDragState.hasDragged = true;
  }
  dragQuaternion.normalize();

  const nextQuaternion = new Quaternion();
  if (state.gizmoCoordinateSpace === "global") {
    startQuaternion.multiplyToRef(dragQuaternion, nextQuaternion);
  } else {
    dragQuaternion.multiplyToRef(startQuaternion, nextQuaternion);
  }
  nextQuaternion.normalize();

  (calibratorDiceBox as unknown as {
    setDieVisualTransform: (id: number | string, transform: { rotation?: { x: number; y: number; z: number; w: number } }) => void;
  }).setDieVisualTransform(state.selectedDieId, {
    rotation: {
      x: nextQuaternion.x,
      y: nextQuaternion.y,
      z: nextQuaternion.z,
      w: nextQuaternion.w,
    },
  });

  if (state.gizmoCoordinateSpace === "global") {
    syncGlobalRotationProxyFromMeshEvent();
  }

  renderCalibrationSceneEvent();
  void syncSelectedPoseFromMeshEvent({ writeDraft: true });
}

async function syncSelectedPoseFromMeshEvent({ writeDraft = false }: { writeDraft?: boolean } = {}): Promise<void> {
  if (!calibratorDiceBox || state.selectedDieId == null) {
    return;
  }

  const mesh = (calibratorDiceBox as unknown as {
    getDieMesh: (id: number | string) => unknown | null;
  }).getDieMesh(state.selectedDieId) as {
    rotationQuaternion?: { x: number; y: number; z: number; w: number } | null;
    rotation?: { x: number; y: number; z: number };
  } | null;

  const quaternion = readMeshQuaternionEvent(mesh);
  if (!quaternion) {
    return;
  }

  state.selectedPoseEulerDeg = sanitizePoseEulerEvent(quaternionToEulerDeg(quaternion));
  if (writeDraft) {
    updateSelectedDraftPoseEvent(state.selectedPoseEulerDeg);
  }
  state.isCurrentPoseSaved = arePosesEqualEvent(state.selectedPoseEulerDeg, getSelectedSavedPoseEvent());
  refreshPanelsEvent();
}

function setSelectedDieVisualPoseEvent(pose: PoseEulerDeg): void {
  if (!calibratorDiceBox || state.selectedDieId == null) {
    return;
  }

  const quaternion = createQuaternionFromPoseEuler(sanitizePoseEulerEvent(pose));
  (calibratorDiceBox as unknown as {
    setDieVisualTransform: (id: number | string, transform: { rotation?: { x: number; y: number; z: number; w: number } }) => void;
  }).setDieVisualTransform(state.selectedDieId, {
    rotation: quaternion,
  });

  renderCalibrationSceneEvent();
}

function setCurrentTargetPreviewVisualPoseEvent(pose: PoseEulerDeg): void {
  if (!calibratorDiceBox || state.currentActualDieId == null || state.currentActualResultValue !== state.selectedResultValue) {
    return;
  }

  const quaternion = createQuaternionFromPoseEuler(sanitizePoseEulerEvent(pose));
  (calibratorDiceBox as unknown as {
    setDieVisualTransform: (id: number | string, transform: { rotation?: { x: number; y: number; z: number; w: number } }) => void;
  }).setDieVisualTransform(state.currentActualDieId, {
    rotation: quaternion,
  });

  renderCalibrationSceneEvent();
}

function attachRotationGizmoToSelectedDieEvent(): void {
  if (!rotationGizmo) {
    return;
  }

  if (
    directDieDragState
    || !calibratorDiceBox
    || state.selectedDieId == null
    || !state.selectedDieTypeForEdit
    || state.selectedDieResultValue == null
  ) {
    (rotationGizmo as unknown as { attachedNode?: unknown | null }).attachedNode = null;
    renderCalibrationSceneEvent();
    return;
  }

  const mesh = (calibratorDiceBox as unknown as {
    getDieMesh: (id: number | string) => unknown | null;
  }).getDieMesh(state.selectedDieId);

  if (!mesh) {
    (rotationGizmo as unknown as { attachedNode?: unknown | null }).attachedNode = null;
    renderCalibrationSceneEvent();
    return;
  }

  applyRotationSnapEvent();
  applyGizmoCoordinateSpaceEvent();
}

function selectDieForEditingEvent(dieId: number | string | null): void {
  if (directDieDragState && directDieDragState.dieId !== dieId) {
    clearDirectDieDragStateEvent();
  }

  state.selectedDieId = dieId;
  const die = dieId == null ? null : state.currentDice.find((entry) => entry.id === dieId) ?? null;
  state.selectedDieTypeForEdit = die?.dieType ?? null;
  state.selectedDieResultValue = typeof die?.value === "number" ? die.value : null;

  if (!calibratorDiceBox || !rotationGizmo || !die) {
    state.selectedPoseEulerDeg = { x: 0, y: 0, z: 0 };
    state.isCurrentPoseSaved = true;
    detachRotationGizmoEvent();
    refreshPanelsEvent();
    return;
  }

  const mesh = (calibratorDiceBox as unknown as {
    getDieMesh: (id: number | string) => unknown | null;
  }).getDieMesh(die.id);

  if (!mesh || die.dieType === "d4") {
    detachRotationGizmoEvent();
    state.selectedPoseEulerDeg = { x: 0, y: 0, z: 0 };
    state.isCurrentPoseSaved = true;
    refreshPanelsEvent();
    return;
  }

  attachRotationGizmoToSelectedDieEvent();
  if (hasSelectedDraftPoseConfigEvent()) {
    const draftPose = getSelectedDraftPoseEvent();
    setSelectedDieVisualPoseEvent(draftPose);
    state.selectedPoseEulerDeg = draftPose;
    state.isCurrentPoseSaved = arePosesEqualEvent(draftPose, getSelectedSavedPoseEvent());
    refreshPanelsEvent();
    return;
  }

  renderCalibrationSceneEvent();
  void syncSelectedPoseFromMeshEvent();
}

function bindScenePickingEvent(box: DiceBoxInstance): void {
  if (hasBoundScenePicking) {
    return;
  }

  const scene = (box as unknown as {
    getScene: () => {
      onPointerObservable?: { add: (callback: (info: { type: number; pickInfo?: { pickedMesh?: unknown } }) => void) => void };
    } | null;
  }).getScene();

  if (!scene?.onPointerObservable) {
    return;
  }

  utilityLayer = new UtilityLayerRenderer(scene as never);
  rotationGizmo = new RotationGizmo(utilityLayer);
  (rotationGizmo as unknown as {
    scaleRatio?: number;
    updateGizmoRotationToMatchAttachedMesh?: boolean;
    updateGizmoPositionToMatchAttachedMesh?: boolean;
  }).scaleRatio = 0.6;
  (rotationGizmo as unknown as {
    updateGizmoRotationToMatchAttachedMesh?: boolean;
  }).updateGizmoRotationToMatchAttachedMesh = true;
  (rotationGizmo as unknown as {
    updateGizmoPositionToMatchAttachedMesh?: boolean;
  }).updateGizmoPositionToMatchAttachedMesh = true;
  rotationGizmo.snapDistance = getRotationSnapRadEvent();
  applyGizmoCoordinateSpaceEvent();
  detachRotationGizmoEvent();

  const dragSources = [
    (rotationGizmo as unknown as { xGizmo?: { dragBehavior?: { onDragObservable?: { add: (cb: () => void) => void } } } }).xGizmo,
    (rotationGizmo as unknown as { yGizmo?: { dragBehavior?: { onDragObservable?: { add: (cb: () => void) => void } } } }).yGizmo,
    (rotationGizmo as unknown as { zGizmo?: { dragBehavior?: { onDragObservable?: { add: (cb: () => void) => void } } } }).zGizmo,
  ];
  dragSources.forEach((gizmo) => gizmo?.dragBehavior?.onDragObservable?.add(() => {
    if (state.gizmoCoordinateSpace === "global") {
      applyGlobalRotationProxyDeltaEvent();
    }
    renderCalibrationSceneEvent();
    void syncSelectedPoseFromMeshEvent({ writeDraft: true });
  }));
  rotationGizmo.onDragStartObservable.add(() => {
    if (state.selectedDieId != null) {
      pushUndoSnapshotEvent();
      if (state.gizmoCoordinateSpace === "global") {
        syncGlobalRotationProxyFromMeshEvent();
      }
    }
  });
  rotationGizmo.onDragEndObservable.add(() => {
    if (state.gizmoCoordinateSpace === "global") {
      syncGlobalRotationProxyFromMeshEvent();
      renderCalibrationSceneEvent();
    }
  });

  scene.onPointerObservable.add((pointerInfo) => {
    const pointerEvent = (pointerInfo as { event?: PointerEvent }).event;

    if (pointerInfo.type === PointerEventTypes.POINTERMOVE) {
      if (!directDieDragState || !pointerEvent || pointerEvent.pointerId !== directDieDragState.pointerId) {
        return;
      }

      applyDirectDieDragDeltaEvent(pointerEvent.clientX, pointerEvent.clientY);
      return;
    }

    if (pointerInfo.type === PointerEventTypes.POINTERUP) {
      if (directDieDragState && pointerEvent && pointerEvent.pointerId === directDieDragState.pointerId) {
        clearDirectDieDragStateEvent();
        attachRotationGizmoToSelectedDieEvent();
      }
      return;
    }

    if (pointerInfo.type !== PointerEventTypes.POINTERDOWN) {
      return;
    }

    const pickedMesh = pointerInfo.pickInfo?.pickedMesh;
    if (!calibratorDiceBox) {
      return;
    }

    if (!pickedMesh) {
      if (!rotationGizmo?.isHovered) {
        selectDieForEditingEvent(null);
        setStatusEvent("已取消当前选中的骰子。点击任意骰子可重新挂载旋转把手。");
      }
      return;
    }

    const matchedDie = state.currentDice.find((die) => {
      const dieMesh = (calibratorDiceBox as unknown as {
        getDieMesh: (id: number | string) => unknown | null;
      }).getDieMesh(die.id);
      return dieMesh ? doesPickedNodeBelongToDieEvent(pickedMesh, dieMesh) : false;
    });

    if (!matchedDie) {
      if (!rotationGizmo?.isHovered) {
        selectDieForEditingEvent(null);
        setStatusEvent("已取消当前选中的骰子。点击任意骰子可重新挂载旋转把手。");
      }
      return;
    }

    if (
      matchedDie.id === state.selectedDieId
      && !rotationGizmo?.isHovered
      && pointerEvent
      && pointerEvent.button === 0
    ) {
      beginDirectDieDragEvent(pointerEvent, matchedDie.id);
      return;
    }

    selectDieForEditingEvent(matchedDie.id);
    setStatusEvent(`已选中骰子 ${String(matchedDie.id)}（${matchedDie.groupLabel} / ${getPairRoleTextEvent(matchedDie.pairRole)}），结果面为 ${formatDieResultLabel(matchedDie.dieType, matchedDie.value ?? 0)}。`);
  });

  hasBoundScenePicking = true;
}

async function applyPoseToSelectedDieEvent(pose: PoseEulerDeg): Promise<void> {
  if (!calibratorDiceBox || state.selectedDieId == null) {
    setStatusEvent("当前没有选中的骰子，请先点击预览中的某一颗骰子。");
    return;
  }

  const normalizedPose = sanitizePoseEulerEvent(pose);
  if (!arePosesEqualEvent(normalizedPose, state.selectedPoseEulerDeg)) {
    // 撤回点由把手拖拽开始或数值输入聚焦时建立；这里不重复压栈。
  }
  const quaternion = createQuaternionFromPoseEuler(normalizedPose);
  (calibratorDiceBox as unknown as {
    setDieVisualTransform: (id: number | string, transform: { rotation?: { x: number; y: number; z: number; w: number } }) => void;
  }).setDieVisualTransform(state.selectedDieId, {
    rotation: quaternion,
  });

  updateSelectedDraftPoseEvent(normalizedPose);
  renderCalibrationSceneEvent();
  state.selectedPoseEulerDeg = normalizedPose;
  state.isCurrentPoseSaved = arePosesEqualEvent(normalizedPose, getSelectedSavedPoseEvent());
  refreshPanelsEvent();
}

async function saveCurrentPoseEvent(): Promise<void> {
  if (!state.selectedDieTypeForEdit || state.selectedDieResultValue == null) {
    setStatusEvent("当前没有可保存的选中骰子，请先测试或显示目标面后点击一颗骰子。");
    return;
  }

  pushUndoSnapshotEvent();

  setDiePoseEulerDeg(
    state.poseConfig,
    state.selectedDieTypeForEdit,
    state.selectedDieResultValue,
    sanitizePoseEulerEvent(state.selectedPoseEulerDeg),
  );
  updateSelectedDraftPoseEvent(state.selectedPoseEulerDeg);
  persistPoseConfigEvent();
  refreshConfigOutputEvent();
  renderResultButtonsEvent();
  state.isCurrentPoseSaved = true;
  refreshPanelsEvent();
  setStatusEvent(
    `已保存 ${state.selectedDieTypeForEdit.toUpperCase()} 结果面 ${formatDieResultLabel(state.selectedDieTypeForEdit, state.selectedDieResultValue)} 的三轴姿态。`,
    "success",
  );
}

async function copyPoseFromSourceResultEvent(): Promise<void> {
  const sourceResultValue = Number(copySourceResultSelect.value);
  if (!Number.isFinite(sourceResultValue)) {
    setStatusEvent("当前没有可复制的来源结果面。", "error");
    return;
  }

  if (sourceResultValue === state.selectedResultValue) {
    setStatusEvent("来源结果面与当前结果面相同，无需复制。");
    return;
  }

  const sourcePose = sanitizePoseEulerEvent(getDiePoseEulerDeg(state.draftPoseConfig, state.selectedDieType, sourceResultValue));
  const sourceConfigured = hasDiePoseConfig(state.draftPoseConfig, state.selectedDieType, sourceResultValue);
  const sourceLabel = formatDieResultLabel(state.selectedDieType, sourceResultValue);
  const targetLabel = formatDieResultLabel(state.selectedDieType, state.selectedResultValue);

  pushUndoSnapshotEvent();
  setDiePoseEulerDeg(
    state.draftPoseConfig,
    state.selectedDieType,
    state.selectedResultValue,
    sourcePose,
  );

  if (
    state.selectedDieId != null
    && state.selectedDieTypeForEdit === state.selectedDieType
    && state.selectedDieResultValue === state.selectedResultValue
  ) {
    setSelectedDieVisualPoseEvent(sourcePose);
    state.selectedPoseEulerDeg = sourcePose;
    state.isCurrentPoseSaved = arePosesEqualEvent(sourcePose, getSelectedSavedPoseEvent());
  } else {
    setCurrentTargetPreviewVisualPoseEvent(sourcePose);
  }

  renderResultButtonsEvent();
  refreshPanelsEvent();
  setStatusEvent(
    sourceConfigured
      ? `已将 ${state.selectedDieType.toUpperCase()} 结果面 ${sourceLabel} 的 XYZ 复制到当前结果面 ${targetLabel}，你可以在此基础上继续微调。`
      : `结果面 ${sourceLabel} 还没有已配置姿态，已把默认的 0,0,0 复制到当前结果面 ${targetLabel}。`,
    "success",
  );
}

async function resetSelectedPoseEvent(): Promise<void> {
  if (state.selectedDieId != null) {
    pushUndoSnapshotEvent();
  }
  await applyPoseToSelectedDieEvent({ x: 0, y: 0, z: 0 });
  setStatusEvent("已把当前选中骰子的姿态重置为 0,0,0；如需落盘请点击“保存当前姿态”。");
}

async function applyEditedConfigEvent(): Promise<void> {
  try {
    pushUndoSnapshotEvent();
    const parsedPoseConfig = JSON.parse(configOutput.value);
    state.poseConfig = parsedPoseConfig;
    state.draftPoseConfig = clonePoseConfigEvent(parsedPoseConfig);
    persistPoseConfigEvent();
    renderResultButtonsEvent();
    refreshConfigOutputEvent();
    if (state.currentDice.length) {
      await playFocusPreviewEvent(state.selectedDieId);
    }
    refreshPanelsEvent();
    setStatusEvent("已应用编辑区中的三轴姿态配置。", "success");
  } catch (error: unknown) {
    setStatusEvent(`应用编辑配置失败：${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

async function copyConfigEvent(): Promise<void> {
  await navigator.clipboard.writeText(configOutput.value);
  setStatusEvent("已复制当前三轴姿态配置。", "success");
}

function downloadConfigEvent(): void {
  const blob = new Blob([configOutput.value], { type: "application/json;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = "focus-pose-config.json";
  anchor.click();
  URL.revokeObjectURL(objectUrl);
  setStatusEvent("已生成三轴姿态配置下载。", "success");
}

async function playFocusPreviewEvent(
  preferredDieId: number | string | null = state.selectedDieId,
  { autoSelect = preferredDieId != null }: { autoSelect?: boolean } = {},
): Promise<void> {
  const box = await initCalibratorDiceBoxEvent();
  if (!state.currentDice.length) {
    return;
  }

  if (!autoSelect) {
    selectDieForEditingEvent(null);
  }

  if (hasCompositeDiceGroupsEvent()) {
    const setDieVisualTransform = (targetId: number | string, transform: { position?: { x: number; y: number; z: number }; rotation?: { x: number; y: number; z: number; w: number }; scaleMultiplier?: number }) => {
      (box as unknown as {
        setDieVisualTransform: (id: number | string, payload: { position?: { x: number; y: number; z: number }; rotation?: { x: number; y: number; z: number; w: number }; scaleMultiplier?: number }) => void;
      }).setDieVisualTransform(targetId, transform);
    };
    const getDieFocusRotation = (targetId: number | string, dieType: string | null, resultValue: number | null) => (box as unknown as {
      getDieFocusRotation: (id: number | string, options?: { dieType?: string | null; resultValue?: number | null }) => DicePhysicsState["rotation"] | null;
    }).getDieFocusRotation(targetId, {
      dieType,
      resultValue,
    });

    const groups = getDiceGroupsEvent();
    const groupOffsets = buildFocusGridPositionsEvent(groups.length, COMPOSITE_GROUP_SPACING_X, COMPOSITE_GROUP_SPACING_Y, FOCUS_MAX_PER_ROW);
    const focusScaleMultiplier = getFocusScaleMultiplierEvent(state.currentDice.length, DEFAULT_DICE_FOCUS_SCALE_MULTIPLIER);
    const focusTargets = groups.flatMap((group, groupIndex) => {
      const baseOffset = groupOffsets[groupIndex] ?? { x: 0, y: 0, z: 0 };
      const startX = -((group.members.length - 1) * COMPOSITE_GROUP_PAIR_SPACING_X) / 2;
      return group.members.map((entry, memberIndex) => ({
        ...entry,
        targetPosition: {
          x: DEFAULT_DICE_FOCUS_POSITION.x + baseOffset.x + startX + memberIndex * COMPOSITE_GROUP_PAIR_SPACING_X,
          y: DEFAULT_DICE_FOCUS_POSITION.y + baseOffset.y + getCompositeDieDepthOffsetEvent(entry.pairRole),
          z: DEFAULT_DICE_FOCUS_POSITION.z + baseOffset.z,
        },
        targetRotation: getDieFocusRotation(entry.id, entry.dieType, entry.value) ?? entry.state.rotation,
      }));
    });

    const focusAnimationStartedAt = performance.now();
    let currentFrameAt = focusAnimationStartedAt;
    while (currentFrameAt - focusAnimationStartedAt < DEFAULT_DICE_FOCUS_MOVE_DURATION_MS) {
      const rawProgress = Math.min(1, (currentFrameAt - focusAnimationStartedAt) / DEFAULT_DICE_FOCUS_MOVE_DURATION_MS);
      const easedProgress = easeOutCubicEvent(rawProgress);

      focusTargets.forEach((entry) => {
        const targetScaleMultiplier = focusScaleMultiplier * getCompositeDieScaleRatioEvent(entry.pairRole);
        setDieVisualTransform(entry.id, {
          position: {
            x: lerpEvent(entry.state.position.x, entry.targetPosition.x, easedProgress),
            y: lerpEvent(entry.state.position.y, entry.targetPosition.y, easedProgress),
            z: lerpEvent(entry.state.position.z, entry.targetPosition.z, easedProgress),
          },
          rotation: slerpQuaternionEvent(entry.state.rotation, entry.targetRotation, easedProgress),
          scaleMultiplier: lerpEvent(1, targetScaleMultiplier, easedProgress),
        });
      });

      currentFrameAt = await nextFrameEvent();
    }

    focusTargets.forEach((entry) => {
      setDieVisualTransform(entry.id, {
        position: entry.targetPosition,
        rotation: entry.targetRotation,
        scaleMultiplier: focusScaleMultiplier * getCompositeDieScaleRatioEvent(entry.pairRole),
      });
    });
  } else {
    await animateDiceFocusLayoutEvent({
      box,
      dice: state.currentDice,
      focusPosition: DEFAULT_DICE_FOCUS_POSITION,
      spacingX: FOCUS_SPACING_X,
      spacingY: FOCUS_SPACING_Y,
      maxPerRow: FOCUS_MAX_PER_ROW,
      baseScaleMultiplier: DEFAULT_DICE_FOCUS_SCALE_MULTIPLIER,
      durationMs: DEFAULT_DICE_FOCUS_MOVE_DURATION_MS,
    });
  }

  if (!autoSelect) {
    refreshPanelsEvent();
    return;
  }

  const selectedId = preferredDieId != null && state.currentDice.some((die) => die.id === preferredDieId)
    ? preferredDieId
    : state.currentDice[0]?.id ?? null;
  selectDieForEditingEvent(selectedId);
  refreshPanelsEvent();
}

async function rollUntilTargetFaceEvent(): Promise<void> {
  const box = await initCalibratorDiceBoxEvent();
  const notation = state.selectedDieType === "d100"
    ? { sides: 100, qty: D100_GROUPED_TARGET_COUNT }
    : buildSingleDieNotationEvent(state.selectedDieType);
  const selectedLabel = formatDieResultLabel(state.selectedDieType, state.selectedResultValue);
  setStatusEvent(`正在生成 ${state.selectedDieType.toUpperCase()} 的目标结果面 ${selectedLabel} 预览。`);
  rollTargetButton.disabled = true;
  selectDieForEditingEvent(null);

  try {
    box.show();
    syncPreviewCanvasVisibilityEvent();
    box.clear();
    await box.roll(notation as never);

    const diceMeta = state.selectedDieType === "d100"
      ? resolveFocusedDiceEvent(box)
        .sort((left, right) => String(left.id).localeCompare(String(right.id), undefined, { numeric: true }))
        .slice(0, D100_GROUPED_TARGET_COUNT)
        .flatMap((die, index) => {
          const targetValue = getDieResultOptions("d100")[index] ?? 0;
          const groupLabel = `第${String(index + 1).padStart(2, "0")}组 · ${formatDieResultLabel("d100", targetValue)}`;
          return [
            {
              id: die.id,
              dieType: "d100",
              value: targetValue,
              groupKey: `d100-target-${targetValue}`,
              groupLabel,
              groupOrder: index,
              pairRole: "tens" as const,
              logicalResultValue: targetValue,
            } satisfies CalibrationDieMeta,
            {
              id: getD100PartnerDieIdEvent(die.id),
              dieType: "d10",
              value: 10,
              groupKey: `d100-target-${targetValue}`,
              groupLabel,
              groupOrder: index,
              pairRole: "ones" as const,
              logicalResultValue: targetValue,
            } satisfies CalibrationDieMeta,
          ];
        })
      : resolveFocusedDiceEvent(box).map((die, index) => ({
        id: die.id,
        dieType: die.dieType ?? state.selectedDieType,
        value: index === 0 ? state.selectedResultValue : die.value,
        groupKey: `single-${String(die.id)}`,
        groupLabel: `第${String(index + 1).padStart(2, "0")}组 · ${(die.dieType ?? state.selectedDieType).toUpperCase()}`,
        groupOrder: index,
        pairRole: "single" as const,
        logicalResultValue: index === 0 ? state.selectedResultValue : (typeof die.value === "number" ? die.value : null),
      } satisfies CalibrationDieMeta));

    if (!diceMeta.length) {
      throw new Error("未能生成目标面预览骰子");
    }

    state.currentDice = await waitForStableDiceStateEvent(box, diceMeta);
    state.currentRollValues = state.selectedDieType === "d100"
      ? getDieResultOptions("d100")
      : [state.selectedResultValue];
    state.currentActualDieId = state.currentDice.find((die) => die.dieType === state.selectedDieType && die.logicalResultValue === state.selectedResultValue)?.id ?? diceMeta[0]?.id ?? null;
    state.currentActualResultValue = state.selectedResultValue;
    await playFocusPreviewEvent(null, { autoSelect: false });
    setStatusEvent(
      state.selectedDieType === "d100"
        ? "已显示 D100 的 10 组双骰校准预览：每组包含十位骰与个位骰，点击任意一颗即可进入对应组的调整。"
        : `已直接显示 ${state.selectedDieType.toUpperCase()} 的目标结果面 ${selectedLabel}。如需调整，请点击这颗居中的骰子以显示旋转把手。`,
      "success",
    );
  } catch (error: unknown) {
    setStatusEvent(`显示目标结果面失败：${error instanceof Error ? error.message : String(error)}`, "error");
  } finally {
    rollTargetButton.disabled = false;
    refreshPanelsEvent();
  }
}

async function runDiceTestEvent(): Promise<void> {
  const box = await initCalibratorDiceBoxEvent();
  const notation = resolveTestNotationEvent();
  const notationLabel = formatTestNotationLabelEvent(notation);
  testRollButton.disabled = true;
  setStatusEvent(`正在测试公式 ${notationLabel} 的实际掷骰结果。`);
  selectDieForEditingEvent(null);

  try {
    box.show();
    syncPreviewCanvasVisibilityEvent();
    box.clear();
    await box.roll(notation as never);
    const rollResults = (box as unknown as {
      getRollResults?: () => Array<{ value?: number; modifier?: number; rolls?: Array<{ value?: number }> }>;
    }).getRollResults?.() ?? [];

    const diceMeta = getCurrentDiceMetaEvent(box);
    if (!diceMeta.length) {
      throw new Error("未能读取当前测试结果");
    }

    state.currentDice = await waitForStableDiceStateEvent(box, diceMeta);
    state.currentRollValues = diceMeta
      .filter((die) => die.pairRole !== "ones")
      .map((die) => die.logicalResultValue ?? die.value)
      .filter((value): value is number => typeof value === "number");
    const firstLogicalDie = diceMeta.find((die) => die.pairRole !== "ones") ?? null;
    state.currentActualDieId = firstLogicalDie?.id ?? null;
    state.currentActualResultValue = firstLogicalDie?.logicalResultValue ?? firstLogicalDie?.value ?? null;
    const resultText = buildRollResultsSummaryTextEvent(state.selectedDieType, rollResults);
    state.testHistory = [{ formula: notationLabel, resultText }, ...state.testHistory].slice(0, 8);

    await playFocusPreviewEvent(null, { autoSelect: false });
    setStatusEvent(`公式 ${notationLabel} 本次测试完成。旋转把手已隐藏；请重新点击任意骰子再开始调整。`, "success");
  } catch (error: unknown) {
    setStatusEvent(`骰子测试失败：${error instanceof Error ? error.message : String(error)}`, "error");
  } finally {
    testRollButton.disabled = false;
    refreshPanelsEvent();
  }
}

function handleDieTypeChangeEvent(): void {
  state.selectedDieType = dieTypeSelect.value;
  state.selectedResultValue = getDieResultOptions(state.selectedDieType)[0] ?? 1;
  state.copySourceResultValue = getDieResultOptions(state.selectedDieType).find((value) => value !== state.selectedResultValue) ?? null;
  state.currentDice = [];
  state.currentRollValues = [];
  state.currentActualDieId = null;
  state.currentActualResultValue = null;
  state.selectedDieId = null;
  state.selectedDieTypeForEdit = null;
  state.selectedDieResultValue = null;
  state.selectedPoseEulerDeg = { x: 0, y: 0, z: 0 };
  state.isCurrentPoseSaved = true;
  state.testHistory = [];
  detachRotationGizmoEvent();
  renderResultButtonsEvent();
  refreshPanelsEvent();
  setStatusEvent(`已切换到 ${state.selectedDieType.toUpperCase()}，请选择目标结果面并显示预览。`);
}

function bindEulerInputsEvent(): void {
  const onEulerInput = async (): Promise<void> => {
    await applyPoseToSelectedDieEvent({
      x: Number(eulerXInput.value),
      y: Number(eulerYInput.value),
      z: Number(eulerZInput.value),
    });
  };

  const eulerInputs = [eulerXInput, eulerYInput, eulerZInput];
  eulerInputs.forEach((input) => {
    input.addEventListener("focus", beginEulerInputHistoryCheckpointEvent);
    input.addEventListener("blur", endEulerInputHistoryCheckpointEvent);
  });
  eulerXInput.addEventListener("input", () => void onEulerInput());
  eulerYInput.addEventListener("input", () => void onEulerInput());
  eulerZInput.addEventListener("input", () => void onEulerInput());
}

function bindRotationSnapEvent(): void {
  rotationSnapSelect.addEventListener("change", () => {
    state.rotationSnapDeg = Number(rotationSnapSelect.value || 10);
    applyRotationSnapEvent();
    setStatusEvent(`已切换旋转刻度为 ${state.rotationSnapDeg}°。拖动把手和数值输入都会按该步进工作。`);
  });
}

function bindCoordinateSpaceEvent(): void {
  coordinateSpaceSelect.addEventListener("change", () => {
    state.gizmoCoordinateSpace = coordinateSpaceSelect.value === "global" ? "global" : "local";
    applyGizmoCoordinateSpaceEvent();
    setStatusEvent(
      state.gizmoCoordinateSpace === "global"
        ? "已切换为全局坐标系，把手方向将固定为世界坐标。"
        : "已切换为自身坐标系，把手方向将跟随当前骰子姿态。",
      "success",
    );
  });
}

function bindKeyboardShortcutsEvent(): void {
  document.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement | null;
    const tagName = target?.tagName?.toLowerCase() ?? "";
    const isTypingTarget = Boolean(
      target?.isContentEditable
      || tagName === "input"
      || tagName === "textarea"
      || tagName === "select",
    );
    const isUndoHotkey = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z";
    const isCoordinateToggleHotkey = !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === "q";

    if (isUndoHotkey) {
      if (target === configOutput) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void undoLastCalibrationStepEvent();
      return;
    }

    if (!isCoordinateToggleHotkey || isTypingTarget) {
      return;
    }

    state.gizmoCoordinateSpace = state.gizmoCoordinateSpace === "global" ? "local" : "global";
    coordinateSpaceSelect.value = state.gizmoCoordinateSpace;
    applyGizmoCoordinateSpaceEvent();
    setStatusEvent(
      state.gizmoCoordinateSpace === "global"
        ? "已切换为全局坐标系（快捷键 Q）。"
        : "已切换为自身坐标系（快捷键 Q）。",
      "success",
    );
    event.preventDefault();
    event.stopPropagation();
  }, true);
}

function bindEventsEvent(): void {
  dieTypeSelect.addEventListener("change", handleDieTypeChangeEvent);
  rollTargetButton.addEventListener("click", () => void rollUntilTargetFaceEvent());
  testRollButton.addEventListener("click", () => void runDiceTestEvent());
  replayFocusButton.addEventListener("click", () => void playFocusPreviewEvent(state.selectedDieId, { autoSelect: state.selectedDieId != null }));
  copySourceResultSelect.addEventListener("change", () => {
    const nextValue = Number(copySourceResultSelect.value);
    state.copySourceResultValue = Number.isFinite(nextValue) ? nextValue : null;
  });
  copySourcePoseButton.addEventListener("click", () => void copyPoseFromSourceResultEvent());
  savePoseButton.addEventListener("click", () => void saveCurrentPoseEvent());
  resetPoseButton.addEventListener("click", () => void resetSelectedPoseEvent());
  applyConfigButton.addEventListener("click", () => void applyEditedConfigEvent());
  copyJsonButton.addEventListener("click", () => void copyConfigEvent());
  downloadJsonButton.addEventListener("click", downloadConfigEvent);
  bindEulerInputsEvent();
  bindRotationSnapEvent();
  bindCoordinateSpaceEvent();
  bindKeyboardShortcutsEvent();
}

function initPageEvent(): void {
  applyRotationSnapEvent();
  renderDieTypeSelectEvent();
  renderResultButtonsEvent();
  refreshConfigOutputEvent();
  refreshPanelsEvent();
  bindEventsEvent();
}

initPageEvent();
void initCalibratorDiceBoxEvent();

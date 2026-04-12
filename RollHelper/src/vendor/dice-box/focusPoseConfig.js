import focusPoseConfigJson from './focusPoseConfig.json'

export const DIE_RESULT_OPTIONS = {
	d4: [1, 2, 3, 4],
	d6: [1, 2, 3, 4, 5, 6],
	d8: [1, 2, 3, 4, 5, 6, 7, 8],
	d10: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
	d12: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
	d20: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
	d100: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90],
}

/**
 * 功能：创建一份新的三轴姿态配置副本。
 * @returns {{version:number, dice: Record<string, Record<string, {x:number, y:number, z:number} | null>>}} 可写配置对象。
 */
export function createFocusPoseConfig() {
	return JSON.parse(JSON.stringify(focusPoseConfigJson))
}

/**
 * 功能：返回所有支持三轴校正的骰型列表。
 * @returns {string[]} 骰型名称数组。
 */
export function getSupportedDieTypes() {
	return Object.keys(DIE_RESULT_OPTIONS).filter((dieType) => dieType !== 'd4')
}

/**
 * 功能：返回指定骰型可校正的结果面列表。
 * @param {string} dieType 骰型名称。
 * @returns {number[]} 结果面值数组。
 */
export function getDieResultOptions(dieType) {
	return [...(DIE_RESULT_OPTIONS[dieType] || [])]
}

/**
 * 功能：把运行时结果值规范化为配置键。
 * @param {string|null|undefined} dieType 骰型名称。
 * @param {number|string|null|undefined} resultValue 原始结果值。
 * @returns {string|null} 规范化后的配置键。
 */
export function normalizeDieResultValueKey(dieType, resultValue) {
	if (dieType == null || resultValue == null || resultValue === '') {
		return null
	}

	const numericValue = Number(resultValue)
	if (!Number.isFinite(numericValue)) {
		return null
	}

	if (dieType === 'd100') {
		const normalizedD100Value = numericValue === 100
			? 0
			: Math.max(0, Math.min(90, Math.floor(numericValue / 10) * 10))
		return String(normalizedD100Value)
	}

	if (dieType === 'd10' && numericValue === 0) {
		return '10'
	}

	return String(Math.trunc(numericValue))
}

/**
 * 功能：格式化结果面文案，便于在界面中展示。
 * @param {string} dieType 骰型名称。
 * @param {number|string} resultValue 结果面值。
 * @returns {string} 展示文案。
 */
export function formatDieResultLabel(dieType, resultValue) {
	if (dieType === 'd100' && Number(resultValue) === 0) {
		return '00'
	}
	return String(resultValue)
}

/**
 * 功能：判断指定结果面是否已经配置三轴姿态。
 * @param {{dice?: Record<string, Record<string, {x:number, y:number, z:number} | null>>}|null|undefined} config 姿态配置对象。
 * @param {string|null|undefined} dieType 骰型名称。
 * @param {number|string|null|undefined} resultValue 结果面值。
 * @returns {boolean} 是否已配置。
 */
export function hasDiePoseConfig(config, dieType, resultValue) {
	const key = normalizeDieResultValueKey(dieType, resultValue)
	return Boolean(key && config?.dice?.[dieType]?.[key])
}

/**
 * 功能：读取指定骰型与结果面的三轴姿态值。
 * @param {{dice?: Record<string, Record<string, {x:number, y:number, z:number} | null>>}|null|undefined} config 姿态配置对象。
 * @param {string|null|undefined} dieType 骰型名称。
 * @param {number|string|null|undefined} resultValue 结果面值。
 * @returns {{x:number, y:number, z:number}} 三轴姿态值，单位为度。
 */
export function getDiePoseEulerDeg(config, dieType, resultValue) {
	const key = normalizeDieResultValueKey(dieType, resultValue)
	if (!key || !config?.dice?.[dieType]?.[key]) {
		return { x: 0, y: 0, z: 0 }
	}

	const pose = config.dice[dieType][key]
	return {
		x: Number.isFinite(pose.x) ? pose.x : 0,
		y: Number.isFinite(pose.y) ? pose.y : 0,
		z: Number.isFinite(pose.z) ? pose.z : 0,
	}
}

/**
 * 功能：写入指定骰型与结果面的三轴姿态值。
 * @param {{dice?: Record<string, Record<string, {x:number, y:number, z:number} | null>>}} config 可写姿态配置对象。
 * @param {string} dieType 骰型名称。
 * @param {number|string} resultValue 结果面值。
 * @param {{x:number, y:number, z:number} | null} poseEulerDeg 三轴姿态值；传空值表示清空配置。
 * @returns {void}
 */
export function setDiePoseEulerDeg(config, dieType, resultValue, poseEulerDeg) {
	const key = normalizeDieResultValueKey(dieType, resultValue)
	if (!key) {
		return
	}

	if (!config.dice) {
		config.dice = {}
	}

	if (!config.dice[dieType]) {
		config.dice[dieType] = {}
	}

	if (
		!poseEulerDeg
		|| !Number.isFinite(poseEulerDeg.x)
		|| !Number.isFinite(poseEulerDeg.y)
		|| !Number.isFinite(poseEulerDeg.z)
	) {
		config.dice[dieType][key] = null
		return
	}

	config.dice[dieType][key] = {
		x: poseEulerDeg.x,
		y: poseEulerDeg.y,
		z: poseEulerDeg.z,
	}
}

/**
 * 功能：生成姿态配置的格式化 JSON 文本。
 * @param {{version:number, dice: Record<string, Record<string, {x:number, y:number, z:number} | null>>}} config 姿态配置对象。
 * @returns {string} 已格式化的 JSON 字符串。
 */
export function stringifyFocusPoseConfig(config) {
	return JSON.stringify(config, null, 2)
}

export const defaultFocusPoseConfig = createFocusPoseConfig()

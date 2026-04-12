import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { createEngine } from './world/engine'
import { createScene } from './world/scene'
import { createCamera } from './world/camera'
import { createLights } from './world/lights'
import Container from './Container'
import Dice from './Dice'
import ThemeLoader from './ThemeLoader'
import {
	defaultFocusPoseConfig,
	getDiePoseEulerDeg,
	normalizeDieResultValueKey,
} from '../focusPoseConfig'

/**
 * 功能：把三轴姿态值（欧拉角 XYZ，单位度）转换为四元数。
 * @param {{x:number, y:number, z:number}} poseEulerDeg 三轴姿态值，单位为度。
 * @returns {{x:number, y:number, z:number, w:number}} 对应的四元数。
 */
export function createQuaternionFromPoseEuler(poseEulerDeg) {
	const quaternion = Quaternion.FromEulerAngles(
		poseEulerDeg.x * Math.PI / 180,
		poseEulerDeg.y * Math.PI / 180,
		poseEulerDeg.z * Math.PI / 180
	)
	return {
		x: quaternion.x,
		y: quaternion.y,
		z: quaternion.z,
		w: quaternion.w
	}
}

/**
 * 功能：把四元数转换为欧拉角 XYZ（单位度）。
 * @param {{x:number, y:number, z:number, w:number}} quat 四元数。
 * @returns {{x:number, y:number, z:number}} 欧拉角，单位为度。
 */
export function quaternionToEulerDeg(quat) {
	const q = new Quaternion(quat.x, quat.y, quat.z, quat.w)
	const euler = q.toEulerAngles()
	return {
		x: euler.x * 180 / Math.PI,
		y: euler.y * 180 / Math.PI,
		z: euler.z * 180 / Math.PI,
	}
}

class WorldOnscreen {
	config
	initialized = false
	#dieCache = {}
	#count = 0
	#sleeperCount = 0
	#dieRollTimer = []
	#canvas
	#engine
	#scene
	#camera
	#lights
	#container
	#themeLoader
	#physicsWorkerPort
	#meshList = {}
	#rollGeneration = 0
	noop = () => {}
	diceBufferView = new Float32Array(8000)

	constructor(options){
		this.onInitComplete = options.onInitComplete || this.noop
		this.onThemeLoaded = options.onThemeLoaded || this.noop
		this.onRollResult = options.onRollResult || this.noop
		this.onRollComplete = options.onRollComplete || this.noop
		this.onDieRemoved = options.onDieRemoved || this.noop
		this.initialized = this.initScene(options)
	}
	
	// initialize the babylon scene
	async initScene(config) {
		this.#canvas  = config.canvas
		this.#canvas.width = config.width
		this.#canvas.height = config.height
	
		// set the config from World
		this.config = config.options
	
		// setup babylonJS scene
		this.#engine  = createEngine(this.#canvas )
		this.#scene = createScene({engine:this.#engine })
		this.#camera  = createCamera({engine:this.#engine, scene: this.#scene})
		this.#lights  = createLights({
			enableShadows: this.config.enableShadows,
			shadowTransparency: this.config.shadowTransparency,
			intensity: this.config.lightIntensity,
			scene: this.#scene
		})
	
		// create the box that provides surfaces for shadows to render on
		this.#container  = new Container({
			enableShadows: this.config.enableShadows,
			aspect: this.#canvas.width / this.#canvas.height,
			lights: this.#lights,
			scene: this.#scene
		})
		
		this.#themeLoader = new ThemeLoader({scene: this.#scene})

		// init complete - let the world know
		this.onInitComplete()
	}

	connect(port){
		this.#physicsWorkerPort = port

		this.#physicsWorkerPort.postMessage({
			action: "initBuffer",
			diceBuffer: this.diceBufferView.buffer
		}, [this.diceBufferView.buffer])

		this.#physicsWorkerPort.onmessage = (e) => {
			switch (e.data.action) {
				case "updates": // dice status/position updates from physics worker
					this.updatesFromPhysics(e.data.diceBuffer)
					break;
			
				default:
					console.error("action from physicsWorker not found in offscreen worker")
					break;
			}
		}
	}

	updateConfig(options){
		const prevConfig = this.config
		this.config = options
		// check if shadows setting has changed
		if(prevConfig.enableShadows !== this.config.enableShadows) {
			// regenerate the lights
			Object.values(this.#lights ).forEach(light => light.dispose())
			this.#lights = createLights(
				{
					enableShadows: this.config.enableShadows,
					shadowTransparency: this.config.shadowTransparency,
					intensity: this.config.lightIntensity,
					scene: this.#scene
				}
			)
		}
		if(prevConfig.scale !== this.config.scale) {
			Object.values(this.#dieCache).forEach(({mesh}) => {
				if(mesh){
					const {x = 1,y = 1,z = 1} = mesh?.metadata?.baseScale
					mesh.scaling = new Vector3(
						this.config.scale * x,
						this.config.scale * y,
						this.config.scale * z
					)
				}
			})
		}
		if(prevConfig.shadowTransparency !== this.config.shadowTransparency) {
			this.#lights.directional.shadowGenerator.darkness = this.config.shadowTransparency
		}
		if(prevConfig.lightIntensity !== this.config.lightIntensity) {
			this.#lights.directional.intensity = .65 * this.config.lightIntensity
			this.#lights.hemispheric.intensity = .4 * this.config.lightIntensity
		}
	}

	/**
	 * 功能：恢复物理模拟与渲染循环。
	 * @param {boolean} newStartPoint 是否重新选择起始抛投点。
	 * @returns {void}
	 */
	resumeSimulation(newStartPoint = false) {
		if(this.#engine.activeRenderLoops.length === 0) {
			this.render(newStartPoint)
			return
		}

		this.#physicsWorkerPort.postMessage({
			action: "resumeSimulation",
			newStartPoint
		})
	}

	/**
	 * 功能：立即同步单颗骰子的显示位姿。
	 * @param {{id:number|string, position?:{x:number,y:number,z:number}, rotation?:{x:number,y:number,z:number,w:number}, scaleMultiplier?: number}} data 骰子位姿数据。
	 * @returns {void}
	 */
	setDieTransform(data) {
		const die = this.#dieCache[`${data.id}`]
		if(!die?.mesh) {
			return
		}

		if(data.position) {
			die.mesh.position.set(data.position.x, data.position.y, data.position.z)
		}

		if(data.rotation) {
			if(!die.mesh.rotationQuaternion) {
				die.mesh.rotationQuaternion = Quaternion.Identity()
			}
			die.mesh.rotationQuaternion.set(
				data.rotation.x,
				data.rotation.y,
				data.rotation.z,
				data.rotation.w
			)
		}

		if(data.scaleMultiplier) {
			const {x = 1, y = 1, z = 1} = die.mesh?.metadata?.baseScale || {}
			die.mesh.scaling = new Vector3(
				this.config.scale * x * data.scaleMultiplier,
				this.config.scale * y * data.scaleMultiplier,
				this.config.scale * z * data.scaleMultiplier
			)
		}

		this.#scene.render()
	}

	/**
	 * 功能：返回当前渲染场景，供测试页挂载旋转把手。
	 * @returns {import("@babylonjs/core").Scene | null} 当前场景实例。
	 */
	getScene() {
		return this.#scene || null
	}

	/**
	 * 功能：返回指定骰子的显示网格，供测试页挂载旋转把手。
	 * @param {number|string} id 骰子唯一标识。
	 * @returns {import("@babylonjs/core").Nullable<import("@babylonjs/core").TransformNode>} 骰子网格。
	 */
	getDieMesh(id) {
		return this.#dieCache[`${id}`]?.mesh || null
	}

	/**
	 * 功能：返回指定骰子的运行时数据，供校准页读取复合骰分组信息。
	 * @param {number|string} id 骰子唯一标识。
	 * @returns {{id:number|string, dieType:string|null, value:number|null, hasPartner:boolean, parentId:number|string|null}|null} 运行时数据快照。
	 */
	getDieData(id) {
		const die = this.#dieCache[`${id}`]
		if(!die) {
			return null
		}

		return {
			id: die.id,
			dieType: die.dieType ?? die?.config?.dieType ?? null,
			value: Number.isFinite(die.value) ? die.value : null,
			hasPartner: Boolean(die.d10Instance),
			parentId: die?.dieParent?.id ?? null,
		}
	}

	/**
	 * 功能：计算聚焦阶段用于显示摆正的目标四元数。
	 * 输入为骰型与结果值，直接查三轴姿态配置并转换为四元数。
	 * @param {number|string} id 骰子唯一标识。
	 * @param {{dieType?: string|null, resultValue?: number|string|null, poseEulerDeg?: {x:number, y:number, z:number}|null}=} options 额外的骰型、结果与三轴姿态配置。
	 * @returns {{rotation:{x:number,y:number,z:number,w:number}, poseEulerDeg:{x:number,y:number,z:number}, resultKey:string|null}|null} 聚焦快照。
	 */
	getDieFocusSnapshot(id, options = {}) {
		const die = this.#dieCache[`${id}`]
		if(!die?.mesh?.rotationQuaternion) {
			return null
		}

		const {
			dieType = null,
			resultValue = null,
			poseEulerDeg = null,
		} = options

		if(dieType === 'd4') {
			return {
				rotation: {
					x: die.mesh.rotationQuaternion.x,
					y: die.mesh.rotationQuaternion.y,
					z: die.mesh.rotationQuaternion.z,
					w: die.mesh.rotationQuaternion.w
				},
				poseEulerDeg: { x: 0, y: 0, z: 0 },
				resultKey: normalizeDieResultValueKey(dieType, resultValue)
			}
		}
		const resolvedPoseEulerDeg = poseEulerDeg ?? getDiePoseEulerDeg(defaultFocusPoseConfig, dieType, resultValue)
		const targetRotation = createQuaternionFromPoseEuler(resolvedPoseEulerDeg)

		return {
			rotation: targetRotation,
			poseEulerDeg: { ...resolvedPoseEulerDeg },
			resultKey: normalizeDieResultValueKey(dieType, resultValue)
		}
	}

	/**
	 * 功能：计算聚焦阶段用于显示摆正的目标旋转四元数。
	 * @param {number|string} id 骰子唯一标识。
	 * @param {{dieType?: string|null, resultValue?: number|string|null, poseEulerDeg?: {x:number,y:number,z:number}|null}=} options 额外配置。
	 * @returns {{x:number,y:number,z:number,w:number}|null} 目标四元数。
	 */
	getDieFocusRotation(id, options = {}) {
		return this.getDieFocusSnapshot(id, options)?.rotation ?? null
	}

	// all this does is start the render engine.
	render(newStartPoint) {
		// document.body.addEventListener('click',()=>engine.stopRenderLoop())
		this.#engine.runRenderLoop(this.renderLoop.bind(this))
		this.#physicsWorkerPort.postMessage({
			action: "resumeSimulation",
			newStartPoint
		})
	}

	renderLoop() {
		// if no dice are awake then stop the render loop and save some CPU power
		if(this.#sleeperCount && this.#sleeperCount === Object.keys(this.#dieCache).length) {
			// console.log(`no dice moving`)
			this.#engine.stopRenderLoop()

			// stop the physics engine
			this.#physicsWorkerPort.postMessage({
				action: "stopSimulation",
			})

			// trigger callback that roll is complete
			this.onRollComplete()
		}
		// otherwise keep on rendering
		else {
			this.#scene.render() // not the same as this.render()
		}
	}

	async loadTheme(options) {
		// await loadTheme(theme, this.config.origin + this.config.assetPath, this.#scene)
		const {theme, basePath, material, meshFilePath, meshName} = options
		// load the textures and create the materials needed for this theme
		await this.#themeLoader.load({theme,basePath,material})
	
		// Load the 3D meshes declared by the theme and return the collider mesh data to be passed on to the physics worker
		// don't load same models twice
		if(!Object.keys(this.#meshList).includes(meshName)){
			this.#meshList[meshName] = meshFilePath
			const colliders = await Dice.loadModels({meshFilePath,meshName}, this.#scene)

			if(!colliders){
				throw new Error("No colliders returned from the 3D mesh file. Low poly colliders are expected to be in the same file as the high poly dice and the mesh name contains the word 'collider'")
			}
		
			this.#physicsWorkerPort.postMessage({
				action: "loadModels",
				options: {
					colliders,
					meshName
				}
			})
		}

		this.onThemeLoaded({id: theme})
	}

	clear() {
		this.#rollGeneration++
		this.#dieRollTimer.forEach(timer=>clearTimeout(timer))
		this.#dieRollTimer = []
		if(!Object.keys(this.#dieCache).length && !this.#sleeperCount) {
			return
		}
		if(this.diceBufferView.byteLength){
			this.diceBufferView.fill(0)
		}
		// stop anything that's currently rendering
		this.#engine.stopRenderLoop()
		// remove all dice
		Object.values(this.#dieCache).forEach(die => {
			if(die.mesh)
				die.mesh.dispose()
		})
		
		// reset storage
		this.#dieCache = {}
		this.#count = 0
		this.#sleeperCount = 0

		// step the animation forward
		this.#scene.render()
	}

	add(options) {
		const rollGeneration = this.#rollGeneration
		// loadDie allows you to specify sides(dieType) and theme and returns the options you passed in
		Dice.loadDie(options, this.#scene).then(resp => {
			if(rollGeneration !== this.#rollGeneration) {
				return
			}
			// space out adding the dice so they don't lump together too much
			this.#dieRollTimer.push(setTimeout(() => {
				if(rollGeneration !== this.#rollGeneration) {
					return
				}
				this.#add(resp, rollGeneration)
			}, this.#count++ * this.config.delay))
		})
	}

	addNonDie(die){
		const rollGeneration = this.#rollGeneration
		if(this.#engine.activeRenderLoops.length === 0) {
			this.render(false)
		}
		const {id, value, ...rest} = die
		const newDie = {
			id,
			value,
			config: rest
		}
		this.#dieCache[id] = newDie
		
		// double timeout to ensure any real dice have a chance to queue up and rollResults isn't triggered right away
		setTimeout(()=>{
			if(rollGeneration !== this.#rollGeneration) {
				return
			}
			this.#dieRollTimer.push(setTimeout(() => {
				if(rollGeneration !== this.#rollGeneration) {
					return
				}
				this.handleAsleep(newDie)
			}, this.#count++ * this.config.delay))
		}, 10)
	}

	// add a die to the scene
	async #add(options, rollGeneration = this.#rollGeneration) {
		if(rollGeneration !== this.#rollGeneration) {
			return null
		}
		if(this.#engine.activeRenderLoops.length === 0) {
			this.render(options.newStartPoint)
		}
		const diceOptions = {
			...options,
			assetPath: this.config.assetPath,
			enableShadows: this.config.enableShadows,
			scale: this.config.scale,
			lights: this.#lights,
		}
		
		const newDie = new Dice(diceOptions, this.#scene)
		
		// save the die just created to the cache
		this.#dieCache[newDie.id] = newDie
		
		// tell the physics engine to roll this die type - which is a low poly collider
		this.#physicsWorkerPort.postMessage({
			action: "addDie",
			options: {
				sides: options.sides,
				scale: this.config.scale,
				id: newDie.id,
				newStartPoint: options.newStartPoint,
				theme: options.theme,
				meshName: options.meshName,
			}
		})
	
		// for d100's we need to add an additional d10 and pair it up with the d100 just created
		if(options.sides === 100 && options.data !== 'single') {
			// assign the new die to a property on the d100 - spread the options in order to pass a matching theme
			const d10Options = await Dice.loadDie({...diceOptions, dieType: 'd10', sides: 10, id: newDie.id + 10000}, this.#scene)
			if(rollGeneration !== this.#rollGeneration) {
				return null
			}
			newDie.d10Instance = new Dice(d10Options, this.#scene)
			// identify the parent of this d10 so we can calculate the roll result later
			newDie.d10Instance.dieParent = newDie
			// add the d10 to the cache and ask the physics worker for a collider
			this.#dieCache[`${newDie.d10Instance.id}`] = newDie.d10Instance
			this.#physicsWorkerPort.postMessage({
				action: "addDie",
				options: {
					sides: 10,
					scale: this.config.scale,
					id: newDie.d10Instance.id,
					theme: options.theme,
					meshName: options.meshName
				}
			})
		}
	
		// return the die instance
		return newDie
	
	}
	
	remove(data) {
	// TODO: test this with exploding dice
	const dieData = this.#dieCache[data.id]
	
	// check if this is d100 and remove associated d10 first
	if(dieData.hasOwnProperty('d10Instance')){
		// remove die
		if(this.#dieCache[dieData.d10Instance.id].mesh){
			this.#dieCache[dieData.d10Instance.id].mesh.dispose()

			// remove d10 physics body just for d100 items
			this.#physicsWorkerPort.postMessage({
				action: "removeDie",
				id: dieData.d10Instance.id
			})
		}
		// delete entry
		delete this.#dieCache[dieData.d10Instance.id]
		// decrement count
		this.#sleeperCount--
	}

	// remove die
	if(this.#dieCache[data.id].mesh){
		this.#dieCache[data.id].mesh.dispose()
	}
	// delete entry
	delete this.#dieCache[data.id]
	// decrement count
	this.#sleeperCount--

	// step the animation forward
	this.#scene.render()

	this.onDieRemoved(data.rollId)
}
	
	updatesFromPhysics(buffer) {
		this.diceBufferView = new Float32Array(buffer)
		let bufferIndex = 1

		// loop will be based on diceBufferView[0] value which is the bodies length in physics.worker
	for (let i = 0, len = this.diceBufferView[0]; i < len; i++) {
		if(!Object.keys(this.#dieCache).length){
			continue
		}
		const die = this.#dieCache[`${this.diceBufferView[bufferIndex]}`]
		if(!die) {
			console.log("Error: die not available in scene to animate")
			break
		}
		// if the first position index is -1 then this die has been flagged as asleep
		if(this.diceBufferView[bufferIndex + 1] === -1) {
			this.handleAsleep(die)
		} else {
			const px = this.diceBufferView[bufferIndex + 1]
			const py = this.diceBufferView[bufferIndex + 2]
			const pz = this.diceBufferView[bufferIndex + 3]
			const qx = this.diceBufferView[bufferIndex + 4]
			const qy = this.diceBufferView[bufferIndex + 5]
			const qz = this.diceBufferView[bufferIndex + 6]
			const qw = this.diceBufferView[bufferIndex + 7]

			die.mesh.position.set(px, py, pz)
			die.mesh.rotationQuaternion.set(qx, qy, qz, qw)
		}

		bufferIndex = bufferIndex + 8
	}

	// transfer the buffer back to physics worker
	requestAnimationFrame(()=>{
		this.#physicsWorkerPort.postMessage({
			action: "stepSimulation",
			diceBuffer: this.diceBufferView.buffer
		}, [this.diceBufferView.buffer])
	})
	}
	
	// handle the position updates from the physics worker. It's a simple flat array of numbers for quick and easy transfer
	async handleAsleep(die){
		// mark this die as asleep
		die.asleep = true
	
		// get the roll result for this die
		await Dice.getRollResult(die, this.#scene)
	
		if(die.d10Instance || die.dieParent) {
			// if one of the pair is asleep and the other isn't then it falls through without getting the roll result
			// otherwise both dice in the d100 are asleep and ready to calc their roll result
			if(die?.d10Instance?.asleep || die?.dieParent?.asleep) {
				const d100 = die.config.sides === 100 ? die : die.dieParent
				const d10 = die.config.sides === 10 ? die : die.d10Instance
				if(d100.rawValue){
					// this die is being processed again for some reason, probably a physics ineration that woke it before it was immobilized
					d100.value = d100.rawValue
				}
				// save the original value
				d100.rawValue = d100.value

				d100.value = d100.value + d10.value
	
				this.onRollResult({
					rollId: d100.config.rollId,
					value : d100.value
				})
			}
		} else {
			// turn 0's on a d10 into a 10
			if(die.config.sides === 10 && die.value === 0) {
				die.value = 10
			}
			this.onRollResult({
				rollId: die.config.rollId,
				value: die.value
			})
		}
		// add to the sleeper count
		this.#sleeperCount++
	}
	
	resize(options) {
		// redraw the dicebox
		const width = this.#canvas.width = options.width
		const height = this.#canvas.height = options.height
		this.#container.create({aspect: width / height})
		this.#engine.resize()
	}
}

export default WorldOnscreen

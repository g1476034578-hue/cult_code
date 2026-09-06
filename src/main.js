import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import './style.css'
import { createPlayUI } from './play-ui.js'
import { pressureAt, roundShouldEnd, nearestHearts } from './gameplay.js'
import { renderPixelRatio, middleHeartLayout } from './scene-layout.js'

const assetUrl = path => `${import.meta.env.BASE_URL}${path}`
const DEBUG_MODE = import.meta.env.DEV && new URLSearchParams(location.search).has('debug')
const PERF_LOG_ENABLED = DEBUG_MODE && import.meta.env.DEV
// Compressed models are the default; originals remain available for local comparison.
const MODEL_DIRECTORY = import.meta.env.DEV && new URLSearchParams(location.search).has('originalModels')
  ? assetUrl('models') : assetUrl('models-mobile')

const CONFIG = {
  NORMAL_DURATION: 8000, FREEZE_DURATION: 2000, SHOCK_DURATION: 3000,
  WARNING_DURATION: 3000, GAME_DURATION: 12000, OVERLOAD_START_TIME: 8200,
  ENGULFED_HOLD_DURATION: 2600, REVEAL_DURATION: 5200,
  OCEAN_TRANSITION_DURATION: 1100,
  GETUP_ANIMATION_SPEED: .5,
  BIG_SCENE_CHARACTER_SCALE: .15,
  HEART_OCEAN_COUNT: 15,
  HEARTS_PER_DIG: 3,
  DIG_COUNT_TO_REVEAL: 5,
  HEART_OCEAN_WIDTH: 20,
  HEART_OCEAN_DEPTH: 20,
  HEART_PILE_HEIGHT_RATIO: .82,
  OCEAN_CHARACTER_Y_OFFSET: -2.6,
  OCEAN_CHARACTER_BURIED_RATIO: .76,
  OCEAN_CAMERA_POSITION: new THREE.Vector3(0, 5.1, 13.5),
  OCEAN_CAMERA_TARGET: new THREE.Vector3(0, .62, -1.2),
  HEART_SPAWN_RATE_START: 1.1, HEART_SPAWN_RATE_END: 18,
  HEART_SPAWN_RATE_ENGULFED: 32, ENGULFED_SPAWN_DURATION: 1700,
  HEART_SPEED_MIN: 95, HEART_SPEED_MAX: 190,
  POP_DURATION: 300, BURST_PARTICLE_COUNT: [4, 8], PILE_MAX_HEIGHT: 82,
  BACKGROUND_TINT_STRENGTH: .88, GLOBAL_GRAIN_OPACITY: .13,
  VIGNETTE_STRENGTH: .78, MAX_ACTIVE_HEARTS: 70,
  NORMAL_MODEL_PATH: `${MODEL_DIRECTORY}/character_v02.glb`,
  SCARED_MODEL_PATH: `${MODEL_DIRECTORY}/character_scared_v03.glb`,
  MOTION_MODEL_PATH: `${MODEL_DIRECTORY}/character_motion.glb`,
  SHOVEL_MODEL_PATH: `${MODEL_DIRECTORY}/shovel.glb`
}

const HEARTS = [
  { src: assetUrl('hearts/haert_normal.webp'), weight: 35, type: 'normal' },
  { src: assetUrl('hearts/heart_thin.webp'), weight: 20, type: 'thin' },
  { src: assetUrl('hearts/haert_push.webp'), weight: 15, type: 'push' },
  { src: assetUrl('hearts/heart_pink.webp'), weight: 15, type: 'pink' },
  { src: assetUrl('hearts/heart_big.webp'), weight: 15, type: 'big' }
]
const GETUP_HEARTS = HEARTS.map(asset => ({
  ...asset,
  src: asset.src.replace(/\.svg$/, '.webp')
}))
const PILE_HEARTS = HEARTS.filter(item => ['normal', 'push', 'big'].includes(item.type))
const OCEAN_HEARTS = GETUP_HEARTS.filter(item => ['normal', 'push', 'big', 'pink'].includes(item.type))
const HEART_WEIGHT_TOTAL = HEARTS.reduce((sum, item) => sum + item.weight, 0)
const PILE_HEART_WEIGHT_TOTAL = PILE_HEARTS.reduce((sum, item) => sum + item.weight, 0)
const STATES = Object.freeze({ NORMAL: 'NORMAL', FREEZE: 'FREEZE', SHOCK: 'SHOCK', HANDS_WARNING: 'HANDS_WARNING', HEART_GAME: 'HEART_GAME', OVERLOAD: 'OVERLOAD', ENGULFED: 'ENGULFED', HELP: 'HELP', DIGGING: 'DIGGING', REVEAL: 'REVEAL', OCEAN_TRANSITION: 'OCEAN_TRANSITION', HEART_OCEAN: 'HEART_OCEAN' })

const STORY_TIMES = Object.freeze({
  NORMAL: 0,
  HANDS_WARNING: CONFIG.NORMAL_DURATION,
  SHOCK: CONFIG.NORMAL_DURATION + CONFIG.FREEZE_DURATION,
  HEART_GAME: CONFIG.NORMAL_DURATION + CONFIG.FREEZE_DURATION + CONFIG.SHOCK_DURATION,
  OVERLOAD: CONFIG.NORMAL_DURATION + CONFIG.FREEZE_DURATION + CONFIG.SHOCK_DURATION + CONFIG.OVERLOAD_START_TIME,
  FULL_COVER: CONFIG.NORMAL_DURATION + CONFIG.FREEZE_DURATION + CONFIG.SHOCK_DURATION + CONFIG.GAME_DURATION,
  CAMERA_PULLBACK: CONFIG.NORMAL_DURATION + CONFIG.FREEZE_DURATION + CONFIG.SHOCK_DURATION + CONFIG.GAME_DURATION + CONFIG.ENGULFED_HOLD_DURATION,
  HEART_OCEAN: CONFIG.NORMAL_DURATION + CONFIG.FREEZE_DURATION + CONFIG.SHOCK_DURATION + CONFIG.GAME_DURATION + CONFIG.ENGULFED_HOLD_DURATION + CONFIG.OCEAN_TRANSITION_DURATION,
  DIGGING: CONFIG.NORMAL_DURATION + CONFIG.FREEZE_DURATION + CONFIG.SHOCK_DURATION + CONFIG.GAME_DURATION + CONFIG.ENGULFED_HOLD_DURATION + CONFIG.OCEAN_TRANSITION_DURATION + 3000,
  REVEAL: CONFIG.NORMAL_DURATION + CONFIG.FREEZE_DURATION + CONFIG.SHOCK_DURATION + CONFIG.GAME_DURATION + CONFIG.ENGULFED_HOLD_DURATION + CONFIG.OCEAN_TRANSITION_DURATION + 9000,
  TABLEAU: CONFIG.NORMAL_DURATION + CONFIG.FREEZE_DURATION + CONFIG.SHOCK_DURATION + CONFIG.GAME_DURATION + CONFIG.ENGULFED_HOLD_DURATION + CONFIG.OCEAN_TRANSITION_DURATION + 13500
})
const STORY_DURATION = STORY_TIMES.TABLEAU + 2500

const storyClock = {
  time: 0,
  rate: 1,
  playing: false,
  lastRealTime: performance.now(),
  tick(realTime) {
    const realDelta = Math.min((realTime - this.lastRealTime) / 1000, .05)
    this.lastRealTime = realTime
    if (!this.playing || !timelineReady) return 0
    const storyDelta = realDelta * this.rate
    this.time += storyDelta * 1000
    return storyDelta
  }
}

document.body.insertAdjacentHTML('afterbegin', `
  <div class="backgrounds" aria-hidden="true"><img class="background background-one" src="${assetUrl('svg/background1.svg')}" alt=""><img class="background background-two" src="${assetUrl('svg/background2.svg')}" alt=""></div>
  <div class="warning-hands" aria-hidden="true">
    <div class="warning-hand warning-hand-left"><img class="warning-hand-glow" src="${assetUrl('svg/hand-tear-left.svg')}" alt=""><img class="warning-hand-main" src="${assetUrl('svg/hand-tear-left.svg')}" alt=""></div>
    <div class="warning-hand warning-hand-right"><img class="warning-hand-glow" src="${assetUrl('svg/hand-tear-right.svg')}" alt=""><img class="warning-hand-main" src="${assetUrl('svg/hand-tear-right.svg')}" alt=""></div>
  </div>
  <div class="mouse-guide" aria-label="点击开始控制人物">
    <img class="mouse-guide-top" src="${assetUrl('ui/mouse.webp')}" alt="移动鼠标">
    <button class="mouse-guide-button" type="button" aria-label="开始"><img src="${assetUrl('ui/mouse_botton.webp')}" alt="点击开始"></button>
  </div>
  <img class="warning-pop" src="${assetUrl('ui/warning_pop.webp')}" alt="警告">
  <div class="dig-guide" aria-live="polite">
    <img class="help-pop" src="${assetUrl('ui/help.webp')}" alt="需要帮助">
    <img class="figure-pointer" src="${assetUrl('ui/figure.webp')}" alt="点击铲子">
  </div>
  <div class="heart-field" aria-hidden="true"><canvas></canvas></div><div class="heart-layer heart-layer-back" aria-hidden="true"><canvas></canvas></div><div class="heart-layer heart-layer-mid"><canvas></canvas></div><div class="heart-pile" aria-hidden="true"><canvas></canvas></div><div class="heart-layer heart-layer-front" aria-hidden="true"><canvas></canvas></div><div class="engulf-cover" aria-hidden="true"><canvas></canvas></div>
  <div class="warning" role="status"><strong>WARNING！！！</strong><span>小心，上面！点击清除。</span></div><div class="score" aria-label="Score">0</div>
  <div class="red-wash" aria-hidden="true"></div><div class="vignette" aria-hidden="true"></div><div class="global-grain" aria-hidden="true"></div>
  <div class="scene-transition" aria-hidden="true"></div>
  <div class="final-heart-art final-heart-art-back" aria-hidden="true"><img src="${assetUrl('hearts/back_hearts.png')}" alt=""></div>
  <div class="heart-ocean-dom heart-ocean-middle" aria-hidden="true"><canvas></canvas></div>
  <div class="final-heart-art final-heart-art-front" aria-hidden="true"><img src="${assetUrl('hearts/fornt_haerts.png')}" alt=""></div>
  <aside class="debug-time-panel" aria-label="开发时间控制器">
    <div class="debug-time-row"><button type="button" data-debug-action="play">Pause</button><button type="button" data-debug-action="restart">Restart</button><output class="debug-time-readout">00:00.0 / 00:00.0</output></div>
    <input class="debug-timeline" type="range" min="0" max="${STORY_DURATION}" step="10" value="0" aria-label="剧情时间轴">
    <div class="debug-time-row debug-rates">${[.5, 1, 2, 4].map(rate => `<button type="button" data-debug-rate="${rate}" class="${rate === 1 ? 'is-active' : ''}">${rate}x</button>`).join('')}</div>
    <div class="debug-jumps">${['NORMAL', 'HANDS_WARNING', 'SHOCK', 'HEART_GAME', 'OVERLOAD', 'FULL_COVER', 'CAMERA_PULLBACK', 'HEART_OCEAN', 'DIGGING', 'REVEAL'].map(name => `<button type="button" data-debug-jump="${name}">${name}</button>`).join('')}</div>
  </aside>
`)
if (!DEBUG_MODE) document.querySelector('.debug-time-panel')?.remove()
const layers = { back: document.querySelector('.heart-layer-back'), mid: document.querySelector('.heart-layer-mid'), front: document.querySelector('.heart-layer-front'), pile: document.querySelector('.heart-pile'), cover: document.querySelector('.engulf-cover'), field: document.querySelector('.heart-field') }
const canvasLayers = Object.fromEntries(Object.entries(layers).map(([name, layer]) => [name, { canvas: layer.querySelector('canvas'), context: layer.querySelector('canvas').getContext('2d') }]))
const scoreElement = document.querySelector('.score')
const mouseGuide = document.querySelector('.mouse-guide')
const oceanCanvasLayers = [...document.querySelectorAll('.heart-ocean-dom canvas')].map(canvas => ({ canvas, context: canvas.getContext('2d') }))

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, .1, 100)
camera.position.set(0, 1.5, 5)
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
renderer.setSize(innerWidth, innerHeight)
renderer.setPixelRatio(renderPixelRatio(innerWidth, innerHeight, window.devicePixelRatio))
document.body.appendChild(renderer.domElement)
const shovelScene = new THREE.Scene()
const shovelRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
shovelRenderer.setSize(innerWidth, innerHeight)
shovelRenderer.setPixelRatio(renderPixelRatio(innerWidth, innerHeight, window.devicePixelRatio))
shovelRenderer.domElement.className = 'shovel-canvas'
document.body.appendChild(shovelRenderer.domElement)
scene.add(new THREE.AmbientLight(0xffffff, 2))
const keyLight = new THREE.DirectionalLight(0xffffff, 3); keyLight.position.set(3, 5, 4); scene.add(keyLight)
shovelScene.add(new THREE.AmbientLight(0xffffff, 2))
const shovelKeyLight = new THREE.DirectionalLight(0xffffff, 3); shovelKeyLight.position.set(3, 5, 4); shovelScene.add(shovelKeyLight)
const redLight = new THREE.PointLight(0xff334f, 0, 8); redLight.position.set(0, 1, 2.2); scene.add(redLight)
const characterRig = new THREE.Group(); scene.add(characterRig)
const loader = new GLTFLoader()
loader.setMeshoptDecoder(MeshoptDecoder)

let normalCharacter, scaredCharacter, motionCharacter, motionMixer, shovel, shovelBaseScale = 1, head, eye_l, eye_r
let shovelViewportPositioned = false, shovelBasePosition = null, motionFinalBasePosition = null
let heartOcean, oceanCharacterHeight = 1, oceanAnimationFinishedHandler
let finalMotionFinished = false
let oceanSceneEntered = false
const storyEvents = []
let state = STATES.NORMAL, stateStartedAt = 0, gameStartedAt = 0
let timelineReady = false
let spawnBudget = 0, score = 0, pileCount = 0, staticLayersDirty = true, oceanCanvasesDirty = true, dynamicLayersWereDrawn = false
let responsive = null
let assetsReady = false, shovelEquipped = false, completed = false, manualPaused = false
let roundPressure = 0, roundSeconds = 0, digActions = 0, rescueTarget = 15
let combo = 0, bestCombo = 0, lastHitAt = -Infinity, hitReactionAt = -Infinity
let soundEnabled = false, audioContext = null, lastHudAt = -Infinity
const ui = createPlayUI({ start: startGame, restart: restartGame, dig: digWithShovel, pause: togglePause, sound: toggleSound })
let controlEnabled = false, dugHeartCount = 0, shovelSwingStartedAt = -Infinity
const activeHearts = [], piledHearts = [], coverHearts = [], fieldHearts = [], burstParticles = [], mouse = { x: 0, y: 0 }
const heartImages = new Map([...HEARTS, ...GETUP_HEARTS].map(asset => {
  const image = new Image(); image.src = asset.src
  image.addEventListener('load', () => { staticLayersDirty = true; oceanCanvasesDirty = true })
  return [asset.src, image]
}))
const initial = { headX: 0, headY: 0, leftX: 0, leftY: 0, rightX: 0, rightY: 0 }
const rand = (min, max) => min + Math.random() * (max - min)
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
function shiftObjectByViewportHeight(object, ratio) {
  if (!object) return
  camera.updateMatrixWorld(true)
  const projected = object.position.clone().project(camera)
  projected.y += ratio * 2
  object.position.copy(projected.unproject(camera))
}
const scheduleStoryEvent = (delay, callback) => storyEvents.push({ at: storyClock.time + delay, callback })
function updateStoryEvents() {
  for (let i = storyEvents.length - 1; i >= 0; i -= 1) {
    if (storyEvents[i].at > storyClock.time) continue
    const [{ callback }] = storyEvents.splice(i, 1)
    callback()
  }
}

function calculateResponsiveMetrics() {
  const width = window.innerWidth, height = window.innerHeight
  const base = Math.min(width, height)
  const densityScale = .85
  responsive = {
    viewportWidth: width,
    viewportHeight: height,
    small: clamp(base * .12, 120, 200),
    medium: clamp(base * .17, 180, 300),
    large: clamp(base * .24, 260, 420),
    foreground: clamp(base * .32, 360, 560),
    densityScale,
    maxActiveHearts: Math.min(CONFIG.MAX_ACTIVE_HEARTS, 60),
    pileMaxHeight: clamp((base * .82 / height) * 100, 62, CONFIG.PILE_MAX_HEIGHT),
    hitPadding: clamp(base * .018, 14, 28)
  }
  document.documentElement.style.setProperty('--heart-hit-padding', `${responsive.hitPadding}px`)
  resizeHeartCanvases()
}
function resizeHeartCanvases() {
  if (typeof canvasLayers === 'undefined') return
  const ratio = renderPixelRatio(innerWidth, innerHeight, window.devicePixelRatio)
  document.querySelectorAll('.heart-layer canvas,.heart-pile canvas,.heart-field canvas,.engulf-cover canvas,.heart-ocean-dom canvas').forEach(canvas => {
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio)), height = Math.max(1, Math.round(canvas.clientHeight * ratio))
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; canvas.getContext('2d').setTransform(ratio, 0, 0, ratio, 0, 0) }
  })
  staticLayersDirty = true
  oceanCanvasesDirty = true
}
calculateResponsiveMetrics()

function loadModel(path) { return new Promise((resolve, reject) => loader.load(path, gltf => resolve(gltf.scene), undefined, reject)) }
function findNode(root, ...names) { for (const name of names) { const node = root.getObjectByName(name); if (node) return node } }
function showScared(show) { if (normalCharacter) normalCharacter.visible = !show; if (scaredCharacter) scaredCharacter.visible = show }
function fillHeartScene() {
  if (coverHearts.length) return
  for (let i = 0; i < 75; i += 1) {
    const size = rand(responsive.small * .7, responsive.large * 1.15)
    coverHearts.push({ src: chooseAsset(true).src, size, x: rand(-.04, 1.04) * innerWidth, y: rand(-.08, 1) * innerHeight, rotation: rand(-35,35) })
  }
  for (let i = 0; i < 90; i += 1) {
    const size = rand(responsive.small * .32, responsive.medium * .75)
    fieldHearts.push({ src: chooseAsset(true).src, size, x: rand(-.03, 1.03) * innerWidth, y: rand(-.04, 1) * innerHeight * .68, rotation: rand(-38,38) })
  }
  staticLayersDirty = true
}
function playEscapeMotion() {
  if (!motionCharacter || !motionMixer) return
  if (oceanAnimationFinishedHandler) {
    motionMixer.removeEventListener('finished', oceanAnimationFinishedHandler)
    oceanAnimationFinishedHandler = null
  }
  normalCharacter.visible = false; scaredCharacter.visible = false; motionCharacter.visible = true
  motionMixer.timeScale = CONFIG.GETUP_ANIMATION_SPEED
  const clips = motionCharacter.userData.clips
  const play = (name, loop = THREE.LoopOnce) => {
    motionMixer.stopAllAction(); const clip = THREE.AnimationClip.findByName(clips, name); if (!clip) return
    const action = motionMixer.clipAction(clip)
    action.reset().setLoop(loop, loop === THREE.LoopOnce ? 1 : Infinity)
    action.enabled = true; action.paused = false; action.clampWhenFinished = true
    action.setEffectiveTimeScale(1).setEffectiveWeight(1).play()
    return clip.duration
  }
  const getupDuration = play('getup') || 2.8
  scheduleStoryEvent(getupDuration * 1000 / CONFIG.GETUP_ANIMATION_SPEED, () => {
    const raiseDuration = play('raisehand') || 2
    scheduleStoryEvent(raiseDuration * 1000 / CONFIG.GETUP_ANIMATION_SPEED, () => play('idle'))
  })
}

/** Rebuild the static, shovel-removable hearts after tuning their parameters. */
function resetMiddleHearts() {
  const assets = OCEAN_HEARTS
  const middleCanvas = document.querySelector('.heart-ocean-middle canvas')
  middleCanvas._hearts = []
  for (let i = 0; i < CONFIG.HEART_OCEAN_COUNT; i += 1) {
    const layoutSample = { x: Math.random(), y: Math.random() }
    middleCanvas._hearts.push({
      src: assets[Math.floor(Math.random() * assets.length)].src,
      layoutSample,
      ...middleHeartLayout(layoutSample, innerWidth, innerHeight),
      rotation: rand(-28, 28)
    })
  }
  middleCanvas._initialHearts = middleCanvas._hearts.map(heart => ({ ...heart }))
  dugHeartCount = 0
  oceanCanvasesDirty = true
  return middleCanvas._hearts
}
if (import.meta.env.DEV) window.resetMiddleHearts = resetMiddleHearts

/** Build the get-up wide shot with the raster heart artwork. */
function buildHeartGround() {
  if (heartOcean) return heartOcean
  heartOcean = new THREE.Group()
  heartOcean.name = 'heart-ocean'
  heartOcean.visible = false
  const middleCanvas = document.querySelector('.heart-ocean-middle canvas')
  if (!middleCanvas._hearts) resetMiddleHearts()

  scene.add(heartOcean)
  return heartOcean
}

/** Play every embedded clip once, in gltf.animations order, then hold the final frame. */
function playModelAnimationsInOrder() {
  if (!motionCharacter || !motionMixer) return
  const clips = motionCharacter.userData.clips || []
  if (!clips.length) { finalMotionFinished = true; return }
  motionMixer.stopAllAction()
  if (oceanAnimationFinishedHandler) motionMixer.removeEventListener('finished', oceanAnimationFinishedHandler)
  const getupIndex = clips.findIndex(clip => clip.name.toLowerCase() === 'getup')
  let clipIndex = getupIndex >= 0 ? getupIndex : 0
  const playNext = () => {
    const clip = clips[clipIndex]
    if (!clip) return
    const action = motionMixer.clipAction(clip)
    action.reset().setLoop(THREE.LoopOnce, 1)
    // Hold each ending pose while the next clip fades in, avoiding a bind-pose flash.
    action.clampWhenFinished = true
    action.play()
  }
  oceanAnimationFinishedHandler = event => {
    const expectedClip = clips[clipIndex]
    if (!expectedClip || event.action.getClip() !== expectedClip) return
    if (clipIndex >= clips.length - 1) {
      finalMotionFinished = true
      motionMixer.removeEventListener('finished', oceanAnimationFinishedHandler)
      oceanAnimationFinishedHandler = null
      return
    }
    event.action.fadeOut(.22)
    clipIndex += 1
    playNext()
  }
  motionMixer.addEventListener('finished', oceanAnimationFinishedHandler)
  playNext()
  motionMixer.update(0)
}

function enterHeartOceanScene() {
  if (!motionCharacter || oceanSceneEntered) return
  oceanSceneEntered = true
  // The falling layer is hidden after this cut; release it instead of redrawing
  // dozens of blurred sprites behind the rescue scene every frame.
  activeHearts.length = 0; burstParticles.length = 0; hitGrid.clear()
  finalMotionFinished = false
  storyEvents.length = 0
  const originalScale = normalCharacter?.scale.x || 30
  normalCharacter.visible = false
  scaredCharacter.visible = false
  motionCharacter.visible = true
  characterRig.visible = false
  motionCharacter.scale.setScalar(originalScale * CONFIG.BIG_SCENE_CHARACTER_SCALE)
  motionCharacter.position.set(0, 0, -1.15)
  motionCharacter.rotation.set(0, 0, 0)
  characterRig.position.set(0, 0, 0)
  characterRig.rotation.set(0, 0, 0)
  motionCharacter.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(motionCharacter)
  oceanCharacterHeight = Math.max(.1, box.getSize(new THREE.Vector3()).y)
  // Anchor the model by its actual bounding-box feet. Hearts rise around it instead
  // of lifting the whole character above the stage.
  motionCharacter.position.y += -box.min.y
    + CONFIG.OCEAN_CHARACTER_Y_OFFSET
    - oceanCharacterHeight * CONFIG.OCEAN_CHARACTER_BURIED_RATIO
  motionFinalBasePosition = motionCharacter.position.clone()
  // The supplied PNGs provide the fixed back/front plates. WebP hearts fill the
  // transparent middle and are the only part removed by the shovel.
  buildHeartGround().visible = true
  scene.fog = new THREE.FogExp2(0x2b0610, .045)
  // Keep the alpha canvas transparent so the WebP heart-ocean back layer remains visible.
  scene.background = null
  redLight.position.set(-2, 2.3, 2); redLight.intensity = 8; redLight.distance = 18
  keyLight.color.set(0xffd8df); keyLight.intensity = 2.2
  camera.position.copy(CONFIG.OCEAN_CAMERA_POSITION)
  camera.fov = 49
  camera.lookAt(CONFIG.OCEAN_CAMERA_TARGET)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
  shiftObjectByViewportHeight(motionCharacter, .15)
  if (shovel && !shovelViewportPositioned) {
    shiftObjectByViewportHeight(shovel, -.2)
    shovelViewportPositioned = true
  }
  // Pose the first embedded clip under the opaque transition, then hold it until reveal.
  playModelAnimationsInOrder()
  motionMixer.timeScale = 0
}
function alignScared() {
  const normalBox = new THREE.Box3().setFromObject(normalCharacter), scaredBox = new THREE.Box3().setFromObject(scaredCharacter)
  const ratio = normalBox.getSize(new THREE.Vector3()).y / scaredBox.getSize(new THREE.Vector3()).y
  const targetCenter = normalBox.getCenter(new THREE.Vector3()), scaredCenter = scaredBox.getCenter(new THREE.Vector3())
  scaredCharacter.scale.multiplyScalar(Number.isFinite(ratio) ? ratio : 1); scaredCharacter.updateMatrixWorld(true)
  new THREE.Box3().setFromObject(scaredCharacter).getCenter(scaredCenter); scaredCharacter.position.add(targetCenter.sub(scaredCenter))
}

function setState(next, now = storyClock.time, force = false) {
  if (state === next && !force) return
  state = next; stateStartedAt = now; document.body.dataset.state = next.toLowerCase()
  ui.stage(next, shovelEquipped)
  if (next === STATES.ENGULFED) {
    roundSeconds = ((now - gameStartedAt) / 1000).toFixed(1)
    CONFIG.HEART_OCEAN_COUNT = 15 // One current route. A future 60+ branch is intentionally not authored yet.
    rescueTarget = CONFIG.HEART_OCEAN_COUNT
    resetMiddleHearts()
    fillHeartScene()
  }
  if ([STATES.HANDS_WARNING, STATES.SHOCK].includes(next)) showScared(true)
  // Keep the close-up character until the first scene has completely finished.
  // The old scene is torn down only after the opaque transition begins.
  if (next === STATES.OCEAN_TRANSITION) {
    // Create the static middle hearts at the same moment as both PNG plates appear.
    buildHeartGround()
    characterRig.visible = false
    if (normalCharacter) normalCharacter.visible = false
    if (scaredCharacter) scaredCharacter.visible = false
    if (motionCharacter) motionCharacter.visible = false
  }
  if ([STATES.HELP, STATES.DIGGING].includes(next) && !oceanSceneEntered) characterRig.visible = false
  if (next === STATES.HEART_GAME) gameStartedAt = now
  if (next === STATES.REVEAL) {
    characterRig.visible = true
    if (oceanSceneEntered && motionMixer) motionMixer.timeScale = CONFIG.GETUP_ANIMATION_SPEED
    else playEscapeMotion()
  }
  if (next === STATES.HEART_OCEAN) {
    enterHeartOceanScene()
    if (motionMixer) motionMixer.timeScale = 0
    characterRig.visible = false
  }
  if (next === STATES.DIGGING && oceanSceneEntered) characterRig.visible = false
  if (next === STATES.REVEAL && oceanSceneEntered) characterRig.visible = true
  if (DEBUG_MODE) requestAnimationFrame(syncCssAnimations)
}

function removeBuriedHeartGroup(x = innerWidth / 2, y = innerHeight * .68) {
  const heartsToReveal = rescueTarget
  const heartsToShowCharacter = Math.ceil(heartsToReveal / 2)
  if (state !== STATES.DIGGING || dugHeartCount >= heartsToReveal || storyClock.time - shovelSwingStartedAt < 380) return
  shovelSwingStartedAt = storyClock.time
  const centerFirst = piledHearts
    .map((heart, index) => ({ index, distance: Math.abs(heart.x - .5) + Math.abs(heart.bottom - .25) * .35 }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map(item => item.index)
    .sort((a, b) => b - a)
  centerFirst.forEach(index => piledHearts.splice(index, 1))
  const hearts = document.querySelector('.heart-ocean-middle canvas')._hearts || []
  const selected = nearestHearts(hearts, x, y, innerWidth, innerHeight, CONFIG.HEARTS_PER_DIG).sort((a, b) => b - a)
  for (const index of selected) hearts.splice(index, 1)
  const removedCount = selected.length
  if (removedCount) { digActions += 1; document.body.classList.add('has-dug'); ui.dig(x, y); ui.hit(x, y - 20, '挖掘 +1'); playTone(180, .12) }
  oceanCanvasesDirty = true
  dugHeartCount += removedCount
  staticLayersDirty = true
  // After the third of five digs, reveal the model but keep the mixer frozen on
  // the first frame of the getup clip until every removable heart is gone.
  if (dugHeartCount >= heartsToShowCharacter) {
    characterRig.visible = true
    if (motionMixer) motionMixer.timeScale = 0
  }
  if (dugHeartCount >= heartsToReveal) scheduleStoryEvent(420, () => setState(STATES.REVEAL, storyClock.time))
}

function chooseAsset(pile = false) {
  const pool = pile ? PILE_HEARTS : HEARTS
  let pick = Math.random() * (pile ? PILE_HEART_WEIGHT_TOTAL : HEART_WEIGHT_TOTAL)
  for (const item of pool) { pick -= item.weight; if (pick <= 0) return item }
  return pool[0]
}
function chooseDepth(progress) { const roll = Math.random(); return roll < .24 ? 'back' : roll > (progress > .55 ? .87 : .94) ? 'front' : 'mid' }
function chooseSize(asset, depth) {
  let range; const roll = Math.random()
  if (depth === 'back') range = [responsive.small * .78, responsive.small * 1.05]
  else if (depth === 'front') range = asset.type === 'big' ? [responsive.foreground * 1.05, responsive.foreground * 1.22] : [responsive.foreground * .9, responsive.foreground * 1.08]
  else if (roll < .38) range = [responsive.small * .9, responsive.small * 1.1]
  else if (roll < .82) range = [responsive.medium * .9, responsive.medium * 1.1]
  else range = [responsive.large * .9, responsive.large * 1.1]
  return rand(...range)
}

function spawnHeart(progress, forcedDepth) {
  if (activeHearts.length >= responsive.maxActiveHearts) return
  const depth = forcedDepth || chooseDepth(progress), asset = chooseAsset(), size = chooseSize(asset, depth)
  activeHearts.push({ src: asset.src, depth, size, x: rand(-size * .15, innerWidth - size * .85), y: -size - rand(0, 120), rotation: rand(-16, 16), rotationSpeed: rand(-8, 8), phase: rand(0, Math.PI * 2), drift: rand(5, 18), speed: rand(CONFIG.HEART_SPEED_MIN, CONFIG.HEART_SPEED_MAX) * (depth === 'back' ? .68 : depth === 'front' ? 1.22 : 1), popping: false })
}
function removeHeart(heart) { const index = activeHearts.indexOf(heart); if (index >= 0) activeHearts.splice(index, 1) }
function burst(heart) {
  const colors = ['#e32636', '#9f1325', '#ff6f91', '#fff4f6'], count = Math.round(rand(...CONFIG.BURST_PARTICLE_COUNT))
  for (let i = 0; i < count; i += 1) {
    const angle = rand(0, Math.PI * 2), distance = rand(20, 70)
    burstParticles.push({ x: heart.x + heart.size / 2, y: heart.y + heart.size / 2, dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance, size: rand(4, 9), color: colors[Math.floor(Math.random() * colors.length)], startedAt: storyClock.time })
  }
}
function popHeart(heart) {
  if (heart.popping || state === STATES.ENGULFED) return
  heart.popping = true; heart.popStartedAt = storyClock.time; burst(heart)
  score += 1; scoreElement.textContent = score
  combo = storyClock.time - lastHitAt < 1250 ? combo + 1 : 1
  bestCombo = Math.max(bestCombo, combo); lastHitAt = hitReactionAt = storyClock.time
  if (piledHearts.length) { piledHearts.pop(); pileCount = Math.max(0, pileCount - 1); staticLayersDirty = true }
  ui.hit((heart.drawX ?? heart.x) + heart.size / 2, heart.y + heart.size / 2)
  playTone(480 + Math.min(combo, 8) * 65, .065)
  scheduleStoryEvent(CONFIG.POP_DURATION, () => removeHeart(heart))
}
function landHeart(heart, progress) {
  removeHeart(heart)
  const size = clamp(heart.size * (progress > .72 ? rand(1.05, 1.25) : 1), responsive.small * .9, responsive.large * 1.4), pileHeight = Math.min(responsive.pileMaxHeight, 8 + pileCount * .72 * responsive.densityScale)
  const bottom = rand(-3, pileHeight)
  const left = rand(-3, 103)
  piledHearts.push({ src: chooseAsset(true).src, size, x: left / 100, bottom: bottom / 100, rotation: rand(-28, 28) }); pileCount += 1
  if (piledHearts.length > 190) piledHearts.shift()
  staticLayersDirty = true
}
function spawnRate(elapsed) {
  const progress = clamp(elapsed / CONFIG.GAME_DURATION, 0, 1)
  // Accelerate continuously so the screen is filled by visible falling hearts,
  // instead of introducing a new batch at the scene boundary.
  const acceleration = Math.pow(progress, 2.35)
  const baseRate = THREE.MathUtils.lerp(CONFIG.HEART_SPAWN_RATE_START, CONFIG.HEART_SPAWN_RATE_END, acceleration)
  // Square-root scaling adds enough hearts for larger areas without flooding them.
  return baseRate * 2 * Math.sqrt(responsive.densityScale)
}

function updateGame(now, delta) {
  const elapsed = now - gameStartedAt
  roundPressure = pressureAt(elapsed, score, pileCount)
  const progress = clamp(Math.max(elapsed / 25000, roundPressure), 0, 1)
  if (roundPressure >= .67 && state === STATES.HEART_GAME) setState(STATES.OVERLOAD, now)
  if (roundShouldEnd(elapsed, roundPressure) && state !== STATES.ENGULFED) setState(STATES.ENGULFED, now)
  const engulfedElapsed = now - stateStartedAt
  const rate = state === STATES.ENGULFED && engulfedElapsed < CONFIG.ENGULFED_SPAWN_DURATION
    ? CONFIG.HEART_SPAWN_RATE_ENGULFED
    : state === STATES.ENGULFED ? 0 : spawnRate(progress * CONFIG.GAME_DURATION)
  spawnBudget += rate * delta
  while (spawnBudget >= 1) { spawnHeart(progress, state === STATES.ENGULFED && Math.random() > .82 ? 'front' : undefined); spawnBudget -= 1 }
  const pressure = roundPressure
  document.documentElement.style.setProperty('--danger', pressure)
  document.documentElement.style.setProperty('--background-danger', pressure * .9)
  document.documentElement.style.setProperty('--wash-danger', pressure * .72)
  document.documentElement.style.setProperty('--vignette-danger', pressure * CONFIG.VIGNETTE_STRENGTH)
  document.documentElement.style.setProperty('--vignette-size', `${35 + pressure * 135}px`)
  document.documentElement.style.setProperty('--grain-danger', .025 + pressure * (CONFIG.GLOBAL_GRAIN_OPACITY - .025))
  redLight.intensity = pressure * 2.2 * CONFIG.BACKGROUND_TINT_STRENGTH
  const speedProgress = Math.pow(progress, 2.1)
  const lateRush = THREE.MathUtils.lerp(1, 4.8, speedProgress)
  const engulfedRush = state === STATES.ENGULFED ? 1.45 : 1
  for (let i = activeHearts.length - 1; i >= 0; i -= 1) {
    const heart = activeHearts[i]; if (heart.popping) continue
    heart.y += heart.speed * delta * lateRush * engulfedRush; heart.rotation += heart.rotationSpeed * delta
    const drift = Math.sin(now * .0014 + heart.phase) * heart.drift
    heart.drawX = heart.x + drift
    if (heart.y > innerHeight - heart.size * .62) landHeart(heart, progress)
  }
}
function updateTimeline(now) {
  if (!timelineReady) return
  const elapsed = now - stateStartedAt
  if (state === STATES.NORMAL && controlEnabled && elapsed >= CONFIG.NORMAL_DURATION) setState(STATES.HANDS_WARNING, now)
  else if (state === STATES.HANDS_WARNING && elapsed >= CONFIG.FREEZE_DURATION && scaredCharacter) setState(STATES.SHOCK, now)
  else if (state === STATES.SHOCK && elapsed >= CONFIG.SHOCK_DURATION) setState(STATES.HEART_GAME, now)
  else if (state === STATES.ENGULFED && elapsed >= CONFIG.ENGULFED_HOLD_DURATION) setState(STATES.OCEAN_TRANSITION, now)
  else if (state === STATES.OCEAN_TRANSITION && elapsed >= CONFIG.OCEAN_TRANSITION_DURATION) setState(STATES.HEART_OCEAN, now)
  else if (state === STATES.HEART_OCEAN && elapsed >= 3000) setState(STATES.DIGGING, now)
}
function updateCharacter(now) {
  if (!normalCharacter) return
  if (state === STATES.NORMAL && controlEnabled) {
    if (head) { head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, initial.headY + mouse.x * .18, .04); head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, initial.headX + mouse.y * .1, .04) }
    if (eye_l) { eye_l.rotation.y = THREE.MathUtils.lerp(eye_l.rotation.y, initial.leftY + mouse.x * .32, .12); eye_l.rotation.x = THREE.MathUtils.lerp(eye_l.rotation.x, initial.leftX + mouse.y * .2, .12) }
    if (eye_r) { eye_r.rotation.y = THREE.MathUtils.lerp(eye_r.rotation.y, initial.rightY + mouse.x * .32, .12); eye_r.rotation.x = THREE.MathUtils.lerp(eye_r.rotation.x, initial.rightX + mouse.y * .2, .12) }
  }
  if (state === STATES.SHOCK) { const pulse = Math.sin(clamp((now - stateStartedAt) / CONFIG.SHOCK_DURATION, 0, 1) * Math.PI); characterRig.position.z = -.25 * pulse; characterRig.rotation.x = -.055 * pulse }
  else { characterRig.position.z = THREE.MathUtils.lerp(characterRig.position.z, 0, .16); characterRig.rotation.x = THREE.MathUtils.lerp(characterRig.rotation.x, 0, .16) }
  const isFloating = [STATES.HEART_GAME, STATES.OVERLOAD, STATES.ENGULFED].includes(state)
  const relief = Math.max(0, 1 - (now - hitReactionAt) / 360)
  const floatY = isFloating ? Math.sin(now * .00115) * .065 + relief * .12 : 0
  const floatRoll = isFloating ? Math.sin(now * .00082 + .8) * .012 : 0
  characterRig.position.y = THREE.MathUtils.lerp(characterRig.position.y, floatY, .045)
  if (state !== STATES.NORMAL) characterRig.position.x = THREE.MathUtils.lerp(characterRig.position.x, 0, .065)
  characterRig.rotation.z = THREE.MathUtils.lerp(characterRig.rotation.z, floatRoll, .04)
}

const scaredReady = loadModel(CONFIG.SCARED_MODEL_PATH).then(model => (scaredCharacter = model, model))
const motionReady = new Promise((resolve, reject) => loader.load(CONFIG.MOTION_MODEL_PATH, gltf => { motionCharacter = gltf.scene; motionCharacter.userData.clips = gltf.animations; resolve(motionCharacter) }, undefined, reject))
const shovelReady = loadModel(CONFIG.SHOVEL_MODEL_PATH).then(model => {
  shovel = model
  model.traverse(node => {
    if (!node.isMesh) return
    node.frustumCulled = false
    node.renderOrder = 20
    if (node.material) node.material.side = THREE.DoubleSide
  })
  const box = new THREE.Box3().setFromObject(model)
  const height = Math.max(.01, box.getSize(new THREE.Vector3()).y)
  shovelBaseScale = 4.10865 / height
  model.scale.setScalar(shovelBaseScale)
  model.updateMatrixWorld(true)
  const scaledBox = new THREE.Box3().setFromObject(model)
  const center = scaledBox.getCenter(new THREE.Vector3())
  model.position.set(-center.x, .05 - scaledBox.min.y, -1.05 - center.z)
  shovelBasePosition = model.position.clone()
  model.rotation.set(0, 0, -.28)
  model.visible = false
  shovelScene.add(model)
  if (oceanSceneEntered && !shovelViewportPositioned) {
    shiftObjectByViewportHeight(model, -.2)
    shovelViewportPositioned = true
  }
  return model
})
const characterReady = loadModel(CONFIG.NORMAL_MODEL_PATH).then(model => {
  normalCharacter = model; model.position.set(0, -.9, 0); model.scale.setScalar(30); characterRig.add(model)
  head = findNode(model, 'head', 'Head'); eye_l = findNode(model, 'eye_l', 'Eye_L', 'eye-l'); eye_r = findNode(model, 'eye-r', 'eye_r', 'Eye_R')
  if (head) [initial.headX, initial.headY] = [head.rotation.x, head.rotation.y]
  if (eye_l) [initial.leftX, initial.leftY] = [eye_l.rotation.x, eye_l.rotation.y]
  if (eye_r) [initial.rightX, initial.rightY] = [eye_r.rotation.x, eye_r.rotation.y]
  stateStartedAt = 0; storyClock.time = 0; storyClock.lastRealTime = performance.now(); timelineReady = false; document.body.dataset.state = STATES.NORMAL.toLowerCase(); return scaredReady
}).then(model => {
  model.position.copy(normalCharacter.position); model.scale.copy(normalCharacter.scale); model.quaternion.copy(normalCharacter.quaternion); characterRig.add(model)
  model.updateMatrixWorld(true); normalCharacter.updateMatrixWorld(true); alignScared(); showScared([STATES.SHOCK, STATES.HANDS_WARNING, STATES.HEART_GAME, STATES.OVERLOAD, STATES.ENGULFED].includes(state))
  return motionReady
}).then(model => {
  model.position.copy(normalCharacter.position); model.scale.copy(normalCharacter.scale); model.quaternion.copy(normalCharacter.quaternion); model.visible = false; characterRig.add(model); motionMixer = new THREE.AnimationMixer(model)
})
const imageReady = [...document.querySelectorAll('img'), ...heartImages.values()].map(image => image.decode())
Promise.all([characterReady, shovelReady, scaredReady, motionReady, ...imageReady]).then(() => {
  assetsReady = true; timelineReady = true; ui.ready(); startGame()
}).catch(error => { console.error('场景加载失败：', error); ui.error() })

addEventListener('pointermove', event => { mouse.x = event.clientX / innerWidth * 2 - 1; mouse.y = event.clientY / innerHeight * 2 - 1 })
function startGame() {
  if (!assetsReady || controlEnabled) return
  controlEnabled = true; stateStartedAt = storyClock.time
  storyClock.playing = true; storyClock.lastRealTime = performance.now()
  document.body.classList.add('control-enabled'); ui.begin(); ui.stage(state, shovelEquipped)
}
function restartGame() {
  if (oceanAnimationFinishedHandler) motionMixer.removeEventListener('finished', oceanAnimationFinishedHandler)
  oceanAnimationFinishedHandler = null; finalMotionFinished = false
  completed = false; shovelEquipped = false; manualPaused = false
  roundPressure = 0; roundSeconds = 0; digActions = 0; rescueTarget = 15
  CONFIG.HEART_OCEAN_COUNT = 15
  combo = 0; bestCombo = 0; lastHitAt = hitReactionAt = -Infinity; shovelSwingStartedAt = -Infinity
  lastHudAt = -Infinity; storyClock.rate = 1; storyClock.playing = false
  document.body.classList.remove('shovel-equipped', 'has-dug'); ui.paused(false)
  resetMiddleHearts(); seekStory(0); hitGrid.clear()
  for (const [name, value] of Object.entries({ danger: 0, 'background-danger': 0, 'wash-danger': 0, 'vignette-danger': 0, 'vignette-size': '35px', 'grain-danger': .025 })) document.documentElement.style.setProperty('--' + name, value)
  startGame()
}
function digWithShovel() {
  if (state !== STATES.DIGGING || !storyClock.playing || completed) return
  shovelEquipped = true
  removeBuriedHeartGroup()
}
const shovelHitTarget = document.querySelector('#shovel-hit-target')
const gloveGuide = document.querySelector('.figure-pointer')
const shovelBounds = new THREE.Box3(), shovelPoint = new THREE.Vector3()
function positionShovelTarget() {
  if (!shovel || state !== STATES.DIGGING) return
  shovel.updateMatrixWorld(true); camera.updateMatrixWorld(true)
  shovelBounds.setFromObject(shovel)
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
  for (const x of [shovelBounds.min.x, shovelBounds.max.x]) for (const y of [shovelBounds.min.y, shovelBounds.max.y]) for (const z of [shovelBounds.min.z, shovelBounds.max.z]) {
    shovelPoint.set(x,y,z).project(camera)
    const px = (shovelPoint.x + 1) * innerWidth / 2, py = (1 - shovelPoint.y) * innerHeight / 2
    left = Math.min(left,px); right = Math.max(right,px); top = Math.min(top,py); bottom = Math.max(bottom,py)
  }
  const margin = 24
  left = clamp(left - margin, 0, innerWidth - 48); top = clamp(top - margin, 0, innerHeight - 48)
  right = clamp(right + margin, left + 48, innerWidth); bottom = clamp(bottom + margin, top + 48, innerHeight)
  Object.assign(shovelHitTarget.style, { left: left + 'px', top: top + 'px', width: (right-left) + 'px', height: (bottom-top) + 'px' })
  const guideSize = Math.min(130, innerWidth * .24)
  Object.assign(gloveGuide.style, { left: clamp(right - guideSize * .15, 0, innerWidth - guideSize) + 'px', top: clamp(top - guideSize * .5, 0, innerHeight - guideSize) + 'px', width: guideSize + 'px' })
}
function togglePause() {
  if (!controlEnabled || completed) return
  manualPaused = !manualPaused; storyClock.playing = !manualPaused
  storyClock.lastRealTime = performance.now(); ui.paused(manualPaused); syncCssAnimations()
}
function toggleSound() {
  soundEnabled = !soundEnabled
  if (soundEnabled) {
    try { audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); audioContext.resume().catch(() => {}) }
    catch { soundEnabled = false }
  }
  ui.sound(soundEnabled); if (soundEnabled) playTone(520, .1)
}
function playTone(frequency, duration) {
  if (!soundEnabled || !audioContext) return
  const oscillator = audioContext.createOscillator(), gain = audioContext.createGain(), now = audioContext.currentTime
  oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, now); oscillator.frequency.exponentialRampToValueAtTime(frequency * .6, now + duration)
  gain.gain.setValueAtTime(.06, now); gain.gain.exponentialRampToValueAtTime(.001, now + duration)
  oscillator.connect(gain).connect(audioContext.destination); oscillator.start(now); oscillator.stop(now + duration)
}
function updatePlayHUD(now) {
  if (now - lastHudAt < 90 && lastHudAt <= now) return
  lastHudAt = now
  const digging = [STATES.DIGGING, STATES.REVEAL].includes(state)
  const caption = digging ? '挖掘 ' + Math.min(digActions, rescueTarget / 3) + ' / ' + rescueTarget / 3
    : [STATES.HEART_GAME, STATES.OVERLOAD].includes(state) ? '失控程度' : state === STATES.NORMAL ? '' : ''
  ui.update({ score, pressure: roundPressure, combo: now - lastHitAt < 1250 ? combo : 0, digging, rescue: dugHeartCount / rescueTarget, caption })
}
document.addEventListener('visibilitychange', () => { if (document.hidden && controlEnabled && !completed && !manualPaused) togglePause() })
addEventListener('keydown', event => { if (event.key === 'Escape') togglePause() })
const hitGrid = new Map(), HIT_CELL_SIZE = 180
function drawHeart(context, heart, x, y, scale = 1, alpha = 1, filter = 'none') {
  const image = heartImages.get(heart.src)
  if (!image?.complete || !image.naturalWidth) return
  context.save(); context.globalAlpha = alpha; context.filter = filter
  context.translate(x, y); context.rotate(heart.rotation * Math.PI / 180); context.scale(scale, scale)
  context.drawImage(image, -heart.size / 2, -heart.size / 2, heart.size, heart.size); context.restore()
}
function clearLayer(layer) {
  const { canvas, context } = canvasLayers[layer]
  context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
}
function drawStaticLayers() {
  for (const name of ['pile', 'cover', 'field']) clearLayer(name)
  const drawList = (name, hearts, position) => hearts.forEach(heart => {
    const point = position(heart, canvasLayers[name].canvas)
    drawHeart(canvasLayers[name].context, heart, point.x, point.y, 1, 1)
  })
  drawList('pile', piledHearts, (heart, canvas) => ({ x: heart.x * canvas.clientWidth, y: canvas.clientHeight - heart.bottom * innerHeight - heart.size / 2 }))
  drawList('cover', coverHearts, heart => ({ x: heart.x, y: heart.y }))
  drawList('field', fieldHearts, heart => ({ x: heart.x, y: heart.y }))
  staticLayersDirty = false
}
function drawActiveHearts(now) {
  if (!activeHearts.length && !burstParticles.length) {
    if (dynamicLayersWereDrawn) {
      for (const name of ['back', 'mid', 'front']) clearLayer(name)
      hitGrid.clear()
      dynamicLayersWereDrawn = false
    }
    return
  }
  dynamicLayersWereDrawn = true
  for (const name of ['back', 'mid', 'front']) clearLayer(name)
  hitGrid.clear()
  for (const heart of activeHearts) {
    const x = heart.drawX ?? heart.x, y = heart.y
    let scale = 1, alpha = heart.depth === 'back' ? .58 : heart.depth === 'front' ? .88 : 1
    let filter = heart.depth === 'back' ? 'blur(3px) saturate(.9)' : heart.depth === 'front' ? 'blur(3.5px) brightness(1.04)' : 'drop-shadow(0 5px 12px rgba(130,0,25,.2))'
    if (heart.popping) {
      const progress = clamp((now - heart.popStartedAt) / CONFIG.POP_DURATION, 0, 1)
      scale = progress < .2 ? 1 - progress * .5 : progress < .5 ? .9 + (progress - .2) * .93 : 1.18 * (1 - (progress - .5) * 2)
      alpha *= 1 - Math.max(0, progress - .25) / .75; filter = `brightness(${1 + .22 * (1 - progress)}) blur(${3 * progress}px)`
    } else {
      const padding = responsive.hitPadding, left = x - padding, top = y - padding, right = x + heart.size + padding, bottom = y + heart.size + padding
      for (let gx = Math.floor(left / HIT_CELL_SIZE); gx <= Math.floor(right / HIT_CELL_SIZE); gx += 1) for (let gy = Math.floor(top / HIT_CELL_SIZE); gy <= Math.floor(bottom / HIT_CELL_SIZE); gy += 1) {
        const key = `${gx}:${gy}`; const bucket = hitGrid.get(key) || []; bucket.push(heart); hitGrid.set(key, bucket)
      }
    }
    drawHeart(canvasLayers[heart.depth].context, heart, x + heart.size / 2, y + heart.size / 2, scale, alpha, filter)
  }
  const context = canvasLayers.mid.context
  for (let i = burstParticles.length - 1; i >= 0; i -= 1) {
    const particle = burstParticles[i], progress = (now - particle.startedAt) / CONFIG.POP_DURATION
    if (progress >= 1) { burstParticles.splice(i, 1); continue }
    context.globalAlpha = 1 - progress; context.fillStyle = particle.color; context.beginPath(); context.arc(particle.x + particle.dx * progress, particle.y + particle.dy * progress, particle.size * (1 - progress), 0, Math.PI * 2); context.fill()
  }
  context.globalAlpha = 1
}
function drawOceanCanvases() {
  if (!oceanCanvasesDirty) return
  for (const { canvas, context } of oceanCanvasLayers) {
    context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
    for (const heart of canvas._hearts || []) {
      drawHeart(context, heart, heart.x * canvas.clientWidth, canvas.clientHeight - heart.bottom * canvas.clientHeight, 1, 1, 'drop-shadow(0 0 5px #f7ecbb) saturate(1.05)')
    }
  }
  oceanCanvasesDirty = false
}

const debugPanel = document.querySelector('.debug-time-panel')
const debugSlider = debugPanel?.querySelector('.debug-timeline')
const debugReadout = debugPanel?.querySelector('.debug-time-readout')
const debugPlayButton = debugPanel?.querySelector('[data-debug-action="play"]')
let debugDragging = false
let lastDebugPanelUpdate = 0
let lastPerfLogTime = 0

function formatStoryTime(milliseconds) {
  const totalSeconds = milliseconds / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = (totalSeconds % 60).toFixed(1).padStart(4, '0')
  return `${String(minutes).padStart(2, '0')}:${seconds}`
}

function syncCssAnimations() {
  document.getAnimations().forEach(animation => {
    animation.playbackRate = storyClock.rate
    if (storyClock.playing) animation.play()
    else animation.pause()
  })
}

function updateDebugPanel(force = false) {
  if (!DEBUG_MODE || !debugPanel) return
  const realTime = performance.now()
  if (!force && realTime - lastDebugPanelUpdate < 100) return
  lastDebugPanelUpdate = realTime
  if (!debugDragging) debugSlider.value = String(storyClock.time)
  debugReadout.value = `${formatStoryTime(storyClock.time)} / ${formatStoryTime(STORY_DURATION)}`
  debugReadout.textContent = debugReadout.value
  debugPlayButton.textContent = storyClock.playing ? 'Pause' : 'Play'
}

function getThreePerformanceInfo() {
  const { calls, triangles, points, lines } = renderer.info.render
  return { state, calls, triangles, points, lines, activeHearts: activeHearts.length, staticOceanHearts: document.querySelector('.heart-ocean-middle canvas')?._hearts?.length || 0, pixelRatio: renderer.getPixelRatio() }
}
if (PERF_LOG_ENABLED) window.getThreePerformanceInfo = getThreePerformanceInfo

function reportThreePerformance(realTime) {
  if (!PERF_LOG_ENABLED || realTime - lastPerfLogTime < 1000) return
  lastPerfLogTime = realTime
  console.table(getThreePerformanceInfo())
}

function addDebugPile(count) {
  const startIndex = piledHearts.length
  for (let i = 0; i < count; i += 1) {
    const pileIndex = startIndex + i
    const pileProgress = pileIndex / Math.max(1, 189)
    const size = rand(responsive.small * .9, responsive.large * 1.25)
    const pileHeight = Math.min(responsive.pileMaxHeight, 8 + pileIndex * .72 * responsive.densityScale)
    piledHearts.push({ src: chooseAsset(true).src, size, x: rand(-.03, 1.03), bottom: rand(-.03, pileHeight / 100), rotation: rand(-28, 28), debugProgress: pileProgress })
  }
  pileCount = piledHearts.length
  staticLayersDirty = true
}

function stateForStoryTime(time) {
  if (time < STORY_TIMES.HANDS_WARNING) return [STATES.NORMAL, STORY_TIMES.NORMAL]
  if (time < STORY_TIMES.SHOCK) return [STATES.HANDS_WARNING, STORY_TIMES.HANDS_WARNING]
  if (time < STORY_TIMES.HEART_GAME) return [STATES.SHOCK, STORY_TIMES.SHOCK]
  if (time < STORY_TIMES.OVERLOAD) return [STATES.HEART_GAME, STORY_TIMES.HEART_GAME]
  if (time < STORY_TIMES.FULL_COVER) return [STATES.OVERLOAD, STORY_TIMES.OVERLOAD]
  if (time < STORY_TIMES.CAMERA_PULLBACK) return [STATES.ENGULFED, STORY_TIMES.FULL_COVER]
  if (time < STORY_TIMES.HEART_OCEAN) return [STATES.OCEAN_TRANSITION, STORY_TIMES.CAMERA_PULLBACK]
  if (time < STORY_TIMES.DIGGING) return [STATES.HEART_OCEAN, STORY_TIMES.HEART_OCEAN]
  if (time < STORY_TIMES.REVEAL) return [STATES.DIGGING, STORY_TIMES.DIGGING]
  return [STATES.REVEAL, STORY_TIMES.REVEAL]
}

function seekStory(time) {
  storyClock.time = clamp(Number(time) || 0, 0, STORY_DURATION)
  storyClock.lastRealTime = performance.now()
  storyEvents.length = 0
  activeHearts.length = 0; piledHearts.length = 0; coverHearts.length = 0; fieldHearts.length = 0; burstParticles.length = 0
  pileCount = 0; spawnBudget = 0; score = 0; scoreElement.textContent = '0'
  shovelViewportPositioned = false
  if (shovel && shovelBasePosition) shovel.position.copy(shovelBasePosition)
  dugHeartCount = 0
  const middleCanvas = document.querySelector('.heart-ocean-middle canvas')
  if (middleCanvas?._initialHearts) {
    middleCanvas._hearts = middleCanvas._initialHearts.map(heart => ({ ...heart }))
    oceanCanvasesDirty = true
  }
  controlEnabled = storyClock.time > 0
  document.body.classList.toggle('control-enabled', controlEnabled)
  if (heartOcean) heartOcean.visible = false
  oceanSceneEntered = false
  scene.fog = null; scene.background = null
  redLight.intensity = 0; redLight.position.set(0, 1, 2.2)
  keyLight.color.set(0xffffff); keyLight.intensity = 3
  camera.position.set(0, 1.5, 5); camera.fov = 35; camera.lookAt(0, 1.5, 0); camera.updateProjectionMatrix()
  characterRig.visible = true; characterRig.position.set(0, 0, 0); characterRig.rotation.set(0, 0, 0)
  if (motionMixer) motionMixer.stopAllAction()
  if (motionCharacter && normalCharacter) {
    motionCharacter.position.copy(normalCharacter.position)
    motionCharacter.scale.copy(normalCharacter.scale)
    motionCharacter.quaternion.copy(normalCharacter.quaternion)
    motionCharacter.visible = false
  }

  gameStartedAt = STORY_TIMES.HEART_GAME
  const gameProgress = clamp((storyClock.time - STORY_TIMES.HEART_GAME) / CONFIG.GAME_DURATION, 0, 1)
  if (storyClock.time >= STORY_TIMES.HEART_GAME) addDebugPile(Math.round(190 * Math.pow(gameProgress, 1.45)))
  if (storyClock.time >= STORY_TIMES.FULL_COVER && piledHearts.length < 190) addDebugPile(190 - piledHearts.length)

  const [targetState, targetStart] = stateForStoryTime(storyClock.time)
  if ([STATES.DIGGING, STATES.REVEAL].includes(targetState)) enterHeartOceanScene()
  state = null
  setState(targetState, targetStart, true)
  if ([STATES.SHOCK, STATES.HANDS_WARNING, STATES.HEART_GAME, STATES.OVERLOAD].includes(targetState)) showScared(true)
  else if (![STATES.ENGULFED, STATES.OCEAN_TRANSITION, STATES.HEART_OCEAN, STATES.DIGGING, STATES.REVEAL].includes(targetState)) showScared(false)
  if (targetState === STATES.REVEAL && motionMixer) motionMixer.update(Math.max(0, storyClock.time - STORY_TIMES.REVEAL) / 1000)
  staticLayersDirty = true
  requestAnimationFrame(() => {
    syncCssAnimations()
    const stateElapsed = storyClock.time - targetStart
    document.getAnimations().forEach(animation => {
      const duration = Number(animation.effect?.getComputedTiming().duration)
      if (Number.isFinite(duration) && duration > 0) animation.currentTime = Math.min(stateElapsed, duration)
    })
  })
  updateDebugPanel(true)
}

if (DEBUG_MODE && debugPanel) {
  debugPanel.addEventListener('pointerdown', event => event.stopPropagation())
  debugPanel.addEventListener('click', event => {
    const action = event.target.closest('[data-debug-action]')?.dataset.debugAction
    const rate = event.target.closest('[data-debug-rate]')?.dataset.debugRate
    const jump = event.target.closest('[data-debug-jump]')?.dataset.debugJump
    if (action === 'play') { storyClock.playing = !storyClock.playing; storyClock.lastRealTime = performance.now(); syncCssAnimations() }
    if (action === 'restart') { storyClock.playing = true; seekStory(0); syncCssAnimations() }
    if (rate) {
      storyClock.rate = Number(rate)
      debugPanel.querySelectorAll('[data-debug-rate]').forEach(button => button.classList.toggle('is-active', button.dataset.debugRate === rate))
      syncCssAnimations()
    }
    if (jump) seekStory(STORY_TIMES[jump])
    updateDebugPanel(true)
  })
  debugSlider.addEventListener('pointerdown', () => { debugDragging = true })
  debugSlider.addEventListener('input', () => seekStory(debugSlider.value))
  debugSlider.addEventListener('change', () => { debugDragging = false; seekStory(debugSlider.value) })
  addEventListener('pointerup', () => { debugDragging = false })
  updateDebugPanel(true)
}

addEventListener('pointerdown', event => {
  if (event.target.closest('button, .intro-card, .result-card, .pause-card, .debug-time-panel') || !controlEnabled || !storyClock.playing || completed || event.button > 0) return
  if (![STATES.HEART_GAME, STATES.OVERLOAD].includes(state)) return
  const bucket = hitGrid.get(`${Math.floor(event.clientX / HIT_CELL_SIZE)}:${Math.floor(event.clientY / HIT_CELL_SIZE)}`) || []
  for (let i = bucket.length - 1; i >= 0; i -= 1) {
    const heart = bucket[i], x = heart.drawX ?? heart.x, padding = responsive.hitPadding
    if (!heart.popping && event.clientX >= x - padding && event.clientX <= x + heart.size + padding && event.clientY >= heart.y - padding && event.clientY <= heart.y + heart.size + padding) { popHeart(heart); break }
  }
})
function animate(now) {
  requestAnimationFrame(animate)
  const delta = storyClock.tick(now), storyNow = storyClock.time

  document.body.classList.toggle('intro-ready', timelineReady && !controlEnabled && storyNow >= 3000)
  if (storyClock.playing) updateTimeline(storyNow)
  updatePlayHUD(storyNow)
  if (state === STATES.REVEAL && !completed && finalMotionFinished) {
    completed = true; document.body.classList.remove('shovel-equipped'); ui.result(score, roundSeconds, digActions); playTone(700, .3)
  }
  const sceneFrozen = state === STATES.SHOCK || state === STATES.HEART_OCEAN || (state === STATES.REVEAL && finalMotionFinished) || !controlEnabled
  const sceneDelta = sceneFrozen ? 0 : delta
  if (delta > 0) updateStoryEvents()
  if (sceneDelta > 0) {
    updateCharacter(storyNow)
    if ([STATES.HEART_GAME, STATES.OVERLOAD, STATES.ENGULFED].includes(state)) updateGame(storyNow, sceneDelta)
    if (motionMixer) motionMixer.update(sceneDelta)
  }
  const revealProgress = state === STATES.REVEAL ? clamp((storyNow - stateStartedAt) / CONFIG.REVEAL_DURATION, 0, 1) : 0
  const easedReveal = 1 - Math.pow(1 - revealProgress, 3)
  const inOcean = [STATES.OCEAN_TRANSITION, STATES.HEART_OCEAN, STATES.DIGGING, STATES.REVEAL].includes(state)
  if (state === STATES.OCEAN_TRANSITION && !oceanSceneEntered && storyNow - stateStartedAt >= CONFIG.OCEAN_TRANSITION_DURATION * .5) enterHeartOceanScene()
  if (inOcean && sceneDelta > 0) {
    camera.position.lerp(CONFIG.OCEAN_CAMERA_POSITION, .045)
    const drift = [STATES.HEART_OCEAN, STATES.DIGGING, STATES.REVEAL].includes(state) ? Math.sin(storyNow * .00013) * .18 : 0
    camera.lookAt(CONFIG.OCEAN_CAMERA_TARGET.x + drift, CONFIG.OCEAN_CAMERA_TARGET.y, CONFIG.OCEAN_CAMERA_TARGET.z)
    camera.fov = THREE.MathUtils.lerp(camera.fov, 49, .04)
  } else if (!inOcean && sceneDelta > 0) {
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, state === STATES.REVEAL ? 8.4 : 5, state === STATES.REVEAL ? .035 : .08)
    camera.fov = THREE.MathUtils.lerp(camera.fov, state === STATES.REVEAL ? 48 : 35, state === STATES.REVEAL ? .035 : .08)
  }
  camera.updateProjectionMatrix()
  if (shovel) {
    shovel.visible = state === STATES.DIGGING
    if (shovel.visible) {
      const swingProgress = clamp((storyNow - shovelSwingStartedAt) / 420, 0, 1)
      const digSwing = swingProgress < 1 ? Math.sin(swingProgress * Math.PI * 2) * .13 * (1 - swingProgress) : 0
      shovel.rotation.z = -.28 + digSwing * (shovelEquipped ? 3 : 1)
      const breathe = 1 + Math.sin(storyNow * .0045) * .035
      shovel.scale.setScalar(shovelBaseScale * breathe)
    }
  }
  if (oceanSceneEntered && [STATES.HEART_OCEAN, STATES.DIGGING, STATES.REVEAL].includes(state)) {
    if (normalCharacter) normalCharacter.visible = false
    if (scaredCharacter) scaredCharacter.visible = false
    if (motionCharacter) motionCharacter.visible = true
  }
  if (state === STATES.REVEAL && !oceanSceneEntered) {
    characterRig.position.y = THREE.MathUtils.lerp(-.28, .2, easedReveal)
  }
  if (staticLayersDirty) drawStaticLayers()
  drawActiveHearts(storyNow)
  if (inOcean) drawOceanCanvases()
  renderer.render(scene, camera)
  shovelRenderer.render(shovelScene, camera)
  positionShovelTarget()
  reportThreePerformance(now)
  updateDebugPanel()
}
requestAnimationFrame(animate)
addEventListener('resize', () => {
  const previous = responsive
  calculateResponsiveMetrics()
  const sizeScale = responsive.medium / previous.medium
  const widthScale = innerWidth / previous.viewportWidth
  const heightScale = innerHeight / previous.viewportHeight
  for (const heart of activeHearts) {
    heart.size *= sizeScale; heart.x *= widthScale; heart.y *= heightScale
  }
  for (const heart of [...coverHearts, ...fieldHearts]) { heart.x *= widthScale; heart.y *= heightScale; heart.size *= sizeScale }
  for (const heart of piledHearts) heart.size *= sizeScale
  const middleCanvas = document.querySelector('.heart-ocean-middle canvas')
  // Update both lists without restoring hearts already removed by digging.
  for (const hearts of [middleCanvas?._hearts, middleCanvas?._initialHearts]) {
    for (const heart of hearts || []) Object.assign(heart, middleHeartLayout(heart.layoutSample, innerWidth, innerHeight))
  }
  resizeHeartCanvases()
  const pixelRatio = renderPixelRatio(innerWidth, innerHeight, window.devicePixelRatio)
  renderer.setPixelRatio(pixelRatio)
  shovelRenderer.setPixelRatio(pixelRatio)
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); shovelRenderer.setSize(innerWidth, innerHeight)
  if (oceanSceneEntered) {
    if (motionCharacter && motionFinalBasePosition) {
      motionCharacter.position.copy(motionFinalBasePosition)
      shiftObjectByViewportHeight(motionCharacter, .15)
    }
    if (shovel && shovelBasePosition) {
      shovel.position.copy(shovelBasePosition)
      shiftObjectByViewportHeight(shovel, -.2)
      shovelViewportPositioned = true
    }
  }
})

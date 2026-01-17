import './style.css'
import * as THREE from 'three'

const app = document.querySelector('#app')
app.innerHTML = `
  <div id="scene-container"></div>
  <div id="ui">Use arrow keys or WASD to move — click to focus</div>
`

const container = document.getElementById('scene-container')

const scene = new THREE.Scene()
scene.fog = new THREE.FogExp2(0x888888, 0.0025)

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000)
camera.position.set(0, 1.8, 6)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(window.devicePixelRatio)
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.outputEncoding = THREE.sRGBEncoding
container.appendChild(renderer.domElement)

// Load image textures and video texture
const texLoader = new THREE.TextureLoader()
const imagePaths = [
  new URL('./assets/0001.png', import.meta.url).href,
  new URL('./assets/0003.png', import.meta.url).href,
  new URL('./assets/0004.png', import.meta.url).href,
  new URL('./assets/0005.png', import.meta.url).href,
  new URL('./assets/0006.png', import.meta.url).href,
  new URL('./assets/0007.png', import.meta.url).href,
  new URL('./assets/0008.png', import.meta.url).href,
  new URL('./assets/0009.png', import.meta.url).href,
  new URL('./assets/0010.png', import.meta.url).href,
  new URL('./assets/0011.png', import.meta.url).href
]
let imageTextures = []

// Load textures and only proceed once they're available to avoid marking
// textures for update before image data exists.
const loadTexture = (p) => new Promise((res) => {
  texLoader.load(p, (t) => {
    t.encoding = THREE.sRGBEncoding
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    res(t)
  }, undefined, () => res(null))
})

const texturesReady = Promise.all(imagePaths.map(loadTexture)).then((txs) => {
  imageTextures = txs.filter(Boolean)
})

function makeTextureForFace(srcTex, faceW, faceH) {
  // clone the texture so repeat/offset changes don't affect other meshes
  const t = srcTex.clone()
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
  t.center.set(0.5, 0.5)

  function adjust() {
    const img = t.image
    if (!img || !img.width || !img.height) return
    const imgAspect = img.width / img.height
    const faceAspect = faceW / faceH
    if (imgAspect > faceAspect) {
      // image is wider than face: fit width
      const scale = faceAspect / imgAspect
      t.repeat.set(scale, 1)
    } else {
      // image is taller than face: fit height
      const scale = imgAspect / faceAspect
      t.repeat.set(1, scale)
    }
    t.offset.set((1 - t.repeat.x) / 2, (1 - t.repeat.y) / 2)
    t.needsUpdate = true
  }

  // if image already loaded, adjust immediately, otherwise wait
  if (t.image && t.image.complete) adjust()
  else if (t.image) t.image.addEventListener('load', adjust)
  return t
}

// create video element and texture (muted so browsers allow autoplay when clicked)
let videoTexture = null
const videoEl = document.createElement('video')
videoEl.src = new URL('./assets/0002.mp4', import.meta.url).href
videoEl.loop = true
videoEl.muted = true
videoEl.playsInline = true
videoEl.preload = 'auto'
videoEl.crossOrigin = 'anonymous'
videoTexture = new THREE.VideoTexture(videoEl)
videoTexture.encoding = THREE.sRGBEncoding
videoTexture.minFilter = THREE.LinearFilter
videoTexture.magFilter = THREE.LinearFilter
videoTexture.format = THREE.RGBAFormat

// Lights
const hemi = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.8)
scene.add(hemi)
const dir = new THREE.DirectionalLight(0xffffff, 0.8)
dir.position.set(5, 10, 7.5)
dir.castShadow = true
scene.add(dir)

// Ground (wireframe)
const groundMat = new THREE.MeshStandardMaterial({ color: 0x223322, wireframe: true })
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000, 200, 200), groundMat)
ground.rotation.x = -Math.PI / 2
ground.position.y = 0
scene.add(ground)

// City generation
const city = new THREE.Group()
scene.add(city)

// For collision checks
const buildingBoxes = []
const playerRadius = 0.45

const palette = [0x8fbf8f, 0xa0c4ff, 0xffc89a, 0xffe082, 0xb39ddb, 0x90a4ae]

function makeBuilding(x, z) {
  const isWide = Math.random() < 0.18
  const w = isWide ? (2 + Math.random() * 3) : (1 + Math.random() * 1.6)
  const d = isWide ? (2 + Math.random() * 3) : (1 + Math.random() * 1.6)
  const h = 2 + Math.random() * 24
  const geom = new THREE.BoxGeometry(w, h, d)
  const color = palette[Math.floor(Math.random() * palette.length)]

  // Create per-face materials. Box faces order: +X, -X, +Y, -Y, +Z, -Z
  const materials = []
  for (let i = 0; i < 6; i++) {
    // default building faces are wireframe
    materials.push(new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.7, wireframe: true }))
  }

  // keep building faces wireframe; we'll add overlay planes (images/videos)

  const mesh = new THREE.Mesh(geom, materials)
  mesh.position.set(x, h / 2, z)
  mesh.userData.wide = isWide

  // helper to add overlay plane to a side keeping aspect ratio and inset
  function addOverlay(isVideo, srcTexture, faceIndex) {
    // create a square overlay container whose size is comparable to the face
    // and an inner image/video plane that preserves the source aspect ratio
    // clone textures for safety
    let mapTex = srcTexture
    if (!isVideo && srcTexture && srcTexture.clone) {
      mapTex = srcTexture.clone()
      mapTex.wrapS = mapTex.wrapT = THREE.ClampToEdgeWrapping
      if (mapTex.repeat) mapTex.repeat.set(1, 1)
      if (mapTex.offset) mapTex.offset.set(0, 0)
    } else if (isVideo && srcTexture) {
      mapTex = srcTexture
      mapTex.wrapS = mapTex.wrapT = THREE.ClampToEdgeWrapping
    }

    const material = new THREE.MeshBasicMaterial({ map: mapTex, toneMapped: false, transparent: true, depthTest: true, depthWrite: false, side: THREE.DoubleSide })

    // overlay scales (images/videos same scale) and face dims
    const overlayScale = 1.6
    const faceW = (faceIndex === 0 || faceIndex === 1) ? d : w
    const faceH = h

    // make the outer plane square and at most the smaller of faceW/faceH * scale
    const squareSide = Math.min(faceW, faceH) * overlayScale

    // inner plane size will be computed to preserve aspect and fit inside the square
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
    const containerGroup = new THREE.Group()
    containerGroup.add(inner)

    function adjustInner(aspect) {
      if (!isFinite(aspect) || aspect <= 0) aspect = 1
      let innerW, innerH
      if (aspect >= 1) {
        innerW = squareSide
        innerH = squareSide / aspect
      } else {
        innerH = squareSide
        innerW = squareSide * aspect
      }
      if (inner.geometry) inner.geometry.dispose()
      inner.geometry = new THREE.PlaneGeometry(innerW, innerH)
      inner.position.set(0, 0, 0)
    }

    // wait for source size then adjust
    if (isVideo) {
      function applyVideoSize() {
        const vw = videoEl.videoWidth || 1
        const vh = videoEl.videoHeight || 1
        adjustInner(vw / vh)
      }
      if (videoEl.readyState >= 1) applyVideoSize()
      else videoEl.addEventListener('loadedmetadata', applyVideoSize)
    } else {
      const img = srcTexture.image
      if (img && img.complete && img.naturalWidth) {
        adjustInner(img.naturalWidth / img.naturalHeight)
      } else if (img) {
        img.addEventListener('load', () => adjustInner(img.naturalWidth / img.naturalHeight))
      }
    }

    // position the containerGroup slightly in front of the face
    const eps = 0.01
    if (faceIndex === 0) {
      containerGroup.position.set(w / 2 + eps, 0, 0)
      containerGroup.rotation.y = -Math.PI / 2
    } else if (faceIndex === 1) {
      containerGroup.position.set(-w / 2 - eps, 0, 0)
      containerGroup.rotation.y = Math.PI / 2
    } else if (faceIndex === 4) {
      containerGroup.position.set(0, 0, d / 2 + eps)
      containerGroup.rotation.y = 0
    } else if (faceIndex === 5) {
      containerGroup.position.set(0, 0, -d / 2 - eps)
      containerGroup.rotation.y = Math.PI
    }

    containerGroup.renderOrder = 2
    mesh.add(containerGroup)
  }

  // Sporadically add a small number of overlay planes to side faces
  const sideFaces = [0, 1, 4, 5]
  if (Math.random() < 0.35) {
    const count = 1 + Math.floor(Math.random() * 3)
    for (let k = 0; k < count; k++) {
      const face = sideFaces[Math.floor(Math.random() * sideFaces.length)]
      if (Math.random() < 0.12) {
        const vt = new THREE.VideoTexture(videoEl)
        vt.encoding = THREE.sRGBEncoding
        vt.minFilter = THREE.LinearFilter
        vt.magFilter = THREE.LinearFilter
        vt.format = THREE.RGBAFormat
        addOverlay(true, vt, face)
      } else {
        const src = imageTextures[Math.floor(Math.random() * imageTextures.length)]
        addOverlay(false, src, face)
      }
    }
  }

  return mesh
}

// Defer city generation until textures are loaded to ensure overlays
// have valid image data when created.
texturesReady.then(() => {
  const grid = 18
  const spacing = 4
  // Roads every N grid lines
  const roadEvery = 4
  const roadWidth = spacing * 0.9

  for (let i = 0; i < grid; i++) {
    for (let j = 0; j < grid; j++) {
      const isRoadX = (i % roadEvery === 0)
      const isRoadZ = (j % roadEvery === 0)
      if (isRoadX || isRoadZ) continue // leave space for roads

      const x = (i - grid / 2) * spacing + (Math.random() - 0.5) * 0.6
      const z = (j - grid / 2) * spacing + (Math.random() - 0.5) * 0.6
      const b = makeBuilding(x, z)
      city.add(b)
      // compute and store bounding box expanded slightly for collision
      const box = new THREE.Box3().setFromObject(b)
      box.expandByScalar(0.25)
      buildingBoxes.push(box)
    }
  }

  // Create road meshes (long strips) where grid lines land
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x0f0f0f, roughness: 1, metalness: 0 })
  const length = grid * spacing + spacing
  for (let i = 0; i < grid; i++) {
    if (i % roadEvery !== 0) continue
    const x = (i - grid / 2) * spacing
    const geom = new THREE.BoxGeometry(roadWidth, 0.04, length)
    const road = new THREE.Mesh(geom, roadMat)
    road.position.set(x, 0.02, 0)
    scene.add(road)
  }
  for (let j = 0; j < grid; j++) {
    if (j % roadEvery !== 0) continue
    const z = (j - grid / 2) * spacing
    const geom = new THREE.BoxGeometry(length, 0.04, roadWidth)
    const road = new THREE.Mesh(geom, roadMat)
    road.position.set(0, 0.02, z)
    scene.add(road)
  }

  // place camera outside the city so it spawns looking in
  // use the scene extent (`length`) to pick a good distance
  camera.position.set(0, 1.8, Math.max(12, Math.ceil(length * 1.3)))
  camera.lookAt(0, 1.8, 0)

  animate()
})

// Simple navigation (yaw + move)
const keys = {}
const speed = 0.35
let yaw = 0

function onKeyDown(e) { keys[e.key.toLowerCase()] = true }
function onKeyUp(e) { keys[e.key.toLowerCase()] = false }
window.addEventListener('keydown', onKeyDown)
window.addEventListener('keyup', onKeyUp)

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}
window.addEventListener('resize', resize)

// Click to focus (helps with key events on some browsers) and start muted video playback
container.addEventListener('click', () => {
  container.focus()
  if (videoEl && videoEl.paused) {
    videoEl.play().catch(() => {})
  }
})
container.tabIndex = 0

const forward = new THREE.Vector3()
const right = new THREE.Vector3()

function tryMove(delta) {
  const proposed = camera.position.clone().add(delta)
  const sphere = new THREE.Sphere(proposed, playerRadius)

  let blocked = false
  for (const box of buildingBoxes) {
    if (sphere.intersectsBox(box)) { blocked = true; break }
  }
  if (!blocked) { camera.position.copy(proposed); return }

  // sliding: try X-only then Z-only
  const proposedX = camera.position.clone().add(new THREE.Vector3(delta.x, 0, 0))
  const sphereX = new THREE.Sphere(proposedX, playerRadius)
  let blockedX = buildingBoxes.some(box => sphereX.intersectsBox(box))
  if (!blockedX) { camera.position.copy(proposedX); return }

  const proposedZ = camera.position.clone().add(new THREE.Vector3(0, 0, delta.z))
  const sphereZ = new THREE.Sphere(proposedZ, playerRadius)
  let blockedZ = buildingBoxes.some(box => sphereZ.intersectsBox(box))
  if (!blockedZ) { camera.position.copy(proposedZ); return }
}

function animate() {
  requestAnimationFrame(animate)

  // rotation with left/right or a/d
  if (keys['arrowleft'] || keys['a']) yaw += 0.03
  if (keys['arrowright'] || keys['d']) yaw -= 0.03

  // compute direction vectors
  camera.rotation.y = yaw
  camera.getWorldDirection(forward)
  forward.y = 0
  forward.normalize()
  right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()

  // movement with collision
  const moveDelta = new THREE.Vector3()
  if (keys['arrowup'] || keys['w']) moveDelta.add(forward)
  if (keys['arrowdown'] || keys['s']) moveDelta.addScaledVector(forward, -1)
  if (keys['q']) moveDelta.addScaledVector(right, -1)
  if (keys['e']) moveDelta.add(right)
  if (moveDelta.lengthSq() > 0) {
    moveDelta.normalize().multiplyScalar(speed)
    tryMove(moveDelta)
  }

  // clamp camera height
  if (camera.position.y < 1.5) camera.position.y = 1.5

  renderer.render(scene, camera)
}

animate()

import * as THREE from 'three'

export const loadingManager = new THREE.LoadingManager()
export const texLoader = new THREE.TextureLoader(loadingManager)

export function getImagePaths() {
  const imageModules = import.meta.glob('../assets/img/*.{png,jpg,jpeg,webp}', { eager: true })
  return Object.values(imageModules).map(m => (m && m.default) || m).filter(Boolean)
}

export function loadTextures(paths) {
  return Promise.all(paths.map(p => new Promise((res) => {
    texLoader.load(p, (t) => {
      t.encoding = THREE.sRGBEncoding
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      res(t)
    }, undefined, () => res(null))
  }))).then(txs => txs.filter(Boolean))
}

export function makeTextureForFace(srcTex, faceW, faceH) {
  const canvas = document.createElement('canvas')
  const faceAspect = faceW / faceH || 1
  let cw, ch
  if (faceAspect >= 1) { cw = 1024; ch = Math.max(64, Math.round(1024 / faceAspect)) }
  else { ch = 1024; cw = Math.max(64, Math.round(1024 * faceAspect)) }
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')

  const tex = new THREE.CanvasTexture(canvas)
  tex.encoding = THREE.sRGBEncoding
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping

  function drawImageToCanvas(img) {
    if (!img || !img.width || !img.height) return
    ctx.clearRect(0, 0, cw, ch)
    const scale = Math.min(cw / img.width, ch / img.height)
    const iw = Math.round(img.width * scale)
    const ih = Math.round(img.height * scale)
    const ix = Math.round((cw - iw) / 2)
    const iy = Math.round((ch - ih) / 2)
    ctx.drawImage(img, ix, iy, iw, ih)
    tex.needsUpdate = true
  }

  const img = srcTex.image
  if (img && img.complete && img.naturalWidth) drawImageToCanvas(img)
  else if (img) img.addEventListener('load', () => drawImageToCanvas(img))
  return tex
}

export function createVideoTexture() {
  const videoEl = document.createElement('video')
  videoEl.src = new URL('../assets/video/0001.mp4', import.meta.url).href
  videoEl.loop = true
  videoEl.autoplay = true
  videoEl.muted = true
  videoEl.playsInline = true
  videoEl.preload = 'auto'
  videoEl.crossOrigin = 'anonymous'
  const videoTexture = new THREE.VideoTexture(videoEl)
  videoTexture.encoding = THREE.sRGBEncoding
  videoTexture.minFilter = THREE.LinearFilter
  videoTexture.magFilter = THREE.LinearFilter
  videoTexture.format = THREE.RGBAFormat
  videoEl.play().catch(() => {})
  return { videoEl, videoTexture }
}

export function loadEnvironment(renderer, scene) {
  const pmremGenerator = new THREE.PMREMGenerator(renderer)
  pmremGenerator.compileEquirectangularShader()

  // create an equirectangular-like gradient on a canvas and use it as background
  const w = 2048, h = 1024
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0.0, '#095291')
  grad.addColorStop(0.45, '#2f6b8f')
  grad.addColorStop(0.8, '#6ea0c8')
  grad.addColorStop(1.0, '#dfeffb')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  const canvasTex = new THREE.CanvasTexture(canvas)
  canvasTex.encoding = THREE.sRGBEncoding
  canvasTex.mapping = THREE.EquirectangularReflectionMapping
  canvasTex.needsUpdate = true

  // generate a PMREM environment from the canvas texture so PBR materials keep lighting
  const envMap = pmremGenerator.fromEquirectangular(canvasTex).texture
  scene.environment = envMap
  scene.background = canvasTex

  // ensure renderer clear color matches primary hue so change is visible
  try {
    renderer.setClearColor(new THREE.Color('#095291'))
  } catch (e) {}

  // increase global brightness via renderer tone mapping exposure
  try {
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
  } catch (e) {
    // ignore if renderer doesn't support tone mapping
  }

  pmremGenerator.dispose()
  return Promise.resolve(envMap)
}

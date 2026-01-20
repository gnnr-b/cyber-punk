import * as THREE from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'

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
  const hdrPath = new URL('../assets/background.hdr', import.meta.url).href
  return new Promise((resolve) => {
    new HDRLoader(loadingManager).load(hdrPath, (hdrTex) => {
      const envMap = pmremGenerator.fromEquirectangular(hdrTex).texture
      scene.environment = envMap
      scene.background = envMap
      if (hdrTex.dispose) hdrTex.dispose()
      pmremGenerator.dispose()
      resolve(envMap)
    }, undefined, (err) => { console.warn('HDR load failed', err); resolve(null) })
  })
}

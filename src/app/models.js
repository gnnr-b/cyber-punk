import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export async function initModels(opts) {
  const { scene, imageTextures, videoTexture, loadingManager, interactiveObjects, buildingBoxes, city } = opts
  const grid = 12
  const spacing = 8
  const roadEvery = 4

  const gltfLoader = new GLTFLoader(loadingManager)
  const modelFiles = [
    new URL('../assets/models/chains.glb', import.meta.url).href,
    new URL('../assets/models/ghost.glb', import.meta.url).href,
    new URL('../assets/models/hooded.glb', import.meta.url).href,
    new URL('../assets/models/lantern.glb', import.meta.url).href,
    new URL('../assets/models/maiden.glb', import.meta.url).href
  ]

  function randomPos(radius = 24) {
    const a = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * radius
    return [Math.cos(a) * r, Math.sin(a) * r]
  }

  function placeObjectNoOverlap(createMeshFn) {
    for (let tries = 0; tries < 50; tries++) {
      const [rx, rz] = randomPos(24)
      const mesh = createMeshFn(rx, rz)
      const box = new THREE.Box3().setFromObject(mesh)
      box.expandByScalar(0.6)
      const overlap = buildingBoxes.some(b => b.intersectsBox(box))
      if (!overlap) { city.add(mesh); buildingBoxes.push(box); return mesh }
    }
    return null
  }

  function makeHoloMaterial(scene) {
    return new THREE.MeshPhysicalMaterial({
      color: 0x07101a, metalness: 0.98, roughness: 0.06, transmission: 0.0, thickness: 0.0,
      ior: 1.6, envMapIntensity: 1.4, clearcoat: 0.85, clearcoatRoughness: 0.01, emissive: 0x00060a,
      emissiveIntensity: 0.01, transparent: false, opacity: 1.0, side: THREE.DoubleSide
    })
  }

  modelFiles.forEach((p) => {
    gltfLoader.load(p, (g) => {
      const root = g.scene || g.scenes[0]
      root.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true } })
      const createFn = (rx, rz) => {
        const clone = root.clone()
        const randScale = 1.5 + Math.random() * 2.5
        clone.scale.setScalar(randScale)
        clone.traverse((node) => {
          if (!node.isMesh) return
          const holoMat = makeHoloMaterial(scene)
          if (scene.environment) holoMat.envMap = scene.environment
          holoMat.side = THREE.DoubleSide
          node.material = holoMat
          node.castShadow = true
          node.receiveShadow = true
          node.visible = true
          node.frustumCulled = false
          try { if (node.geometry && !node.geometry.attributes.normal) node.geometry.computeVertexNormals() } catch (e) {}
        })
        clone.position.set(rx, 0, rz)
        const bbox = new THREE.Box3().setFromObject(clone)
        const size = new THREE.Vector3()
        bbox.getSize(size)
        const maxDim = Math.max(size.x, size.y, size.z, 0.0001)
        const target = 3.5
        const normScale = target / maxDim
        const finalScale = THREE.MathUtils.clamp(normScale * randScale, 0.5, 6.0)
        clone.scale.setScalar(finalScale)
        const bbox2 = new THREE.Box3().setFromObject(clone)
        const minY = bbox2.min.y
        const lift = (minY < 0) ? -minY + 0.05 : 0.05
        clone.position.y = lift
        return clone
      }
      const placed = placeObjectNoOverlap(createFn)
      if (placed) {
        const placedBox = new THREE.Box3().setFromObject(placed)
        placedBox.expandByScalar(0.6)
        buildingBoxes.push(placedBox)
        try { placed.userData.haikuSrc = p } catch (e) {}
        interactiveObjects.push(placed)
      }
    }, undefined, () => {})
  })

  const totalPanels = 14
  const panelSize = 3.5
  for (let i = 0; i < totalPanels; i++) {
    const createPanel = (rx, rz) => {
      const geom = new THREE.BoxGeometry(panelSize, panelSize, panelSize)
      const baseMat = new THREE.MeshStandardMaterial({ color: 0x0f0f0f, metalness: 0.9, roughness: 0.12 })
      const materials = []
      const faceFilenames = []
      for (let fi = 0; fi < 6; fi++) materials.push(baseMat)
      if (imageTextures.length) {
        const faceH = panelSize
        for (const fi of [0, 1, 4, 5]) {
          if (Math.random() < 0.12 && videoTexture) {
            materials[fi] = new THREE.MeshStandardMaterial({ map: videoTexture, metalness: 0.0, roughness: 0.35, emissive: 0xffffff, emissiveMap: videoTexture, emissiveIntensity: 0.6 })
            continue
          }
          const src = imageTextures[Math.floor(Math.random() * imageTextures.length)]
          const faceW = panelSize
          const tex = (typeof src === 'object' && src.image) ? src : null
          materials[fi] = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.0, roughness: 0.35, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.6 })
          try { if (src && src.image && src.image.src) faceFilenames.push(src.image.src) } catch (e) {}
        }
      }
      const mesh = new THREE.Mesh(geom, materials)
      mesh.position.set(rx, panelSize/2, rz)
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.userData.haikuSrc = faceFilenames.length ? faceFilenames[0] : null
      interactiveObjects.push(mesh)
      return mesh
    }
    placeObjectNoOverlap(createPanel)
  }

  const length = grid * spacing + spacing
  const wrapLimit = Math.max(48, Math.ceil(length * 0.55))

  function findSpawnInside(maxRadius = Math.max(8, length * 0.35), tries = 300) {
    for (let i = 0; i < tries; i++) {
      const a = Math.random() * Math.PI * 2
      const bias = (i < tries * 0.5) ? 0.5 : 1.0
      const r = Math.random() * maxRadius * bias
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      const pos = new THREE.Vector3(x, 1.8, z)
      const sphere = new THREE.Sphere(pos, 0.45)
      let blocked = false
      for (const box of buildingBoxes) { if (sphere.intersectsBox(box)) { blocked = true; break } }
      if (!blocked) return pos
    }
    return null
  }

  const spawnPos = findSpawnInside()
  return { spawnPos, wrapLimit }
}

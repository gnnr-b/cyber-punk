import * as THREE from 'three'

export function setupControls(camera, buildingBoxes, opts = {}) {
  const keys = {}
  const speed = opts.speed || 0.35
  const playerRadius = opts.playerRadius || 0.45
  let yaw = 0
  const forward = new THREE.Vector3()
  const right = new THREE.Vector3()

  function onKeyDown(e) { keys[e.key.toLowerCase()] = true }
  function onKeyUp(e) { keys[e.key.toLowerCase()] = false }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  function tryMove(delta) {
    const proposed = camera.position.clone().add(delta)
    const sphere = new THREE.Sphere(proposed, playerRadius)
    let blocked = false
    for (const box of buildingBoxes) { if (sphere.intersectsBox(box)) { blocked = true; break } }
    if (!blocked) { camera.position.copy(proposed); return }
    const proposedX = camera.position.clone().add(new THREE.Vector3(delta.x, 0, 0))
    const sphereX = new THREE.Sphere(proposedX, playerRadius)
    let blockedX = buildingBoxes.some(box => sphereX.intersectsBox(box))
    if (!blockedX) { camera.position.copy(proposedX); return }
    const proposedZ = camera.position.clone().add(new THREE.Vector3(0, 0, delta.z))
    const sphereZ = new THREE.Sphere(proposedZ, playerRadius)
    let blockedZ = buildingBoxes.some(box => sphereZ.intersectsBox(box))
    if (!blockedZ) { camera.position.copy(proposedZ); return }
  }

  return {
    update() {
      if (keys['arrowleft'] || keys['a']) yaw += 0.03
      if (keys['arrowright'] || keys['d']) yaw -= 0.03
      camera.rotation.set(camera.rotation.x, yaw, 0)
      forward.set(-Math.sin(yaw), 0, -Math.cos(yaw))
      right.set(Math.cos(yaw), 0, -Math.sin(yaw))
      const moveDelta = new THREE.Vector3()
      if (keys['arrowup'] || keys['w']) moveDelta.add(forward)
      if (keys['arrowdown'] || keys['s']) moveDelta.addScaledVector(forward, -1)
      if (keys['q']) moveDelta.addScaledVector(right, -1)
      if (keys['e']) moveDelta.add(right)
      if (moveDelta.lengthSq() > 0) {
        moveDelta.normalize().multiplyScalar(speed)
        tryMove(moveDelta)
      }
      if (camera.position.y < 1.5) camera.position.y = 1.5
      return { yaw, forward, right }
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }
}

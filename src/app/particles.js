import * as THREE from 'three'

export function createFireflySystem(scene, opts = {}) {
  const FIREFLY_COUNT = opts.count || 300
  const FIREFLY_AREA_RADIUS = opts.areaRadius || 48

  const positions = new Float32Array(FIREFLY_COUNT * 3)
  const scales = new Float32Array(FIREFLY_COUNT)
  const phases = new Float32Array(FIREFLY_COUNT)
  const velocities = []
  const color = new THREE.Color(0xfff2b0)

  for (let i = 0; i < FIREFLY_COUNT; i++) {
    const r = Math.sqrt(Math.random()) * FIREFLY_AREA_RADIUS
    const a = Math.random() * Math.PI * 2
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    const y = 0.6 + Math.random() * 6.5
    positions[i * 3 + 0] = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z
    scales[i] = 0.9 + Math.random() * 1.6
    phases[i] = Math.random() * Math.PI * 2
    velocities.push(new THREE.Vector3((Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.08))
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1))
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))

  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0.0 }, uColor: { value: color } },
    vertexShader: `
      attribute float aScale; attribute float aPhase; varying float vPhase; uniform float uTime; void main() {
        vPhase = aPhase; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float tw = 1.0 + 0.45 * sin(uTime * 1.6 + aPhase);
        gl_PointSize = aScale * tw * (120.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor; varying float vPhase; uniform float uTime; void main() {
        vec2 c = gl_PointCoord - vec2(0.5); float dist = length(c);
        float alpha = smoothstep(0.55, 0.0, dist);
        float flick = 0.35 + 0.25 * sin(uTime * 2.2 + vPhase);
        vec3 col = uColor * 0.92; gl_FragColor = vec4(col, alpha * flick * 0.6);
      }
    `,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
  })

  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  scene.add(points)

  return {
    update(dt) {
      mat.uniforms.uTime.value += dt
      const posAttr = geo.getAttribute('position')
      for (let i = 0; i < FIREFLY_COUNT; i++) {
        const ix = i * 3
        velocities[i].x += (Math.random() - 0.5) * 0.02
        velocities[i].y += (Math.random() - 0.5) * 0.01
        velocities[i].z += (Math.random() - 0.5) * 0.02
        velocities[i].x = THREE.MathUtils.clamp(velocities[i].x, -0.25, 0.25)
        velocities[i].y = THREE.MathUtils.clamp(velocities[i].y, -0.12, 0.12)
        velocities[i].z = THREE.MathUtils.clamp(velocities[i].z, -0.25, 0.25)
        posAttr.array[ix + 0] += velocities[i].x * dt * 12.0
        posAttr.array[ix + 1] += velocities[i].y * dt * 12.0
        posAttr.array[ix + 2] += velocities[i].z * dt * 12.0
        if (posAttr.array[ix + 1] < 0.4) { posAttr.array[ix + 1] = 0.4; velocities[i].y = Math.abs(velocities[i].y) }
        if (posAttr.array[ix + 1] > 9.0) { posAttr.array[ix + 1] = 9.0; velocities[i].y = -Math.abs(velocities[i].y) }
        const x = posAttr.array[ix + 0], z = posAttr.array[ix + 2]
        if (x * x + z * z > FIREFLY_AREA_RADIUS * FIREFLY_AREA_RADIUS) {
          posAttr.array[ix + 0] *= 0.92; posAttr.array[ix + 2] *= 0.92; velocities[i].x *= -0.6; velocities[i].z *= -0.6
        }
      }
      posAttr.needsUpdate = true
    },
    dispose() {
      try { scene.remove(points) } catch (e) {}
    }
  }
}

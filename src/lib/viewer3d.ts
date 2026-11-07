import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export interface GeoPart { x: number; y: number; rot: number; side: 'F' | 'B'; box: [number, number, number, number] }
export interface Geo { outline: [number, number, number, number]; parts: Record<string, GeoPart> }
export interface Highlight { pending: string[]; target?: string | null; solder?: string | null }

export interface Viewer3d {
  el: HTMLElement
  setHighlight(h: Highlight): void
  resetView(): void
  /** When on, the camera moves to the part being placed / soldered; when off it returns to the overview. */
  setFollow(on: boolean): void
  destroy(): void
}

const MM = 1 / 1000 // the KiCad glTF export is in metres, board coordinates are in mm
const STATE_COLORS = { pending: 0xf59e0b, target: 0x16a34a, solder: 0xdc2626 } as const

/**
 * Orbitable 3D board from the kicad-cli glTF export. Part nodes are named by reference designator, so a part can be
 * highlighted by name. Parts without a 3D model (test points, modules, ...) get a translucent marker box at their
 * footprint position instead.
 */
export async function createViewer3d(url: string, geo: Geo, onPick: (designator: string) => void): Promise<Viewer3d> {
  const el = document.createElement('div')
  el.className = 'viewer3d'
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  el.append(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf4f6f8)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6))
  const sun = new THREE.DirectionalLight(0xffffff, 1.8)
  sun.position.set(0.1, 0.4, 0.2)
  scene.add(sun)

  const camera = new THREE.PerspectiveCamera(35, 1, 0.005, 5)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true

  const gltf = await new GLTFLoader().loadAsync(url)
  scene.add(gltf.scene)

  // Register part nodes by designator.
  const parts = new Map<string, THREE.Object3D>()
  gltf.scene.traverse((o) => { if (/^[A-Za-z]+\d+$/.test(o.name)) parts.set(o.name, o) })

  // Markers for footprints without a 3D model.
  const markerMat = new THREE.MeshStandardMaterial({ color: 0x64748b, transparent: true, opacity: 0.35 })
  for (const [ref, p] of Object.entries(geo.parts)) {
    if (parts.has(ref) || p.side === 'B') continue
    const [x0, y0, x1, y1] = p.box
    const w = Math.max(x1 - x0, 1.5) * MM
    const d = Math.max(y1 - y0, 1.5) * MM
    const hgt = 4 * MM
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), markerMat)
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0x475569 })))
    m.position.set(((x0 + x1) / 2) * MM, 1.6 * MM + hgt / 2, ((y0 + y1) / 2) * MM)
    m.name = ref
    scene.add(m)
    parts.set(ref, m)
  }

  // Frame the board.
  const [ox0, oy0, ox1, oy1] = geo.outline
  const center = new THREE.Vector3(((ox0 + ox1) / 2) * MM, 0, ((oy0 + oy1) / 2) * MM)
  const spanX = (ox1 - ox0) * MM
  const spanZ = (oy1 - oy0) * MM
  /** Camera pose that fits the whole board (viewed from ~65 degrees above the board plane). */
  function overview(target: THREE.Vector3, position: THREE.Vector3) {
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const dist = Math.max(spanZ / 2 / t, spanX / 2 / (t * camera.aspect)) * 1.12 + 0.01
    target.copy(center)
    position.copy(center).add(tiltDir(65).multiplyScalar(dist))
  }
  const resetView = () => {
    glide = null
    overview(controls.target, camera.position)
    camera.up.set(0, 1, 0)
    controls.update()
  }

  // Highlight materials (shared) and bookkeeping to restore the original ones.
  const mats = Object.fromEntries(
    (Object.keys(STATE_COLORS) as (keyof typeof STATE_COLORS)[]).map((k) => [k, new THREE.MeshStandardMaterial({
      color: STATE_COLORS[k], emissive: STATE_COLORS[k], emissiveIntensity: 0.6, roughness: 0.5,
    })]),
  ) as Record<keyof typeof STATE_COLORS, THREE.MeshStandardMaterial>
  const original = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
  const meshesOf = (o: THREE.Object3D) => {
    const out: THREE.Mesh[] = []
    o.traverse((c) => { if ((c as THREE.Mesh).isMesh) out.push(c as THREE.Mesh) })
    return out
  }
  const restore = () => { for (const [m, mat] of original) m.material = mat; original.clear() }
  let pulse: THREE.MeshStandardMaterial | null = null

  const setHighlight = (h: Highlight) => {
    restore()
    const apply = (ref: string | null | undefined, state: keyof typeof STATE_COLORS) => {
      const node = ref ? parts.get(ref) : undefined
      if (!node) return
      for (const m of meshesOf(node)) {
        if (!original.has(m)) original.set(m, m.material)
        m.material = mats[state]
      }
    }
    for (const d of h.pending) apply(d, 'pending')
    apply(h.target, 'target')
    apply(h.solder, 'solder')
    pulse = h.solder ? mats.solder : h.target ? mats.target : null
    last = h
    if (follow) focusOn(h.solder ?? h.target ?? null)
  }

  // ---- camera follow: glide to the current part (or back to the overview) ----
  let follow = false
  let last: Highlight = { pending: [] }
  let glide: { t0: number; fromT: THREE.Vector3; toT: THREE.Vector3; fromP: THREE.Vector3; toP: THREE.Vector3 } | null = null
  const tiltDir = (deg: number) => new THREE.Vector3(0, Math.sin(THREE.MathUtils.degToRad(deg)), Math.cos(THREE.MathUtils.degToRad(deg)))
  function glideTo(target: THREE.Vector3, position: THREE.Vector3) {
    glide = { t0: performance.now(), fromT: controls.target.clone(), toT: target, fromP: camera.position.clone(), toP: position }
  }
  function focusOn(ref: string | null) {
    const node = ref ? parts.get(ref) : undefined
    if (!node) {
      const t = new THREE.Vector3()
      const p = new THREE.Vector3()
      overview(t, p)
      return glideTo(t, p)
    }
    const box = new THREE.Box3().setFromObject(node)
    const c = box.getCenter(new THREE.Vector3())
    const dist = Math.min(Math.max(box.getSize(new THREE.Vector3()).length() * 2.4 + 0.04, 0.055), 0.25)
    glideTo(c, c.clone().add(tiltDir(58).multiplyScalar(dist)))
  }

  // Click a part to pick it (ignore drags).
  const ray = new THREE.Raycaster()
  let down: [number, number] | null = null
  renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY] })
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return
    const r = renderer.domElement.getBoundingClientRect()
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
    for (const hit of ray.intersectObjects(scene.children, true)) {
      for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
        if (parts.get(o.name) === o) return onPick(o.name)
      }
    }
  })

  const resize = () => {
    const w = el.clientWidth || 600
    const h = el.clientHeight || 380
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  let touched = false // refit on resize until the user moves the camera
  controls.addEventListener('start', () => { touched = true })
  const ro = new ResizeObserver(() => { resize(); if (!touched && !follow) resetView() })
  ro.observe(el)
  resize()
  resetView()

  let raf = 0
  const loop = (t: number) => {
    raf = requestAnimationFrame(loop)
    if (glide) {
      const k = Math.min(1, (performance.now() - glide.t0) / 650)
      const e = k * k * (3 - 2 * k)
      controls.target.lerpVectors(glide.fromT, glide.toT, e)
      camera.position.lerpVectors(glide.fromP, glide.toP, e)
      if (k >= 1) glide = null
    }
    if (pulse) pulse.emissiveIntensity = 0.6 + 0.5 * Math.sin(t / 220)
    controls.update()
    renderer.render(scene, camera)
  }
  raf = requestAnimationFrame(loop)

  return {
    el,
    setHighlight,
    resetView,
    setFollow(on: boolean) {
      follow = on
      focusOn(on ? last.solder ?? last.target ?? null : null)
    },
    destroy() {
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      renderer.dispose()
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose?.()
      })
      el.remove()
    },
  }
}

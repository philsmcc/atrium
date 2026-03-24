// SPDX-License-Identifier: MIT
// Atrium World Builder — tools/world-builder/builder.js

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { createSkydome } from '@atrium/skydome'

// ═══════════════════════════════════════════════════════════════════
// 1. GEOMETRY CATALOG
// ═══════════════════════════════════════════════════════════════════

const MATERIAL_PRESETS = {
  concrete: { color: '#999999', metallic: 0,    roughness: 0.95 },
  wood:     { color: '#8B6914', metallic: 0,    roughness: 0.85 },
  metal:    { color: '#aaaaaa', metallic: 1,    roughness: 0.25 },
  plastic:  { color: '#ee5533', metallic: 0,    roughness: 0.4  },
  glass:    { color: '#aaddff', metallic: 0.1,  roughness: 0.05, opacity: 0.3 },
  grass:    { color: '#3a7d3a', metallic: 0,    roughness: 0.9  },
  stone:    { color: '#7a7a72', metallic: 0,    roughness: 0.92 },
  brick:    { color: '#8b4513', metallic: 0,    roughness: 0.88 },
  water:    { color: '#2266aa', metallic: 0.3,  roughness: 0.1, opacity: 0.6 },
  emissive: { color: '#ffcc44', metallic: 0,    roughness: 0.5, emissive: '#ffcc44' },
}

function makeDefaultMat(hex = '#888888') {
  return new THREE.MeshStandardMaterial({
    color: hex,
    metalness: 0,
    roughness: 0.7,
    side: THREE.DoubleSide,
  })
}

// Each generator returns a { geometry, yOffset } pair.
// yOffset places the bottom on Y=0 by default.
const PRIMITIVES = {
  box:      { label: 'Box',      icon: '◻', gen: () => ({ geometry: new THREE.BoxGeometry(1, 1, 1),       yOffset: 0.5  }) },
  sphere:   { label: 'Sphere',   icon: '●', gen: () => ({ geometry: new THREE.SphereGeometry(0.5, 24, 16), yOffset: 0.5  }) },
  cylinder: { label: 'Cylinder', icon: '⬬', gen: () => ({ geometry: new THREE.CylinderGeometry(0.4, 0.4, 1, 24), yOffset: 0.5 }) },
  cone:     { label: 'Cone',     icon: '△', gen: () => ({ geometry: new THREE.ConeGeometry(0.5, 1, 24),    yOffset: 0.5  }) },
  plane:    { label: 'Plane',    icon: '▬', gen: () => {
    const g = new THREE.PlaneGeometry(2, 2)
    g.rotateX(-Math.PI / 2)
    return { geometry: g, yOffset: 0 }
  }},
  torus:    { label: 'Torus',    icon: '◎', gen: () => ({ geometry: new THREE.TorusGeometry(0.5, 0.15, 12, 32), yOffset: 0.65 }) },
  capsule:  { label: 'Capsule',  icon: '⬭', gen: () => ({ geometry: new THREE.CapsuleGeometry(0.3, 0.8, 8, 16), yOffset: 0.7 }) },
}

const STRUCTURES = {
  wall: { label: 'Wall', icon: '▮', gen: () => ({ geometry: new THREE.BoxGeometry(4, 2.5, 0.2), yOffset: 1.25 }) },
  floor: { label: 'Floor', icon: '⏥', gen: () => {
    const g = new THREE.PlaneGeometry(10, 10)
    g.rotateX(-Math.PI / 2)
    return { geometry: g, yOffset: 0 }
  }},
  column: { label: 'Column', icon: '▏', gen: () => ({ geometry: new THREE.CylinderGeometry(0.2, 0.2, 3, 16), yOffset: 1.5 }) },
  ramp: { label: 'Ramp', icon: '⟋', gen: () => {
    // Wedge shape via extruded triangle
    const shape = new THREE.Shape()
    shape.moveTo(0, 0)
    shape.lineTo(3, 0)
    shape.lineTo(0, 1.5)
    shape.closePath()
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1.5, bevelEnabled: false })
    g.translate(-1.5, 0, -0.75)
    return { geometry: g, yOffset: 0 }
  }},
  stairs: { label: 'Stairs', icon: '⏏', gen: () => {
    const group = new THREE.BufferGeometry()
    const geos = []
    for (let i = 0; i < 6; i++) {
      const step = new THREE.BoxGeometry(1.2, 0.25, 0.4)
      step.translate(0, i * 0.25 + 0.125, -i * 0.4)
      geos.push(step)
    }
    const merged = mergeGeometries(geos)
    return { geometry: merged, yOffset: 0 }
  }},
  arch: { label: 'Arch', icon: '⌒', gen: () => {
    const shape = new THREE.Shape()
    shape.moveTo(-1.5, 0)
    shape.lineTo(-1.5, 2)
    shape.absarc(0, 2, 1.5, Math.PI, 0, true)
    shape.lineTo(1.5, 0)
    shape.lineTo(1.2, 0)
    shape.lineTo(1.2, 2)
    shape.absarc(0, 2, 1.2, 0, Math.PI, false)
    shape.lineTo(-1.2, 0)
    shape.closePath()
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false })
    g.translate(0, 0, -0.15)
    return { geometry: g, yOffset: 0 }
  }},
}

const ENVIRONMENT = {
  tree: { label: 'Tree', icon: '🌲', gen: () => {
    const trunk = new THREE.CylinderGeometry(0.08, 0.12, 1.2, 8)
    trunk.translate(0, 0.6, 0)
    const crown = new THREE.SphereGeometry(0.6, 12, 8)
    crown.translate(0, 1.6, 0)
    const merged = mergeGeometries([trunk, crown])
    return { geometry: merged, yOffset: 0 }
  }},
  rock: { label: 'Rock', icon: '🪨', gen: () => {
    const g = new THREE.IcosahedronGeometry(0.5, 0)
    g.scale(1, 0.6, 0.9)
    return { geometry: g, yOffset: 0.3 }
  }},
  bench: { label: 'Bench', icon: '🪑', gen: () => {
    const geos = []
    // Seat
    const seat = new THREE.BoxGeometry(1.5, 0.08, 0.5)
    seat.translate(0, 0.45, 0)
    geos.push(seat)
    // Legs
    for (const x of [-0.65, 0.65]) {
      for (const z of [-0.2, 0.2]) {
        const leg = new THREE.BoxGeometry(0.06, 0.45, 0.06)
        leg.translate(x, 0.225, z)
        geos.push(leg)
      }
    }
    // Back
    const back = new THREE.BoxGeometry(1.5, 0.5, 0.06)
    back.translate(0, 0.73, -0.22)
    geos.push(back)
    return { geometry: mergeGeometries(geos), yOffset: 0 }
  }},
  crate: { label: 'Crate', icon: '📦', gen: () => ({ geometry: new THREE.BoxGeometry(0.5, 0.5, 0.5), yOffset: 0.25 }) },
}

const LIGHTS = {
  pointLight:  { label: 'Point',  icon: '💡', isLight: true, gen: () => new THREE.PointLight(0xffffff, 40, 20) },
  spotLight:   { label: 'Spot',   icon: '🔦', isLight: true, gen: () => { const l = new THREE.SpotLight(0xffffff, 60, 20, Math.PI/6); l.position.y = 3; return l } },
  dirLight:    { label: 'Sun',    icon: '☀', isLight: true, gen: () => { const l = new THREE.DirectionalLight(0xffffff, 1.5); l.position.set(5, 10, 5); return l } },
}

// Merge array of BufferGeometry into one
function mergeGeometries(geos) {
  const positions = [], normals = [], indices = []
  let offset = 0
  for (const g of geos) {
    g.computeVertexNormals()
    const pos = g.attributes.position.array
    const nrm = g.attributes.normal.array
    for (let i = 0; i < pos.length; i++) positions.push(pos[i])
    for (let i = 0; i < nrm.length; i++) normals.push(nrm[i])
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) indices.push(g.index.array[i] + offset)
    } else {
      for (let i = 0; i < pos.length / 3; i++) indices.push(i + offset)
    }
    offset += pos.length / 3
    g.dispose()
  }
  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  merged.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3))
  merged.setIndex(indices)
  return merged
}


// ═══════════════════════════════════════════════════════════════════
// 2. THREE.JS SCENE SETUP
// ═══════════════════════════════════════════════════════════════════

const viewportEl = document.getElementById('viewport')

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(window.devicePixelRatio)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
viewportEl.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = null  // skydome provides the background
scene.fog = new THREE.FogExp2(0xc0d0e0, 0.008)

// Skydome
const skydome = createSkydome({ radius: 400 })
scene.add(skydome.mesh)

// Camera
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 500)
camera.position.set(8, 6, 8)

// Orbit controls
const orbit = new OrbitControls(camera, renderer.domElement)
orbit.enableDamping = true
orbit.dampingFactor = 0.08
orbit.target.set(0, 0, 0)

// Transform controls
const transformCtrl = new TransformControls(camera, renderer.domElement)
transformCtrl.addEventListener('dragging-changed', (e) => {
  orbit.enabled = !e.value
  if (!e.value && selected) syncInspectorFromMesh()
})
transformCtrl.addEventListener('objectChange', () => {
  if (selected) syncInspectorFromMesh()
})
scene.add(transformCtrl)

// Ambient light (warmer to match sky)
scene.add(new THREE.AmbientLight(0xddeeff, 0.7))

// Default sun (warm daylight)
const defaultSun = new THREE.DirectionalLight(0xfff8e7, 1.4)
defaultSun.position.set(5, 10, 5)
defaultSun.castShadow = true
defaultSun.shadow.mapSize.set(2048, 2048)
defaultSun.shadow.camera.left = -15
defaultSun.shadow.camera.right = 15
defaultSun.shadow.camera.top = 15
defaultSun.shadow.camera.bottom = -15
scene.add(defaultSun)

// Ground grid (subtle, complements sky)
const gridHelper = new THREE.GridHelper(40, 40, 0x667788, 0x556677)
scene.add(gridHelper)

// Infinite ground plane for raycasting
const groundPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: 0x8a9a6a, roughness: 1 })
)
groundPlane.rotation.x = -Math.PI / 2
groundPlane.receiveShadow = true
groundPlane.userData.isGround = true
scene.add(groundPlane)

// Resize
function onResize() {
  const w = viewportEl.clientWidth
  const h = viewportEl.clientHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', onResize)
onResize()


// ═══════════════════════════════════════════════════════════════════
// 3. SCENE OBJECT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

const sceneObjects = []   // { mesh, name, type }
let selected = null       // current sceneObject
let nameCounter = {}

function uniqueName(base) {
  nameCounter[base] = (nameCounter[base] || 0) + 1
  return nameCounter[base] === 1 ? base : `${base}-${nameCounter[base]}`
}

function addObject(type, catalog, options = {}) {
  const entry = catalog[type]
  if (!entry) return

  if (entry.isLight) {
    const light = entry.gen()
    const name = uniqueName(entry.label)
    light.name = name
    // Add a visible helper
    const helper = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffff00 })
    )
    helper.name = name
    helper.userData.isLight = true
    helper.userData.lightRef = light
    if (!options.position) helper.position.set(0, 3, 0)
    else helper.position.fromArray(options.position)
    light.position.copy(helper.position)
    scene.add(light)
    scene.add(helper)
    const obj = { mesh: helper, name, type: 'light-' + type, lightRef: light }
    sceneObjects.push(obj)
    selectObject(obj)
    refreshSceneTree()
    updateStatus()
    pushUndo()
    return obj
  }

  const { geometry, yOffset } = entry.gen()
  geometry.computeVertexNormals()
  const mat = options.material || makeDefaultMat()
  const mesh = new THREE.Mesh(geometry, mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  const name = uniqueName(entry.label)
  mesh.name = name

  if (options.position) {
    mesh.position.fromArray(options.position)
  } else {
    mesh.position.set(0, yOffset, 0)
  }

  scene.add(mesh)
  const obj = { mesh, name, type }
  sceneObjects.push(obj)
  selectObject(obj)
  refreshSceneTree()
  updateStatus()
  pushUndo()
  return obj
}

function removeObject(obj) {
  if (!obj) return
  if (obj === selected) deselectAll()
  scene.remove(obj.mesh)
  if (obj.lightRef) scene.remove(obj.lightRef)
  obj.mesh.geometry?.dispose()
  obj.mesh.material?.dispose()
  const idx = sceneObjects.indexOf(obj)
  if (idx >= 0) sceneObjects.splice(idx, 1)
  refreshSceneTree()
  updateStatus()
  pushUndo()
}

function duplicateObject(obj) {
  if (!obj || obj.mesh.userData.isLight) return
  const mesh = obj.mesh
  const newMat = mesh.material.clone()
  const newGeo = mesh.geometry.clone()
  const newMesh = new THREE.Mesh(newGeo, newMat)
  newMesh.castShadow = true
  newMesh.receiveShadow = true
  const name = uniqueName(obj.type)
  newMesh.name = name
  newMesh.position.copy(mesh.position).add(new THREE.Vector3(1, 0, 1))
  newMesh.rotation.copy(mesh.rotation)
  newMesh.scale.copy(mesh.scale)
  scene.add(newMesh)
  const newObj = { mesh: newMesh, name, type: obj.type }
  sceneObjects.push(newObj)
  selectObject(newObj)
  refreshSceneTree()
  updateStatus()
  pushUndo()
}

function selectObject(obj) {
  selected = obj
  if (obj) {
    transformCtrl.attach(obj.mesh)
    document.getElementById('transformSection').style.display = ''
    document.getElementById('materialSection').style.display = obj.mesh.userData.isLight ? 'none' : ''
    syncInspectorFromMesh()
  }
  refreshSceneTree()
}

function deselectAll() {
  selected = null
  transformCtrl.detach()
  document.getElementById('transformSection').style.display = 'none'
  document.getElementById('materialSection').style.display = 'none'
  refreshSceneTree()
}


// ═══════════════════════════════════════════════════════════════════
// 4. PALETTE UI
// ═══════════════════════════════════════════════════════════════════

function populatePalette(containerId, catalog) {
  const el = document.getElementById(containerId)
  for (const [type, entry] of Object.entries(catalog)) {
    const item = document.createElement('div')
    item.className = 'palette-item'
    item.innerHTML = `<span class="icon">${entry.icon}</span><span>${entry.label}</span>`
    item.addEventListener('click', () => addObject(type, catalog))
    el.appendChild(item)
  }
}

populatePalette('primitivePalette', PRIMITIVES)
populatePalette('structurePalette', STRUCTURES)
populatePalette('envPalette', ENVIRONMENT)
populatePalette('lightPalette', LIGHTS)


// ═══════════════════════════════════════════════════════════════════
// 5. SCENE TREE
// ═══════════════════════════════════════════════════════════════════

function refreshSceneTree() {
  const tree = document.getElementById('sceneTree')
  tree.innerHTML = ''
  for (const obj of sceneObjects) {
    const el = document.createElement('div')
    el.className = 'tree-node' + (obj === selected ? ' selected' : '')
    el.textContent = obj.name
    const tag = document.createElement('span')
    tag.className = 'type-tag'
    tag.textContent = obj.type
    el.appendChild(tag)
    el.addEventListener('click', (e) => { e.stopPropagation(); selectObject(obj) })
    tree.appendChild(el)
  }
}


// ═══════════════════════════════════════════════════════════════════
// 6. INSPECTOR SYNC
// ═══════════════════════════════════════════════════════════════════

const DEG = 180 / Math.PI
const RAD = Math.PI / 180

const propName     = document.getElementById('propName')
const posX = document.getElementById('posX'), posY = document.getElementById('posY'), posZ = document.getElementById('posZ')
const rotX = document.getElementById('rotX'), rotY = document.getElementById('rotY'), rotZ = document.getElementById('rotZ')
const sclX = document.getElementById('sclX'), sclY = document.getElementById('sclY'), sclZ = document.getElementById('sclZ')
const matColor     = document.getElementById('matColor')
const matMetallic  = document.getElementById('matMetallic')
const matRoughness = document.getElementById('matRoughness')
const matMetallicVal  = document.getElementById('matMetallicVal')
const matRoughnessVal = document.getElementById('matRoughnessVal')
const matPreset    = document.getElementById('matPreset')
const matEmissive  = document.getElementById('matEmissive')

function syncInspectorFromMesh() {
  if (!selected) return
  const m = selected.mesh
  propName.value = selected.name

  posX.value = m.position.x.toFixed(2)
  posY.value = m.position.y.toFixed(2)
  posZ.value = m.position.z.toFixed(2)

  const euler = new THREE.Euler().setFromQuaternion(m.quaternion, 'YXZ')
  rotX.value = (euler.x * DEG).toFixed(1)
  rotY.value = (euler.y * DEG).toFixed(1)
  rotZ.value = (euler.z * DEG).toFixed(1)

  sclX.value = m.scale.x.toFixed(2)
  sclY.value = m.scale.y.toFixed(2)
  sclZ.value = m.scale.z.toFixed(2)

  if (m.material && m.material.color) {
    matColor.value = '#' + m.material.color.getHexString()
    matMetallic.value = m.material.metalness ?? 0
    matMetallicVal.textContent = matMetallic.value
    matRoughness.value = m.material.roughness ?? 0.7
    matRoughnessVal.textContent = matRoughness.value
    if (m.material.emissive) {
      matEmissive.value = '#' + m.material.emissive.getHexString()
    }
  }
}

function syncMeshFromInspector() {
  if (!selected) return
  const m = selected.mesh

  selected.name = propName.value || selected.name
  m.name = selected.name

  m.position.set(parseFloat(posX.value)||0, parseFloat(posY.value)||0, parseFloat(posZ.value)||0)
  const euler = new THREE.Euler(
    (parseFloat(rotX.value)||0) * RAD,
    (parseFloat(rotY.value)||0) * RAD,
    (parseFloat(rotZ.value)||0) * RAD,
    'YXZ'
  )
  m.quaternion.setFromEuler(euler)
  m.scale.set(parseFloat(sclX.value)||1, parseFloat(sclY.value)||1, parseFloat(sclZ.value)||1)

  if (m.material && m.material.color) {
    m.material.color.set(matColor.value)
    m.material.metalness = parseFloat(matMetallic.value)
    m.material.roughness = parseFloat(matRoughness.value)
    if (m.material.emissive) m.material.emissive.set(matEmissive.value)
  }

  if (selected.lightRef) {
    selected.lightRef.position.copy(m.position)
  }

  refreshSceneTree()
}

// Bind inspector inputs
for (const el of [propName, posX, posY, posZ, rotX, rotY, rotZ, sclX, sclY, sclZ, matColor, matMetallic, matRoughness, matEmissive]) {
  el.addEventListener('input', () => {
    syncMeshFromInspector()
    matMetallicVal.textContent = parseFloat(matMetallic.value).toFixed(2)
    matRoughnessVal.textContent = parseFloat(matRoughness.value).toFixed(2)
  })
  el.addEventListener('change', pushUndo)
}

// Material presets
matPreset.addEventListener('change', () => {
  const p = MATERIAL_PRESETS[matPreset.value]
  if (!p || !selected) return
  matColor.value = p.color
  matMetallic.value = p.metallic
  matRoughness.value = p.roughness
  matMetallicVal.textContent = p.metallic.toFixed(2)
  matRoughnessVal.textContent = p.roughness.toFixed(2)
  matEmissive.value = p.emissive || '#000000'
  if (p.opacity && selected.mesh.material) {
    selected.mesh.material.transparent = true
    selected.mesh.material.opacity = p.opacity
  } else if (selected.mesh.material) {
    selected.mesh.material.transparent = false
    selected.mesh.material.opacity = 1
  }
  syncMeshFromInspector()
  pushUndo()
})


// ═══════════════════════════════════════════════════════════════════
// 7. RAYCASTING — CLICK TO SELECT
// ═══════════════════════════════════════════════════════════════════

const raycaster = new THREE.Raycaster()
const mouse = new THREE.Vector2()

renderer.domElement.addEventListener('pointerdown', (e) => {
  // Skip if transform control is active
  if (transformCtrl.dragging) return

  const rect = renderer.domElement.getBoundingClientRect()
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(mouse, camera)
  const meshes = sceneObjects.map(o => o.mesh)
  const hits = raycaster.intersectObjects(meshes, false)

  if (hits.length > 0) {
    const hitMesh = hits[0].object
    const obj = sceneObjects.find(o => o.mesh === hitMesh)
    if (obj) selectObject(obj)
  } else {
    deselectAll()
  }
})


// ═══════════════════════════════════════════════════════════════════
// 8. KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════════════════════

document.addEventListener('keydown', (e) => {
  // Don't intercept when typing in inputs
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return

  if (e.key === 'w' || e.key === 'W') { setTransformMode('translate'); e.preventDefault() }
  if (e.key === 'e' || e.key === 'E') { setTransformMode('rotate');    e.preventDefault() }
  if (e.key === 'r' || e.key === 'R') { setTransformMode('scale');     e.preventDefault() }

  if (e.key === 'Delete' || e.key === 'Backspace') { removeObject(selected); e.preventDefault() }

  if (e.key === 'd' && (e.ctrlKey || e.metaKey)) { duplicateObject(selected); e.preventDefault() }
  if (e.key === 'z' && (e.ctrlKey || e.metaKey)) { undo(); e.preventDefault() }
  if (e.key === 'y' && (e.ctrlKey || e.metaKey)) { redo(); e.preventDefault() }

  if (e.key === 'Escape') deselectAll()
})

// Transform mode buttons
function setTransformMode(mode) {
  transformCtrl.setMode(mode)
  document.querySelectorAll('button.mode').forEach(b => b.classList.remove('active'))
  if (mode === 'translate') document.getElementById('modeTranslate').classList.add('active')
  if (mode === 'rotate')    document.getElementById('modeRotate').classList.add('active')
  if (mode === 'scale')     document.getElementById('modeScale').classList.add('active')
}

document.getElementById('modeTranslate').addEventListener('click', () => setTransformMode('translate'))
document.getElementById('modeRotate').addEventListener('click',    () => setTransformMode('rotate'))
document.getElementById('modeScale').addEventListener('click',     () => setTransformMode('scale'))

document.getElementById('btnDuplicate').addEventListener('click', () => duplicateObject(selected))
document.getElementById('btnDelete').addEventListener('click',    () => removeObject(selected))


// ═══════════════════════════════════════════════════════════════════
// 9. UNDO / REDO (snapshot-based)
// ═══════════════════════════════════════════════════════════════════

const undoStack = []
const redoStack = []
const MAX_UNDO = 50

function captureSnapshot() {
  return sceneObjects.map(obj => ({
    type: obj.type,
    name: obj.name,
    position: obj.mesh.position.toArray(),
    quaternion: obj.mesh.quaternion.toArray(),
    scale: obj.mesh.scale.toArray(),
    color: obj.mesh.material?.color ? '#' + obj.mesh.material.color.getHexString() : '#888888',
    metalness: obj.mesh.material?.metalness ?? 0,
    roughness: obj.mesh.material?.roughness ?? 0.7,
    emissive: obj.mesh.material?.emissive ? '#' + obj.mesh.material.emissive.getHexString() : '#000000',
    opacity: obj.mesh.material?.opacity ?? 1,
    transparent: obj.mesh.material?.transparent ?? false,
    isLight: !!obj.mesh.userData.isLight,
  }))
}

function restoreSnapshot(snap) {
  // Clear current scene
  for (const obj of [...sceneObjects]) {
    scene.remove(obj.mesh)
    if (obj.lightRef) scene.remove(obj.lightRef)
    obj.mesh.geometry?.dispose()
    obj.mesh.material?.dispose()
  }
  sceneObjects.length = 0
  nameCounter = {}
  deselectAll()

  for (const s of snap) {
    const allCatalogs = { ...PRIMITIVES, ...STRUCTURES, ...ENVIRONMENT }
    const lightCatalogs = LIGHTS
    const lightType = s.type?.replace('light-', '')

    if (s.isLight && lightCatalogs[lightType]) {
      const obj = addObjectSilent(lightType, lightCatalogs, s)
    } else if (allCatalogs[s.type]) {
      const obj = addObjectSilent(s.type, allCatalogs, s)
    }
  }
  refreshSceneTree()
  updateStatus()
}

// Add without triggering undo
function addObjectSilent(type, catalog, snap) {
  const entry = catalog[type]
  if (!entry) return null

  if (entry.isLight) {
    const light = entry.gen()
    const name = snap.name || uniqueName(entry.label)
    light.name = name
    const helper = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffff00 })
    )
    helper.name = name
    helper.userData.isLight = true
    helper.userData.lightRef = light
    helper.position.fromArray(snap.position || [0, 3, 0])
    light.position.copy(helper.position)
    scene.add(light)
    scene.add(helper)
    const obj = { mesh: helper, name, type: 'light-' + type, lightRef: light }
    sceneObjects.push(obj)
    return obj
  }

  const { geometry, yOffset } = entry.gen()
  geometry.computeVertexNormals()
  const mat = makeDefaultMat(snap.color || '#888888')
  mat.metalness = snap.metalness ?? 0
  mat.roughness = snap.roughness ?? 0.7
  if (snap.emissive) mat.emissive.set(snap.emissive)
  if (snap.transparent) { mat.transparent = true; mat.opacity = snap.opacity ?? 1 }
  const mesh = new THREE.Mesh(geometry, mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  const name = snap.name || uniqueName(entry.label)
  mesh.name = name
  mesh.position.fromArray(snap.position || [0, yOffset, 0])
  if (snap.quaternion) mesh.quaternion.fromArray(snap.quaternion)
  if (snap.scale) mesh.scale.fromArray(snap.scale)
  scene.add(mesh)
  const obj = { mesh, name, type }
  sceneObjects.push(obj)
  return obj
}

function pushUndo() {
  undoStack.push(captureSnapshot())
  if (undoStack.length > MAX_UNDO) undoStack.shift()
  redoStack.length = 0
}

function undo() {
  if (undoStack.length < 2) return
  redoStack.push(undoStack.pop())
  const prev = undoStack[undoStack.length - 1]
  restoreSnapshot(prev)
}

function redo() {
  if (redoStack.length === 0) return
  const snap = redoStack.pop()
  undoStack.push(snap)
  restoreSnapshot(snap)
}

document.getElementById('btnUndo').addEventListener('click', undo)
document.getElementById('btnRedo').addEventListener('click', redo)

// Initial undo state
pushUndo()


// ═══════════════════════════════════════════════════════════════════
// 10. EXPORT — glTF
// ═══════════════════════════════════════════════════════════════════

document.getElementById('btnExportGltf').addEventListener('click', async () => {
  const exportScene = new THREE.Scene()

  // Add Atrium metadata
  const worldName = document.getElementById('worldName').value || 'My World'
  const maxUsers  = parseInt(document.getElementById('worldMaxUsers').value) || 20
  const navMode   = document.getElementById('worldNavMode').value || 'WALK'

  // Copy scene objects into export scene
  for (const obj of sceneObjects) {
    if (obj.mesh.userData.isLight) continue // skip light helpers for now
    const clone = obj.mesh.clone()
    clone.material = obj.mesh.material.clone()
    exportScene.add(clone)
  }

  const exporter = new GLTFExporter()
  const gltf = await exporter.parseAsync(exportScene, { binary: false })

  // Inject Atrium metadata
  gltf.extras = {
    atrium: {
      version: '0.1.0',
      world: {
        name: worldName,
        maxUsers,
        navigation: {
          mode: [navMode, 'FLY', 'ORBIT'],
          terrainFollowing: navMode === 'WALK',
          speed: { default: 1.4, min: 0.5, max: 5 },
          collision: { enabled: false },
          updateRate: { positionInterval: 1000, maxViewRate: 20 },
        },
        capabilities: {
          tick: { interval: 1000 },
          physics: false,
          chat: false,
        },
      },
    },
  }

  const json = JSON.stringify(gltf, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = worldName.replace(/\s+/g, '-').toLowerCase() + '.gltf'
  a.click()
  URL.revokeObjectURL(url)
  setStatusMsg('Exported ' + a.download)
})


// ═══════════════════════════════════════════════════════════════════
// 11. PUSH LIVE — send objects to running Atrium server
// ═══════════════════════════════════════════════════════════════════

const pushDialog  = document.getElementById('pushDialog')
const pushStatus  = document.getElementById('pushStatus')

document.getElementById('btnPushLive').addEventListener('click', () => {
  pushDialog.style.display = ''
  pushStatus.textContent = ''
  pushStatus.className = 'push-status'
})
document.getElementById('pushCancel').addEventListener('click', () => {
  pushDialog.style.display = 'none'
})

document.getElementById('pushConfirm').addEventListener('click', async () => {
  const wsUrl = document.getElementById('pushWsUrl').value.trim()
  if (!wsUrl) return
  pushStatus.textContent = 'Connecting…'
  pushStatus.className = 'push-status'

  try {
    const ws = new WebSocket(wsUrl)
    const sessionId = crypto.randomUUID()
    let seq = 0

    await new Promise((resolve, reject) => {
      ws.onopen = () => {
        pushStatus.textContent = 'Connected, reading server state…'
        ws.send(JSON.stringify({ type: 'hello', id: sessionId }))
      }

      ws.onmessage = async (evt) => {
        const msg = JSON.parse(evt.data)

        if (msg.type === 'som-dump') {
          const gltf = msg.gltf
          const sceneDef = gltf?.scenes?.[gltf.scene ?? 0]
          const topIndices = sceneDef?.nodes ?? []

          // Step 1: Remove ALL non-avatar server nodes (handles duplicates)
          // Collect every name (including duplicates) so each remove targets one
          const toRemove = []
          for (const idx of topIndices) {
            const node = gltf.nodes?.[idx]
            if (!node?.name) continue
            if (node.name.startsWith('User-')) continue
            toRemove.push(node.name)
          }

          pushStatus.textContent = `Removing ${toRemove.length} old nodes…`
          for (const name of toRemove) {
            ws.send(JSON.stringify({ type: 'remove', seq: ++seq, node: name }))
            await new Promise(r => setTimeout(r, 20))
          }

          // Step 2: Add all builder objects fresh
          const toAdd = sceneObjects.filter(obj => !obj.mesh.userData.isLight)
          pushStatus.textContent = `Adding ${toAdd.length} objects…`
          for (const obj of toAdd) {
            const descriptor = buildNodeDescriptor(obj)
            ws.send(JSON.stringify({ type: 'add', seq: ++seq, format: 'gltf', node: descriptor }))
            await new Promise(r => setTimeout(r, 20))
          }

          pushStatus.textContent = `✓ Synced! ${toRemove.length} cleared, ${toAdd.length} pushed`
          pushStatus.className = 'push-status ok'
          setTimeout(() => ws.close(), 500)
          resolve()
        }

        if (msg.type === 'error') {
          pushStatus.textContent = `Error: ${msg.message}`
          pushStatus.className = 'push-status err'
        }
      }

      ws.onerror = () => {
        pushStatus.textContent = 'Connection failed'
        pushStatus.className = 'push-status err'
        reject()
      }
    })
  } catch (e) {
    pushStatus.textContent = 'Failed: ' + (e.message || e)
    pushStatus.className = 'push-status err'
  }
})

function buildNodeDescriptor(obj) {
  const m = obj.mesh
  const geo = m.geometry
  const positions = Array.from(geo.attributes.position.array)
  const normals   = geo.attributes.normal ? Array.from(geo.attributes.normal.array) : []
  const indices   = geo.index ? Array.from(geo.index.array) : []

  const desc = {
    name: obj.name,
    translation: m.position.toArray(),
    rotation: m.quaternion.toArray(),
    scale: m.scale.toArray(),
  }

  const matDesc = {}
  if (m.material) {
    matDesc.pbrMetallicRoughness = {
      baseColorFactor: [
        m.material.color.r,
        m.material.color.g,
        m.material.color.b,
        m.material.opacity ?? 1,
      ],
      metallicFactor:  m.material.metalness ?? 0,
      roughnessFactor: m.material.roughness ?? 0.7,
    }
  }

  const attrs = { POSITION: positions }
  if (normals.length > 0) attrs.NORMAL = normals

  const primitive = { attributes: attrs, material: matDesc }
  if (indices.length > 0) primitive.indices = indices

  desc.mesh = { primitives: [primitive] }

  return desc
}


// ═══════════════════════════════════════════════════════════════════
// 12. STATUS BAR
// ═══════════════════════════════════════════════════════════════════

function updateStatus() {
  document.getElementById('objectCount').textContent = sceneObjects.length + ' object' + (sceneObjects.length !== 1 ? 's' : '')
}

function setStatusMsg(msg) {
  const el = document.getElementById('statusMsg')
  el.textContent = msg
  setTimeout(() => { el.textContent = 'Ready' }, 3000)
}


// ═══════════════════════════════════════════════════════════════════
// 13. RENDER LOOP
// ═══════════════════════════════════════════════════════════════════

let lastAnimTime = performance.now()
function animate(now) {
  requestAnimationFrame(animate)
  const dt = (now - lastAnimTime) / 1000
  lastAnimTime = now
  skydome.update(dt)
  orbit.update()
  renderer.render(scene, camera)
}
animate(performance.now())

updateStatus()


// ═══════════════════════════════════════════════════════════════════
// 14. LOAD FROM SERVER (Edit World from viewer, or manual button)
// ═══════════════════════════════════════════════════════════════════

const loadDialog  = document.getElementById('loadDialog')
const loadStatus  = document.getElementById('loadStatus')

document.getElementById('btnLoadServer').addEventListener('click', () => {
  loadDialog.style.display = ''
  loadStatus.textContent = ''
  loadStatus.className = 'push-status'
})
document.getElementById('loadCancel').addEventListener('click', () => {
  loadDialog.style.display = 'none'
})
document.getElementById('loadConfirm').addEventListener('click', () => {
  const wsUrl = document.getElementById('loadWsUrl').value.trim()
  if (!wsUrl) return
  loadWorldFromServer(wsUrl)
})

function loadWorldFromServer(wsUrl) {
  loadDialog.style.display = ''
  loadStatus.textContent = 'Connecting...'
  loadStatus.className = 'push-status'

  const ws = new WebSocket(wsUrl)
  const sessionId = crypto.randomUUID()

  const timeout = setTimeout(() => {
    ws.close()
    loadStatus.textContent = 'Timed out waiting for server'
    loadStatus.className = 'push-status err'
  }, 10000)

  ws.onopen = () => {
    loadStatus.textContent = 'Connected, requesting world...'
    ws.send(JSON.stringify({ type: 'hello', id: sessionId }))
  }

  ws.onmessage = (evt) => {
    const msg = JSON.parse(evt.data)

    if (msg.type === 'som-dump') {
      clearTimeout(timeout)
      loadStatus.textContent = 'Parsing world data...'

      try {
        const gltf = msg.gltf
        importGltfWorld(gltf, wsUrl)
        loadStatus.textContent = '✓ World loaded!'
        loadStatus.className = 'push-status ok'
        setTimeout(() => { loadDialog.style.display = 'none' }, 1200)
      } catch (err) {
        loadStatus.textContent = 'Parse error: ' + err.message
        loadStatus.className = 'push-status err'
        console.error('[Builder] Import error:', err)
      }

      ws.close()
    }
  }

  ws.onerror = () => {
    clearTimeout(timeout)
    loadStatus.textContent = 'Connection failed'
    loadStatus.className = 'push-status err'
  }
}

function importGltfWorld(gltf, wsUrl) {
  // Clear existing scene
  for (const obj of [...sceneObjects]) {
    scene.remove(obj.mesh)
    if (obj.lightRef) scene.remove(obj.lightRef)
    obj.mesh.geometry?.dispose()
    obj.mesh.material?.dispose()
  }
  sceneObjects.length = 0
  nameCounter = {}
  deselectAll()

  // Apply world metadata
  const meta = gltf?.extras?.atrium?.world
  if (meta) {
    if (meta.name) document.getElementById('worldName').value = meta.name
    if (meta.maxUsers) document.getElementById('worldMaxUsers').value = meta.maxUsers
    if (meta.navigation?.mode?.[0]) {
      document.getElementById('worldNavMode').value = meta.navigation.mode[0]
    }
  }

  // Set the push URL to match
  if (wsUrl) document.getElementById('pushWsUrl').value = wsUrl

  if (!gltf || !gltf.nodes) {
    setStatusMsg('World has no nodes')
    return
  }

  // Build a scene-level children list to skip child nodes (they belong to parents)
  const sceneDef = gltf.scenes?.[gltf.scene ?? 0]
  const topLevelNodeIndices = new Set(sceneDef?.nodes ?? [])

  let imported = 0

  for (const nodeIdx of topLevelNodeIndices) {
    const node = gltf.nodes[nodeIdx]
    if (!node) continue

    // Skip avatar nodes
    if (node.name && node.name.startsWith('User-')) continue

    // Gather child names for compound objects (e.g. lamp-01 with lamp-stand, lamp-shade)
    const childIndices = node.children || []

    // Extract material from the node or its first child with a mesh
    let pbr = null
    const meshIdx = node.mesh ?? (childIndices.length > 0 ? gltf.nodes[childIndices[0]]?.mesh : null)
    if (meshIdx != null && gltf.meshes?.[meshIdx]) {
      const meshDef = gltf.meshes[meshIdx]
      const primDef = meshDef.primitives?.[0]
      if (primDef?.material != null && gltf.materials?.[primDef.material]) {
        pbr = gltf.materials[primDef.material].pbrMetallicRoughness
      }
    }

    let matColor = '#888888', metalness = 0, roughness = 0.7
    if (pbr) {
      if (pbr.baseColorFactor) {
        const [r, g, b] = pbr.baseColorFactor
        matColor = '#' + [r, g, b].map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('')
      }
      if (pbr.metallicFactor != null) metalness = pbr.metallicFactor
      if (pbr.roughnessFactor != null) roughness = pbr.roughnessFactor
    }

    // Heuristic type detection from node name
    const name = node.name || 'imported'
    const lowerName = name.toLowerCase()

    let type = 'box', catalog = PRIMITIVES
    if (lowerName.includes('plane') || lowerName.includes('ground')) { type = 'plane'; catalog = PRIMITIVES }
    else if (lowerName.includes('sphere')) { type = 'sphere'; catalog = PRIMITIVES }
    else if (lowerName.includes('cylinder')) { type = 'cylinder'; catalog = PRIMITIVES }
    else if (lowerName.includes('cone')) { type = 'cone'; catalog = PRIMITIVES }
    else if (lowerName.includes('torus')) { type = 'torus'; catalog = PRIMITIVES }
    else if (lowerName.includes('capsule')) { type = 'capsule'; catalog = PRIMITIVES }
    else if (lowerName.includes('wall')) { type = 'wall'; catalog = STRUCTURES }
    else if (lowerName.includes('floor')) { type = 'floor'; catalog = STRUCTURES }
    else if (lowerName.includes('column')) { type = 'column'; catalog = STRUCTURES }
    else if (lowerName.includes('ramp')) { type = 'ramp'; catalog = STRUCTURES }
    else if (lowerName.includes('stairs')) { type = 'stairs'; catalog = STRUCTURES }
    else if (lowerName.includes('arch')) { type = 'arch'; catalog = STRUCTURES }
    else if (lowerName.includes('tree')) { type = 'tree'; catalog = ENVIRONMENT }
    else if (lowerName.includes('rock')) { type = 'rock'; catalog = ENVIRONMENT }
    else if (lowerName.includes('bench')) { type = 'bench'; catalog = ENVIRONMENT }
    else if (lowerName.includes('crate')) { type = 'crate'; catalog = ENVIRONMENT }
    else if (lowerName.includes('lamp')) { type = 'column'; catalog = STRUCTURES }

    const mat = makeDefaultMat(matColor)
    mat.metalness = metalness
    mat.roughness = roughness

    // Create geometry directly (bypass addObject to avoid auto-naming and undo spam)
    const entry = catalog[type]
    if (!entry || entry.isLight) continue
    const { geometry, yOffset } = entry.gen()
    geometry.computeVertexNormals()

    const mesh = new THREE.Mesh(geometry, mat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.name = name
    mesh.position.fromArray(node.translation || [0, yOffset, 0])
    if (node.rotation) mesh.quaternion.fromArray(node.rotation)
    if (node.scale) mesh.scale.fromArray(node.scale)

    scene.add(mesh)
    sceneObjects.push({ mesh, name, type })
    imported++
  }

  refreshSceneTree()
  updateStatus()
  pushUndo()
  setStatusMsg(`Imported ${imported} objects from live world`)
}

// Auto-load if ?server= param is present (from viewer's Edit World button)
;(function autoLoadFromParams() {
  const params = new URLSearchParams(window.location.search)
  const serverUrl = params.get('server')
  if (!serverUrl) return

  // Update the load URL input and auto-connect
  document.getElementById('loadWsUrl').value = serverUrl
  // Clear the URL param so refresh doesn't re-import
  window.history.replaceState({}, '', window.location.pathname)
  // Brief delay to let UI initialize
  setTimeout(() => loadWorldFromServer(serverUrl), 300)
})()

import * as THREE from 'three'
import { Fn, float, mix as tslMix, screenUV, texture, uniform, uv, vec2, vec4 } from 'three/tsl'
import { MeshBasicNodeMaterial, type WebGPURenderer } from 'three/webgpu'
import { type BitmapUiElement, type BitmapUiElementSettings, createBitmapUiElement } from './element'
import type {
  BitmapUiDebugSnapshot,
  BitmapUiKeyInput,
  BitmapUiKeyResult,
  BitmapUiPointerResult,
} from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BitmapUiAtlasElementDescriptor = {
  readonly settings: BitmapUiElementSettings
  readonly position: { readonly x: number; readonly y: number }
  readonly depth: number
  readonly backdropBlur?: number
}

export type BitmapUiAtlasPointerResult = {
  readonly elementId: string | null
  readonly elementResult: BitmapUiPointerResult | null
  readonly consumed: boolean
}

export type BitmapUiAtlasKeyResult = {
  readonly elementId: string | null
  readonly elementResult: BitmapUiKeyResult | null
  readonly consumed: boolean
}

export type BitmapUiAtlas = {
  // GPU resources — same shape as BitmapUiSurface for CRT rig integration
  readonly bgScene: THREE.Scene
  readonly bgCamera: THREE.PerspectiveCamera
  readonly gpuScene: THREE.Scene
  readonly gpuCamera: THREE.OrthographicCamera
  readonly gpuTarget: THREE.RenderTarget
  readonly contentTexture: THREE.DataTexture

  // Element management
  addElement: (descriptor: BitmapUiAtlasElementDescriptor) => BitmapUiElement
  removeElement: (elementId: string) => void
  getElement: (elementId: string) => BitmapUiElement | null

  // Element positioning + depth
  setElementPosition: (elementId: string, position: { readonly x: number; readonly y: number }) => void
  getElementPosition: (elementId: string) => { readonly x: number; readonly y: number } | null
  setElementDepth: (elementId: string, depth: number) => void

  // CRT integration
  setCrtSize: (width: number, height: number) => void
  setHiResMode: (enabled: boolean) => void
  setViewportSize: (width: number, height: number) => void

  // Input routing (CRT logical coordinates, top-left Y-down)
  handlePointerDown: (pos: { readonly x: number; readonly y: number }) => BitmapUiAtlasPointerResult
  handlePointerMove: (pos: { readonly x: number; readonly y: number }) => BitmapUiAtlasPointerResult
  handlePointerUp: (pos: { readonly x: number; readonly y: number }) => BitmapUiAtlasPointerResult
  handlePointerLeave: () => BitmapUiAtlasPointerResult
  handleKeyDown: (input: BitmapUiKeyInput) => BitmapUiAtlasKeyResult

  // Focus
  getFocusedElementId: () => string | null
  setFocusedElementId: (elementId: string | null) => void


  // Cursor
  loadBlueNoiseTexture: (url: string) => void
  setBlurStrength: (strength: number) => void
  setCursorVisible: (visible: boolean) => void
  setCursorSprite: (pixels: Uint8Array, width: number, height: number, hotspot: { readonly x: number; readonly y: number }) => void

  // Drag state (for consumer to detect active drag)
  getDragState: () => { readonly elementId: string; readonly interactionId: string } | null

  // Snapshots
  exportElementSnapshot: (elementId: string) => { readonly width: number; readonly height: number; readonly rgba: Uint8Array } | null
  exportElementDebugSnapshot: (elementId: string) => BitmapUiDebugSnapshot | null
  exportCompositeSnapshot: (renderer: WebGPURenderer) => Promise<{ readonly width: number; readonly height: number; readonly rgba: Uint8Array }>
  exportUiOnlySnapshot: (renderer: WebGPURenderer) => Promise<{ readonly width: number; readonly height: number; readonly rgba: Uint8Array }>

  // Rendering
  render: (renderer: WebGPURenderer) => void
  renderToScreen: (renderer: WebGPURenderer) => void

  dispose: () => void
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type ElementEntry = {
  readonly id: string
  readonly element: BitmapUiElement
  readonly mesh: THREE.Mesh
  readonly material: MeshBasicNodeMaterial
  position: { x: number; y: number }
  depth: number
  // Track last known texture size to detect resizes
  lastTextureWidth: number
  lastTextureHeight: number
  backdropBlur: number
}

type DragState = {
  readonly elementId: string
  readonly interactionId: string
  readonly startPosition: { readonly x: number; readonly y: number }
  readonly startPointer: { readonly x: number; readonly y: number }
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class BitmapUiAtlasImpl implements BitmapUiAtlas {
  readonly bgScene: THREE.Scene
  readonly bgCamera: THREE.PerspectiveCamera
  readonly gpuScene: THREE.Scene
  readonly gpuCamera: THREE.OrthographicCamera
  readonly gpuTarget: THREE.RenderTarget
  readonly contentTexture: THREE.DataTexture

  private readonly entries = new Map<string, ElementEntry>()
  private focusedElementId: string | null = null
  private hoveredElementId: string | null = null
  private dragState: DragState | null = null
  private disposed = false

  private crtLogicalWidth = 0
  private crtLogicalHeight = 0
  private hiResMode = false
  private viewportWidth = 0
  private viewportHeight = 0


  // Cursor
  private cursorVisible = false
  private cursorMesh: THREE.Mesh | null = null
  private cursorMaterial: MeshBasicNodeMaterial | null = null
  private cursorTexture: THREE.DataTexture | null = null
  private cursorWidth = 0
  private cursorHeight = 0
  private cursorHotspotX = 0
  private cursorHotspotY = 0
  private lastPointerX = 0
  private lastPointerY = 0

  // Backdrop blur
  private readonly blurRT1: THREE.RenderTarget
  private readonly blurRT2: THREE.RenderTarget
  private blurHMaterial: MeshBasicNodeMaterial | null = null
  private blurVMaterial: MeshBasicNodeMaterial | null = null
  private blurScene: THREE.Scene | null = null
  private blurCamera: THREE.OrthographicCamera | null = null
  private hasBackdropBlurElements = false
  private blurStrength = 1
  private blurStrengthUniform = uniform(1)
  private blueNoiseTexture: THREE.Texture | null = null

  private screenQuad: THREE.Mesh | null = null
  private screenQuadScene: THREE.Scene | null = null
  private screenQuadCamera: THREE.OrthographicCamera | null = null

  constructor() {
    // Start with a 1×1 target — setCrtSize() expands it.
    this.gpuTarget = new THREE.RenderTarget(1, 1, {
      depthBuffer: true,
      stencilBuffer: false,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      colorSpace: THREE.NoColorSpace,
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
      generateMipmaps: false,
    })
    this.gpuTarget.texture.name = 'BitmapUiAtlasComposite'
    this.contentTexture = this.gpuTarget.texture as unknown as THREE.DataTexture

    // Blur render targets for backdrop blur
    const blurRTOpts = { depthBuffer: false, stencilBuffer: false, format: THREE.RGBAFormat, type: THREE.UnsignedByteType, colorSpace: THREE.NoColorSpace, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, generateMipmaps: false }
    this.blurRT1 = new THREE.RenderTarget(1, 1, blurRTOpts)
    this.blurRT2 = new THREE.RenderTarget(1, 1, blurRTOpts)

    this.bgScene = new THREE.Scene()
    this.bgCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000)
    this.bgCamera.position.set(0, 0, 200)

    this.gpuScene = new THREE.Scene()
    this.gpuCamera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 1000)
    this.gpuCamera.position.z = 500
  }

  // ---------------------------------------------------------------------------
  // Element management
  // ---------------------------------------------------------------------------

  addElement(descriptor: BitmapUiAtlasElementDescriptor): BitmapUiElement {
    const id = descriptor.settings.id
    if (this.entries.has(id)) {
      throw new Error(`BitmapUiAtlas: element '${id}' already exists`)
    }

    const element = createBitmapUiElement(descriptor.settings)

    // Each element gets its own plane mesh that samples its own DataTexture.
    const material = new MeshBasicNodeMaterial()
    const fragUv = uv()
    // Y-flip 3 (see COORDINATES.md): ortho UV Y-up → bitmap texture Y-down
    const texSample = texture(element.texture, vec2(fragUv.x, float(1).sub(fragUv.y)) as never)
    const blurAmount = descriptor.backdropBlur ?? 0
    if (blurAmount > 0) {
      this.hasBackdropBlurElements = true
      this.blurStrength = blurAmount
      const bgSample = texture(this.blurRT2.texture, vec2(screenUV.x, screenUV.y) as never)
      material.colorNode = tslMix(bgSample.rgb, texSample.rgb, texSample.a) as never
      material.opacityNode = float(1) as never
      material.transparent = false
    } else {
      material.colorNode = texSample.rgb as never
      material.opacityNode = texSample.a as never
      material.transparent = true
    }
    material.depthTest = false
    material.depthWrite = false
    material.needsUpdate = true

    const geometry = new THREE.PlaneGeometry(1, 1)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.renderOrder = descriptor.depth

    const entry: ElementEntry = {
      id,
      element,
      mesh,
      material,
      position: { x: Math.round(descriptor.position.x), y: Math.round(descriptor.position.y) },
      depth: descriptor.depth,
      lastTextureWidth: element.getTextureWidth(),
      lastTextureHeight: element.getTextureHeight(),
      backdropBlur: blurAmount,
    }
    this.entries.set(id, entry)
    this.gpuScene.add(mesh)
    this.updateMeshTransform(entry)

    return element
  }

  removeElement(elementId: string): void {
    const entry = this.entries.get(elementId)
    if (!entry) return
    this.gpuScene.remove(entry.mesh)
    entry.element.dispose()
    entry.mesh.geometry.dispose()
    entry.material.dispose()
    this.entries.delete(elementId)
    if (this.focusedElementId === elementId) this.focusedElementId = null
    if (this.hoveredElementId === elementId) this.hoveredElementId = null
    if (this.dragState?.elementId === elementId) this.dragState = null
  }

  getElement(elementId: string): BitmapUiElement | null {
    return this.entries.get(elementId)?.element ?? null
  }

  // ---------------------------------------------------------------------------
  // Positioning / depth
  // ---------------------------------------------------------------------------

  setElementPosition(elementId: string, position: { readonly x: number; readonly y: number }): void {
    const entry = this.entries.get(elementId)
    if (!entry) return
    entry.position = { x: Math.round(position.x), y: Math.round(position.y) }
    this.updateMeshTransform(entry)
  }

  getElementPosition(elementId: string): { readonly x: number; readonly y: number } | null {
    const entry = this.entries.get(elementId)
    return entry ? { x: entry.position.x, y: entry.position.y } : null
  }

  setElementDepth(elementId: string, depth: number): void {
    const entry = this.entries.get(elementId)
    if (!entry) return
    entry.depth = depth
    entry.mesh.renderOrder = depth
    this.updateMeshTransform(entry)
  }

  // ---------------------------------------------------------------------------
  // Mesh positioning in ortho Y-up scene (see COORDINATES.md)
  // ---------------------------------------------------------------------------

  private updateMeshTransform(entry: ElementEntry): void {
    const tw = entry.element.getTextureWidth()
    const th = entry.element.getTextureHeight()
    const crtH = Math.max(1, this.crtLogicalHeight || th)
    // Element position is top-left, Y-down in CRT logical space.
    // Ortho camera is Y-up: left=0, right=crtW, bottom=0, top=crtH.
    entry.mesh.position.set(entry.position.x + tw / 2, crtH - entry.position.y - th / 2, 0)
    entry.mesh.scale.set(tw, th, 1)
  }

  private updateAllMeshTransforms(): void {
    for (const entry of this.entries.values()) {
      this.updateMeshTransform(entry)
    }
  }

  // ---------------------------------------------------------------------------
  // CRT integration
  // ---------------------------------------------------------------------------

  setCrtSize(width: number, height: number): void {
    this.crtLogicalWidth = width
    this.crtLogicalHeight = height
    this.applyRenderResolution()
  }

  setHiResMode(enabled: boolean): void {
    if (this.hiResMode === enabled) return
    this.hiResMode = enabled
    this.applyRenderResolution()
  }

  setViewportSize(width: number, height: number): void {
    if (this.viewportWidth === width && this.viewportHeight === height) return
    this.viewportWidth = width
    this.viewportHeight = height
    if (this.hiResMode) this.applyRenderResolution()
  }

  private applyRenderResolution(): void {
    const crtW = this.crtLogicalWidth
    const crtH = this.crtLogicalHeight
    if (crtW <= 0 || crtH <= 0) return

    let rtW: number, rtH: number
    if (this.hiResMode && this.viewportWidth > 0 && this.viewportHeight > 0) {
      rtW = this.viewportWidth
      rtH = this.viewportHeight
    } else {
      rtW = crtW
      rtH = crtH
    }

    this.gpuTarget.setSize(rtW, rtH)
    this.blurRT1.setSize(rtW, rtH)
    this.blurRT2.setSize(rtW, rtH)
    this.gpuCamera.right = crtW
    this.gpuCamera.top = crtH
    this.gpuCamera.bottom = 0
    this.gpuCamera.updateProjectionMatrix()
    this.bgCamera.aspect = crtW / Math.max(1, crtH)
    this.bgCamera.updateProjectionMatrix()
    this.updateAllMeshTransforms()
  }

  // ---------------------------------------------------------------------------
  // Pointer routing — depth-sorted, front to back
  // ---------------------------------------------------------------------------

  private sortedEntries(): ElementEntry[] {
    return [...this.entries.values()].sort((a, b) => b.depth - a.depth)
  }

  private hitTest(position: { readonly x: number; readonly y: number }): { entry: ElementEntry; localX: number; localY: number } | null {
    for (const entry of this.sortedEntries()) {
      const localX = position.x - entry.position.x
      const localY = position.y - entry.position.y
      if (entry.element.containsPoint(localX, localY)) {
        return { entry, localX, localY }
      }
    }
    return null
  }

  handlePointerDown(position: { readonly x: number; readonly y: number }): BitmapUiAtlasPointerResult {
    const hit = this.hitTest(position)
    if (!hit) {
      this.focusedElementId = null
      return { elementId: null, elementResult: null, consumed: false }
    }

    this.focusedElementId = hit.entry.id
    const result = hit.entry.element.handlePointerDown({ x: hit.localX, y: hit.localY })

    // Check for drag initiation: interaction with role === 'drag'
    if (result.pressedInteractionId) {
      const role = hit.entry.element.getInteractionRole(result.pressedInteractionId)
      if (role === 'drag') {
        this.dragState = {
          elementId: hit.entry.id,
          interactionId: result.pressedInteractionId,
          startPosition: { x: hit.entry.position.x, y: hit.entry.position.y },
          startPointer: { x: position.x, y: position.y },
        }
      }
    }

    return { elementId: hit.entry.id, elementResult: result, consumed: true }
  }

  handlePointerMove(position: { readonly x: number; readonly y: number }): BitmapUiAtlasPointerResult {
    this.lastPointerX = position.x
    this.lastPointerY = position.y
    this.updateCursorTransform()
    // If dragging, update element position from pointer delta
    if (this.dragState) {
      const dx = position.x - this.dragState.startPointer.x
      const dy = position.y - this.dragState.startPointer.y
      this.setElementPosition(this.dragState.elementId, {
        x: this.dragState.startPosition.x + dx,
        y: this.dragState.startPosition.y + dy,
      })
      return { elementId: this.dragState.elementId, elementResult: null, consumed: true }
    }

    // Route to topmost element under pointer
    const hit = this.hitTest(position)

    // Clear hover on previous element if we moved to a different one
    if (this.hoveredElementId && this.hoveredElementId !== (hit?.entry.id ?? null)) {
      const prevEntry = this.entries.get(this.hoveredElementId)
      if (prevEntry) prevEntry.element.handlePointerLeave()
    }
    this.hoveredElementId = hit?.entry.id ?? null

    if (!hit) {
      return { elementId: null, elementResult: null, consumed: false }
    }

    const result = hit.entry.element.handlePointerMove({ x: hit.localX, y: hit.localY })
    return { elementId: hit.entry.id, elementResult: result, consumed: result.consumed }
  }

  handlePointerUp(position: { readonly x: number; readonly y: number }): BitmapUiAtlasPointerResult {
    if (this.dragState) {
      const elementId = this.dragState.elementId
      this.dragState = null
      const entry = this.entries.get(elementId)
      if (entry) {
        const localX = position.x - entry.position.x
        const localY = position.y - entry.position.y
        const result = entry.element.handlePointerUp({ x: localX, y: localY })
        return { elementId, elementResult: result, consumed: true }
      }
      return { elementId, elementResult: null, consumed: true }
    }

    const hit = this.hitTest(position)
    if (!hit) {
      return { elementId: null, elementResult: null, consumed: false }
    }

    const result = hit.entry.element.handlePointerUp({ x: hit.localX, y: hit.localY })
    return { elementId: hit.entry.id, elementResult: result, consumed: result.consumed }
  }

  handlePointerLeave(): BitmapUiAtlasPointerResult {
    if (this.cursorMesh) this.cursorMesh.visible = false
    // Do not cancel drag on pointer leave — drag ends only on pointer up.
    // This lets the user keep dragging even when the pointer goes off-canvas.
    if (this.dragState) {
      return { elementId: this.dragState.elementId, elementResult: null, consumed: true }
    }

    if (this.hoveredElementId) {
      const entry = this.entries.get(this.hoveredElementId)
      this.hoveredElementId = null
      if (entry) {
        const result = entry.element.handlePointerLeave()
        return { elementId: entry.id, elementResult: result, consumed: result.consumed }
      }
    }
    return { elementId: null, elementResult: null, consumed: false }
  }

  // ---------------------------------------------------------------------------
  // Keyboard routing — to focused element
  // ---------------------------------------------------------------------------

  handleKeyDown(input: BitmapUiKeyInput): BitmapUiAtlasKeyResult {
    if (!this.focusedElementId) {
      return { elementId: null, elementResult: null, consumed: false }
    }
    const entry = this.entries.get(this.focusedElementId)
    if (!entry) {
      return { elementId: null, elementResult: null, consumed: false }
    }
    const result = entry.element.handleKeyDown(input)
    return { elementId: this.focusedElementId, elementResult: result, consumed: result.consumed }
  }

  // ---------------------------------------------------------------------------
  // Focus
  // ---------------------------------------------------------------------------

  getFocusedElementId(): string | null {
    return this.focusedElementId
  }

  setFocusedElementId(elementId: string | null): void {
    this.focusedElementId = elementId && this.entries.has(elementId) ? elementId : null
  }

  // ---------------------------------------------------------------------------
  // Drag state
  // ---------------------------------------------------------------------------

  getDragState(): { readonly elementId: string; readonly interactionId: string } | null {
    return this.dragState
      ? { elementId: this.dragState.elementId, interactionId: this.dragState.interactionId }
      : null
  }

  // ---------------------------------------------------------------------------
  // Snapshots
  // ---------------------------------------------------------------------------

  exportElementSnapshot(elementId: string): { readonly width: number; readonly height: number; readonly rgba: Uint8Array } | null {
    const entry = this.entries.get(elementId)
    return entry ? entry.element.exportSnapshot() : null
  }

  exportElementDebugSnapshot(elementId: string): BitmapUiDebugSnapshot | null {
    const entry = this.entries.get(elementId)
    return entry ? entry.element.exportDebugSnapshot() : null
  }

  private async readbackRT(renderer: WebGPURenderer, rt: THREE.RenderTarget): Promise<{ readonly width: number; readonly height: number; readonly rgba: Uint8Array }> {
    const width = rt.width
    const height = rt.height
    const raw = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, width, height)
    const src = raw instanceof Uint8Array ? raw : new Uint8Array(raw instanceof ArrayBuffer ? raw : raw.buffer)
    const expectedBytes = width * height * 4
    if (src.byteLength === expectedBytes) {
      return { width, height, rgba: new Uint8Array(src) }
    }
    // WebGPU readback may include row-alignment padding — strip it
    const bytesPerRow = Math.ceil((width * 4) / 256) * 256
    const out = new Uint8Array(expectedBytes)
    for (let y = 0; y < height; y++) {
      out.set(src.subarray(y * bytesPerRow, y * bytesPerRow + width * 4), y * width * 4)
    }
    return { width, height, rgba: out }
  }

  async exportCompositeSnapshot(renderer: WebGPURenderer): Promise<{ readonly width: number; readonly height: number; readonly rgba: Uint8Array }> {
    return this.readbackRT(renderer, this.gpuTarget)
  }

  async exportUiOnlySnapshot(renderer: WebGPURenderer): Promise<{ readonly width: number; readonly height: number; readonly rgba: Uint8Array }> {
    // Render only the ortho UI layer (element planes) to a temporary RT
    // with transparent background — no 3D scene.
    const width = this.gpuTarget.width
    const height = this.gpuTarget.height
    const tempRT = new THREE.RenderTarget(width, height, {
      depthBuffer: false,
      stencilBuffer: false,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      colorSpace: THREE.NoColorSpace,
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
      generateMipmaps: false,
    })
    // Render the ortho UI layer into the temp RT with a transparent clear.
    // Use a temporary empty scene for clearing, then render the UI scene
    // without autoClear to avoid needing setClearColor (Color4 API).
    const prev = renderer.getRenderTarget()
    const prevAutoClear = renderer.autoClear
    renderer.setRenderTarget(tempRT)
    renderer.autoClear = true
    const clearScene = new THREE.Scene()
    renderer.render(clearScene, this.gpuCamera)
    renderer.autoClear = false
    renderer.render(this.gpuScene, this.gpuCamera)
    renderer.autoClear = prevAutoClear
    renderer.setRenderTarget(prev)
    const result = await this.readbackRT(renderer, tempRT)
    tempRT.dispose()
    return result
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  render(renderer: WebGPURenderer): void {
    if (this.disposed) return

    // Check for element texture resizes and update mesh transforms
    for (const entry of this.entries.values()) {
      const tw = entry.element.getTextureWidth()
      const th = entry.element.getTextureHeight()
      if (tw !== entry.lastTextureWidth || th !== entry.lastTextureHeight) {
        entry.lastTextureWidth = tw
        entry.lastTextureHeight = th
        entry.material.needsUpdate = true
        this.updateMeshTransform(entry)
      }
    }

    const prev = renderer.getRenderTarget()
    const prevAutoClear = renderer.autoClear
    // Pass 1: Perspective 3D background (clears RT)
    renderer.setRenderTarget(this.gpuTarget)
    renderer.autoClear = true
    renderer.render(this.bgScene, this.bgCamera)
    // Pass 1.5: Blur background for backdrop elements
    if (this.hasBackdropBlurElements) {
      this.renderBlurPasses(renderer)
    }

    // Pass 2: All element planes (composites on top, no clear)
    renderer.setRenderTarget(this.gpuTarget)
    renderer.autoClear = false
    renderer.clearDepth()
    renderer.render(this.gpuScene, this.gpuCamera)
    renderer.autoClear = prevAutoClear
    renderer.setRenderTarget(prev)
  }

  renderToScreen(renderer: WebGPURenderer): void {
    if (this.disposed) return
    if (!this.screenQuad) {
      const mat = new MeshBasicNodeMaterial()
      mat.colorNode = texture(this.gpuTarget.texture) as never
      mat.depthTest = false
      mat.depthWrite = false
      mat.needsUpdate = true
      const geo = new THREE.PlaneGeometry(2, 2)
      const uvAttr = geo.getAttribute('uv')
      for (let i = 0; i < uvAttr.count; i++) {
        uvAttr.setY(i, 1 - uvAttr.getY(i))
      }
      this.screenQuad = new THREE.Mesh(geo, mat)
      this.screenQuadScene = new THREE.Scene()
      this.screenQuadScene.add(this.screenQuad)
      this.screenQuadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    }
    renderer.setRenderTarget(null)
    renderer.render(this.screenQuadScene!, this.screenQuadCamera!)
  }


  // ---------------------------------------------------------------------------
  // Cursor
  // ---------------------------------------------------------------------------

  loadBlueNoiseTexture(url: string): void {
    if (this.blueNoiseTexture) return
    const loader = new THREE.TextureLoader()
    loader.load(url, (tex) => {
      tex.wrapS = THREE.RepeatWrapping
      tex.wrapT = THREE.RepeatWrapping
      tex.magFilter = THREE.NearestFilter
      tex.minFilter = THREE.NearestFilter
      tex.generateMipmaps = false
      this.blueNoiseTexture = tex
    })
  }

  setBlurStrength(strength: number): void {
    this.blurStrength = Math.max(0, strength)
    this.blurStrengthUniform.value = this.blurStrength
  }

  setCursorVisible(visible: boolean): void {
    this.cursorVisible = visible
    if (this.cursorMesh) this.cursorMesh.visible = visible
  }

  setCursorSprite(pixels: Uint8Array, width: number, height: number, hotspot: { readonly x: number; readonly y: number }): void {
    this.cursorWidth = width
    this.cursorHeight = height
    this.cursorHotspotX = hotspot.x
    this.cursorHotspotY = hotspot.y

    // Create or update the cursor texture
    if (!this.cursorTexture) {
      this.cursorTexture = new THREE.DataTexture(
        new Uint8Array(pixels),
        width, height,
        THREE.RGBAFormat, THREE.UnsignedByteType
      )
      this.cursorTexture.magFilter = THREE.NearestFilter
      this.cursorTexture.minFilter = THREE.NearestFilter
      this.cursorTexture.generateMipmaps = false
      this.cursorTexture.colorSpace = THREE.NoColorSpace
      this.cursorTexture.flipY = false
    } else {
      this.cursorTexture.image.data = new Uint8Array(pixels)
      this.cursorTexture.image.width = width
      this.cursorTexture.image.height = height
    }
    this.cursorTexture.needsUpdate = true

    // Create the mesh if needed
    if (!this.cursorMesh) {
      this.cursorMaterial = new MeshBasicNodeMaterial()
      const fragUv = uv()
      const texSample = texture(this.cursorTexture, vec2(fragUv.x, float(1).sub(fragUv.y)) as never)
      this.cursorMaterial.transparent = true
      this.cursorMaterial.depthTest = false
      this.cursorMaterial.depthWrite = false
      this.cursorMaterial.colorNode = texSample.rgb as never
      this.cursorMaterial.opacityNode = texSample.a as never
      this.cursorMaterial.needsUpdate = true

      const geometry = new THREE.PlaneGeometry(1, 1)
      this.cursorMesh = new THREE.Mesh(geometry, this.cursorMaterial)
      this.cursorMesh.renderOrder = 9999
      this.cursorMesh.visible = this.cursorVisible
      this.gpuScene.add(this.cursorMesh)
    } else {
      this.cursorMaterial!.needsUpdate = true
    }
    this.updateCursorTransform()
  }


  // ---------------------------------------------------------------------------
  // Backdrop blur
  // ---------------------------------------------------------------------------

  private ensureBlurMaterials(): void {
    if (this.blurScene) return

    const weights = [0.0162, 0.0540, 0.1210, 0.1933, 0.2310, 0.1933, 0.1210, 0.0540, 0.0162]
    const offsets = [-4, -3, -2, -1, 0, 1, 2, 3, 4]

    // Horizontal blur: reads gpuTarget.texture, with blue noise dither to break banding
    const gpuTex = this.gpuTarget.texture
    const bnTex = this.blueNoiseTexture
    const hBlur = Fn(() => {
      const coord = uv()
      const w = float(this.crtLogicalWidth || 320)
      // Sample blue noise at pixel coords (tiling), remap to [-0.5, +0.5)
      const noise = bnTex
        ? texture(bnTex, screenUV.mul(vec2(this.crtLogicalWidth || 320, this.crtLogicalHeight || 240).div(128))).r.sub(0.5)
        : float(0)
      const dither = noise.div(w)
      let acc: any = vec4(0, 0, 0, 0)
      for (let i = 0; i < 9; i++) {
        acc = acc.add(texture(gpuTex, coord.add(vec2(float(offsets[i]).mul(this.blurStrengthUniform).div(w).add(dither), 0))).mul(weights[i]))
      }
      return acc
    })

    this.blurHMaterial = new MeshBasicNodeMaterial()
    this.blurHMaterial.colorNode = hBlur().rgb as never
    this.blurHMaterial.opacityNode = float(1) as never
    this.blurHMaterial.depthTest = false
    this.blurHMaterial.depthWrite = false

    // Vertical blur: reads blurRT1.texture, with blue noise dither (G channel for decorrelation)
    const rt1Tex = this.blurRT1.texture
    const vBlur = Fn(() => {
      const coord = uv()
      const h = float(this.crtLogicalHeight || 240)
      const noise = bnTex
        ? texture(bnTex, screenUV.mul(vec2(this.crtLogicalWidth || 320, this.crtLogicalHeight || 240).div(128))).g.sub(0.5)
        : float(0)
      const dither = noise.div(h)
      let acc: any = vec4(0, 0, 0, 0)
      for (let i = 0; i < 9; i++) {
        acc = acc.add(texture(rt1Tex, coord.add(vec2(0, float(offsets[i]).mul(this.blurStrengthUniform).div(h).add(dither)))).mul(weights[i]))
      }
      return acc
    })

    this.blurVMaterial = new MeshBasicNodeMaterial()
    this.blurVMaterial.colorNode = vBlur().rgb as never
    this.blurVMaterial.opacityNode = float(1) as never
    this.blurVMaterial.depthTest = false
    this.blurVMaterial.depthWrite = false

    const geo = new THREE.PlaneGeometry(2, 2)
    const mesh = new THREE.Mesh(geo, this.blurHMaterial)
    this.blurScene = new THREE.Scene()
    this.blurScene.add(mesh)
    this.blurCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.blurCamera.position.z = 1
  }

  private renderBlurPasses(renderer: WebGPURenderer): void {
    this.ensureBlurMaterials()
    if (!this.blurScene || !this.blurCamera || !this.blurHMaterial || !this.blurVMaterial) return
    const blurMesh = this.blurScene.children[0] as THREE.Mesh

    // H pass: gpuTarget -> blurRT1
    blurMesh.material = this.blurHMaterial
    renderer.setRenderTarget(this.blurRT1)
    ;(renderer as any).render(this.blurScene, this.blurCamera)

    // V pass: blurRT1 -> blurRT2
    blurMesh.material = this.blurVMaterial
    renderer.setRenderTarget(this.blurRT2)
    ;(renderer as any).render(this.blurScene, this.blurCamera)
  }
  private updateCursorTransform(): void {
    if (!this.cursorMesh || this.cursorWidth === 0 || this.cursorHeight === 0) return
    if (!this.crtLogicalWidth || !this.crtLogicalHeight) return

    // Cursor position in CRT logical coords (top-left Y-down), adjusted for hotspot
    const px = this.lastPointerX - this.cursorHotspotX
    const py = this.lastPointerY - this.cursorHotspotY
    const crtH = this.crtLogicalHeight

    // Same transform as updateMeshTransform: position is center of quad,
    // ortho camera is left=0 right=crtW bottom=0 top=crtH (Y-up)
    this.cursorMesh.position.set(px + this.cursorWidth / 2, crtH - py - this.cursorHeight / 2, 0)
    this.cursorMesh.scale.set(this.cursorWidth, this.cursorHeight, 1)
    if (this.cursorVisible) this.cursorMesh.visible = true
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const entry of this.entries.values()) {
      this.gpuScene.remove(entry.mesh)
      entry.element.dispose()
      entry.mesh.geometry.dispose()
      entry.material.dispose()
    }
    this.entries.clear()
    this.gpuTarget.dispose()
    this.blurRT1.dispose()
    this.blurRT2.dispose()
    this.blurHMaterial?.dispose()
    this.blurVMaterial?.dispose()
    if (this.cursorMesh) {
      this.gpuScene.remove(this.cursorMesh)
      this.cursorMesh.geometry.dispose()
      this.cursorMaterial?.dispose()
      this.cursorTexture?.dispose()
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Cursor sprite loader
// ---------------------------------------------------------------------------

export async function loadBitmapCursorSprite(
  url: string,
  hotspot: { readonly x: number; readonly y: number } = { x: 0, y: 0 },
): Promise<{ readonly pixels: Uint8Array; readonly width: number; readonly height: number; readonly hotspot: { readonly x: number; readonly y: number } }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Failed to get 2d context')); return }
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, img.width, img.height)
      resolve({ pixels: new Uint8Array(imageData.data.buffer), width: img.width, height: img.height, hotspot })
    }
    img.onerror = () => reject(new Error(`Failed to load cursor sprite: ${url}`))
    img.crossOrigin = 'anonymous'
    img.src = url
  })
}

export const createBitmapUiAtlas = (): BitmapUiAtlas => {
  return new BitmapUiAtlasImpl()
}

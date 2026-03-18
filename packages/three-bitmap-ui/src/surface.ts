import * as THREE from 'three'
import { float, select, texture, uniform, uv, vec2 } from 'three/tsl'
import { MeshBasicNodeMaterial, type WebGPURenderer } from 'three/webgpu'
type FloatNode = ReturnType<typeof float>
const writeFloat = (node: FloatNode, value: number): void => {
  ;(node as unknown as { value: number }).value = value
}
import { type BitmapUiElement, createBitmapUiElement } from './element'
import type {
  BitmapUiDebugSnapshot,
  BitmapUiDocument,
  BitmapUiFieldState,
  BitmapUiFontAtlas,
  BitmapUiKeyInput,
  BitmapUiKeyResult,
  BitmapUiPalette,
  BitmapUiPointerResult,
  BitmapUiSetFieldValueOptions,
  BitmapUiSurfaceSettings,
  DynamicRegionPainter,
} from './types'

type RawUniformNode = ReturnType<typeof uniform>
type UniformFactory = (value: unknown, type?: string) => RawUniformNode
const makeUniform = uniform as unknown as UniformFactory

type BitmapUiSurface = {
  readonly contentTexture: THREE.DataTexture
  exportSnapshot: () => { readonly width: number; readonly height: number; readonly rgba: Uint8Array }
  exportDebugSnapshot: () => BitmapUiDebugSnapshot
  setLogicalSize: (size: { readonly logicalWidth: number; readonly logicalHeight: number }) => void
  setDocument: (document: BitmapUiDocument) => void
  setFont: (font: BitmapUiFontAtlas) => void
  setPalette: (palette: BitmapUiPalette) => void
  setPixelScale: (pixelScale: number) => void
  setDefaultLineGap: (lineGap: number) => void
  getOffset: () => { readonly x: number; readonly y: number }
  setOffset: (offset: { readonly x: number; readonly y: number }) => void
  setCrtSize: (width: number, height: number) => void
  handlePointerDown: (position: { readonly x: number; readonly y: number }) => BitmapUiPointerResult
  handlePointerMove: (position: { readonly x: number; readonly y: number }) => BitmapUiPointerResult
  handlePointerUp: (position: { readonly x: number; readonly y: number }) => BitmapUiPointerResult
  handlePointerLeave: () => BitmapUiPointerResult
  handleKeyDown: (input: BitmapUiKeyInput) => BitmapUiKeyResult
  getFocusedFieldId: () => string | null
  getHoveredInteractionId: () => string | null
  getPressedInteractionId: () => string | null
  getFieldState: (fieldId: string) => BitmapUiFieldState | null
  setFieldValue: (fieldId: string, value: string, options?: BitmapUiSetFieldValueOptions) => boolean
  setFocusedFieldId: (fieldId: string | null) => boolean
  setCaretVisible: (visible: boolean) => void
  registerDynamicRegion: (nodeId: string, painter: DynamicRegionPainter) => void
  unregisterDynamicRegion: (nodeId: string) => void
  rebuildDynamic: () => void
  readonly bgScene: THREE.Scene
  readonly bgCamera: THREE.PerspectiveCamera
  readonly gpuScene: THREE.Scene
  readonly gpuCamera: THREE.OrthographicCamera
  readonly gpuTarget: THREE.RenderTarget
  render: (renderer: WebGPURenderer) => void
  renderToScreen: (renderer: WebGPURenderer) => void
  setHiResMode: (enabled: boolean) => void
  setViewportSize: (width: number, height: number) => void
  getNodeRect: (nodeId: string) => { x: number; y: number; width: number; height: number } | null
  dispose: () => void
}

class BitmapUiSurfaceImpl implements BitmapUiSurface {
  readonly contentTexture: THREE.DataTexture
  private readonly element: BitmapUiElement

  private offsetX: number
  private offsetY: number
  private disposed = false

  // GPU composition layer: two-pass render to a RenderTarget
  readonly bgScene: THREE.Scene
  readonly bgCamera: THREE.PerspectiveCamera
  readonly gpuScene: THREE.Scene
  readonly gpuCamera: THREE.OrthographicCamera
  readonly gpuTarget: THREE.RenderTarget
  private readonly bitmapPlane: THREE.Mesh
  private readonly bitmapRectXUniform: FloatNode
  private readonly bitmapRectYUniform: FloatNode
  private readonly bitmapRectWUniform: FloatNode
  private readonly bitmapRectHUniform: FloatNode
  private hiResMode = false
  private crtLogicalWidth = 0
  private crtLogicalHeight = 0
  private viewportWidth = 0
  private viewportHeight = 0
  private screenQuad: THREE.Mesh | null = null
  private screenQuadScene: THREE.Scene | null = null
  private screenQuadCamera: THREE.OrthographicCamera | null = null

  constructor(settings: BitmapUiSurfaceSettings) {
    this.element = createBitmapUiElement({
      id: '_surface',
      font: settings.font,
      palette: settings.palette,
      document: settings.document,
      logicalWidth: settings.logicalWidth,
      logicalHeight: settings.logicalHeight,
      pixelScale: settings.pixelScale,
      defaultLineGap: settings.defaultLineGap,
    })
    this.offsetX = Math.round(settings.offsetX ?? 0)
    this.offsetY = Math.round(settings.offsetY ?? 0)

    const textureWidth = this.element.getTextureWidth()
    const textureHeight = this.element.getTextureHeight()

    // GPU composition layer: RenderTarget + ortho scene with the bitmap on a plane.
    this.gpuTarget = new THREE.RenderTarget(textureWidth, textureHeight, {
      depthBuffer: true,
      stencilBuffer: false,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      colorSpace: THREE.NoColorSpace,
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
      generateMipmaps: false,
    })
    this.gpuTarget.texture.name = 'CRTBitmapUiComposite'
    this.bgScene = new THREE.Scene()
    this.bgCamera = new THREE.PerspectiveCamera(50, textureWidth / Math.max(1, textureHeight), 0.1, 2000)
    this.bgCamera.position.set(0, 0, 200)
    this.gpuScene = new THREE.Scene()
    this.gpuCamera = new THREE.OrthographicCamera(0, textureWidth, textureHeight, 0, 0.1, 1000)
    this.gpuCamera.position.z = 500
    // Fullscreen overlay plane — shader samples the element's bitmap texture
    // at the offset position and outputs transparent outside the bitmap rect.
    this.bitmapRectXUniform = makeUniform(0, 'float') as unknown as FloatNode
    this.bitmapRectYUniform = makeUniform(0, 'float') as unknown as FloatNode
    this.bitmapRectWUniform = makeUniform(1, 'float') as unknown as FloatNode
    this.bitmapRectHUniform = makeUniform(1, 'float') as unknown as FloatNode
    const planeMaterial = new MeshBasicNodeMaterial()
    const fragUv = uv()
    const bitmapU = fragUv.x.sub(this.bitmapRectXUniform).div(this.bitmapRectWUniform)
    // Y-flip 3 of 4 (see COORDINATES.md): ortho UV Y-up → bitmap texture Y-down
    const bitmapV = float(1).sub(fragUv.y).sub(this.bitmapRectYUniform).div(this.bitmapRectHUniform)
    const texSample = texture(this.element.texture, vec2(bitmapU, bitmapV) as never)
    const inBounds = bitmapU.greaterThanEqual(float(0))
      .and(bitmapU.lessThanEqual(float(1)))
      .and(bitmapV.greaterThanEqual(float(0)))
      .and(bitmapV.lessThanEqual(float(1)))
    planeMaterial.transparent = true
    planeMaterial.depthTest = false
    planeMaterial.depthWrite = false
    planeMaterial.colorNode = texSample.rgb as never
    planeMaterial.opacityNode = select(inBounds, texSample.a, float(0)) as never
    planeMaterial.needsUpdate = true
    const planeGeometry = new THREE.PlaneGeometry(1, 1)
    this.bitmapPlane = new THREE.Mesh(planeGeometry, planeMaterial)
    this.bitmapPlane.position.set(textureWidth / 2, textureHeight / 2, 0)
    this.bitmapPlane.scale.set(textureWidth, textureHeight, 1)
    this.gpuScene.add(this.bitmapPlane)

    this.contentTexture = this.gpuTarget.texture as unknown as THREE.DataTexture
  }

  // --- CPU delegations to element ---

  exportSnapshot() { return this.element.exportSnapshot() }
  exportDebugSnapshot(): BitmapUiDebugSnapshot {
    const snapshot = this.element.exportDebugSnapshot()
    return { ...snapshot, offsetX: this.offsetX, offsetY: this.offsetY }
  }
  setLogicalSize(size: { readonly logicalWidth: number; readonly logicalHeight: number }): void {
    this.element.setLogicalSize(size)
  }
  setDocument(document: BitmapUiDocument): void { this.element.setDocument(document) }
  setFont(font: BitmapUiFontAtlas): void { this.element.setFont(font) }
  setPalette(palette: BitmapUiPalette): void { this.element.setPalette(palette) }
  setPixelScale(pixelScale: number): void { this.element.setPixelScale(pixelScale) }
  setDefaultLineGap(lineGap: number): void { this.element.setDefaultLineGap(lineGap) }
  getFocusedFieldId() { return this.element.getFocusedFieldId() }
  getHoveredInteractionId() { return this.element.getHoveredInteractionId() }
  getPressedInteractionId() { return this.element.getPressedInteractionId() }
  getFieldState(fieldId: string) { return this.element.getFieldState(fieldId) }
  setFieldValue(fieldId: string, value: string, options?: BitmapUiSetFieldValueOptions) {
    return this.element.setFieldValue(fieldId, value, options)
  }
  setFocusedFieldId(fieldId: string | null) { return this.element.setFocusedFieldId(fieldId) }
  setCaretVisible(visible: boolean) { this.element.setCaretVisible(visible) }
  registerDynamicRegion(nodeId: string, painter: DynamicRegionPainter) { this.element.registerDynamicRegion(nodeId, painter) }
  unregisterDynamicRegion(nodeId: string) { this.element.unregisterDynamicRegion(nodeId) }
  rebuildDynamic() { this.element.rebuildDynamic() }
  getNodeRect(nodeId: string) { return this.element.getNodeRect(nodeId) }

  // --- Pointer events: convert from CRT logical coords to element-local ---
  // Logical pixels (Y-down) → bitmap-local pixels (Y-down). No flip needed —
  // both spaces share the same Y convention. See COORDINATES.md.
  private toLocalPosition(position: { readonly x: number; readonly y: number }) {
    return {
      x: position.x - this.offsetX,
      y: position.y - this.offsetY,
    }
  }

  handlePointerDown(position: { readonly x: number; readonly y: number }) {
    return this.element.handlePointerDown(this.toLocalPosition(position))
  }
  handlePointerMove(position: { readonly x: number; readonly y: number }) {
    return this.element.handlePointerMove(this.toLocalPosition(position))
  }
  handlePointerUp(position: { readonly x: number; readonly y: number }) {
    return this.element.handlePointerUp(this.toLocalPosition(position))
  }
  handlePointerLeave() { return this.element.handlePointerLeave() }
  handleKeyDown(input: BitmapUiKeyInput) { return this.element.handleKeyDown(input) }

  // --- Offset / CRT sizing (surface-only, not on element) ---

  getOffset(): { readonly x: number; readonly y: number } {
    return { x: this.offsetX, y: this.offsetY }
  }

  setOffset(offset: { readonly x: number; readonly y: number }): void {
    this.offsetX = Math.round(offset.x)
    this.offsetY = Math.round(offset.y)
    this.updateBitmapRectUniforms()
  }

  private updateBitmapRectUniforms(): void {
    const tw = this.element.getTextureWidth()
    const th = this.element.getTextureHeight()
    const crtW = Math.max(1, this.crtLogicalWidth || tw)
    const crtH = Math.max(1, this.crtLogicalHeight || th)
    writeFloat(this.bitmapRectXUniform, this.offsetX / crtW)
    writeFloat(this.bitmapRectYUniform, this.offsetY / crtH)
    writeFloat(this.bitmapRectWUniform, tw / crtW)
    writeFloat(this.bitmapRectHUniform, th / crtH)
  }

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
    this.gpuCamera.right = crtW
    this.gpuCamera.top = crtH
    this.gpuCamera.bottom = 0
    this.gpuCamera.updateProjectionMatrix()
    this.bgCamera.aspect = crtW / Math.max(1, crtH)
    this.bgCamera.updateProjectionMatrix()
    this.bitmapPlane.scale.set(crtW, crtH, 1)
    this.bitmapPlane.position.set(crtW / 2, crtH / 2, 0)
    this.updateBitmapRectUniforms()
  }

  // --- GPU rendering ---

  render(renderer: WebGPURenderer): void {
    if (this.disposed) return
    const prev = renderer.getRenderTarget()
    const prevAutoClear = renderer.autoClear
    renderer.setRenderTarget(this.gpuTarget)
    renderer.autoClear = true
    renderer.render(this.bgScene, this.bgCamera)
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

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.element.dispose()
    this.gpuTarget.dispose()
  }
}

export const createBitmapUiSurface = (settings: BitmapUiSurfaceSettings): BitmapUiSurface => {
  return new BitmapUiSurfaceImpl(settings)
}

export type { BitmapUiSurface }

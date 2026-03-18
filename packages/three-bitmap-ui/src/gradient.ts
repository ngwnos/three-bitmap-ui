type RGB = readonly [number, number, number]

// ---- VGA 256-color palette ----

const BASE16: RGB[] = [
  [0, 0, 0], [0, 0, 170], [0, 170, 0], [0, 170, 170],
  [170, 0, 0], [170, 0, 170], [170, 85, 0], [170, 170, 170],
  [85, 85, 85], [85, 85, 255], [85, 255, 85], [85, 255, 255],
  [255, 85, 85], [255, 85, 255], [255, 255, 85], [255, 255, 255],
]

const CUBE_VALUES = [0, 51, 102, 153, 204, 255]

const buildVgaPalette = (): RGB[] => {
  const palette: RGB[] = [...BASE16]
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) {
        palette.push([CUBE_VALUES[r]!, CUBE_VALUES[g]!, CUBE_VALUES[b]!])
      }
    }
  }
  for (let i = 0; i < 24; i++) {
    const v = 8 + i * 10
    palette.push([v, v, v])
  }
  return palette
}

export const VGA_PALETTE: readonly RGB[] = buildVgaPalette()

// ---- Bayer dither matrices ----

export const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const

export const BAYER_2X2 = [
  [0, 2],
  [3, 1],
] as const

// ---- Gradient presets ----

export type GradientPreset = {
  readonly name: string
  readonly indices: readonly number[]
}

export const GRADIENT_PRESETS: readonly GradientPreset[] = [
  { name: 'DOS Warm', indices: [5, 4, 6, 14, 15] },
  { name: 'VGA Cool', indices: [1, 9, 11, 15] },
  { name: 'VGA Jet', indices: [1, 21, 39, 46, 226, 214, 196, 4] },
  { name: 'Dusk', indices: [5, 13, 1, 9] },
  { name: 'Amber Glow', indices: [4, 6, 14, 15] },
  { name: 'Seafoam', indices: [1, 3, 11, 15] },
  { name: 'CRT Night', indices: [0, 1, 5, 13, 15] },
  { name: 'Scarlet', indices: [4, 12, 15] },
  { name: 'Cyanline', indices: [0, 3, 11, 15] },
  { name: 'Mono Steel', indices: [8, 7, 15] },
  { name: 'Phosphor', indices: [0, 2, 10, 15] },
  { name: 'Ultraviolet', indices: [0, 5, 13, 15] },
  { name: 'Sunset', indices: [4, 12, 14, 15] },
  { name: 'Limewire', indices: [0, 2, 10, 14, 15] },
  { name: 'Mono Fade', indices: [232, 236, 242, 248, 255] },
]

export const paletteColorsFromIndices = (indices: readonly number[]): RGB[] =>
  indices.map((index) => VGA_PALETTE[index] ?? [0, 0, 0])

// ---- Gradient types ----

let animatedDitherOffX = 0
let animatedDitherOffY = 0

export const advanceAnimatedDither = (): void => {
  animatedDitherOffX = Math.floor(Math.random() * 1024)
  animatedDitherOffY = Math.floor(Math.random() * 1024)
}

export type GradientType = 'linear' | 'radial' | 'conical' | 'diamond'
export type DitherMode = 'bayer4x4' | 'bayer2x2' | 'bluenoise' | 'none' | 'smooth'

// ---- Blue noise texture ----

let blueNoiseData: Uint8Array | null = null
let blueNoiseSize = 0
let blueNoiseLoading = false

export const loadBlueNoiseTexture = (url: string): void => {
  if (blueNoiseData || blueNoiseLoading) return
  blueNoiseLoading = true
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(img, 0, 0)
    const imageData = ctx.getImageData(0, 0, img.width, img.height)
    blueNoiseSize = img.width
    blueNoiseData = new Uint8Array(img.width * img.height)
    for (let i = 0; i < blueNoiseData.length; i++) {
      blueNoiseData[i] = imageData.data[i * 4]! // R channel
    }
  }
  img.src = url
}

export type GradientDef = {
  readonly colors: readonly RGB[]
  readonly type: GradientType
  readonly angle?: number
  readonly centerX?: number
  readonly centerY?: number
  readonly dither?: DitherMode
  readonly ditherStrength?: number
  readonly mirror?: boolean
  /** If set, the gradient maps 0–1 across this rect instead of the paint rect.
   *  The paint is still clipped to the actual rect, but colors are stable
   *  regardless of the paint rect's size (useful for progress bar fills). */
  readonly referenceRect?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  /** When true, the dither pattern shifts on every repaint (every ~200ms
   *  for the bitmap UI tick). For Bayer this cycles through matrix offsets;
   *  for blue noise it samples a random region of the texture. */
  readonly animatedDither?: boolean
}

// ---- Gradient math ----

const DEG_TO_RAD = Math.PI / 180

const computeGradientT = (
  nx: number,
  ny: number,
  type: GradientType,
  angleDeg: number,
  cx: number,
  cy: number,
): number => {
  if (type === 'linear') {
    const rad = angleDeg * DEG_TO_RAD
    const cosA = Math.cos(rad)
    const sinA = Math.sin(rad)
    return cosA * nx + sinA * ny
  }
  if (type === 'radial') {
    const dx = nx - cx
    const dy = ny - cy
    return Math.sqrt(dx * dx + dy * dy) * 2
  }
  if (type === 'conical') {
    const dx = nx - cx
    const dy = ny - cy
    return (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)
  }
  // diamond
  return (Math.abs(nx - cx) + Math.abs(ny - cy)) * 2
}

const getDitherThreshold = (x: number, y: number, mode: DitherMode): number => {
  if (mode === 'bayer4x4') {
    return ((BAYER_4X4[y & 3]![x & 3]!) + 0.5) / 16
  }
  if (mode === 'bayer2x2') {
    return ((BAYER_2X2[y & 1]![x & 1]!) + 0.5) / 4
  }
  if (mode === 'bluenoise' && blueNoiseData && blueNoiseSize > 0) {
    const bx = ((x % blueNoiseSize) + blueNoiseSize) % blueNoiseSize
    const by = ((y % blueNoiseSize) + blueNoiseSize) % blueNoiseSize
    return (blueNoiseData[by * blueNoiseSize + bx]! + 0.5) / 256
  }
  return 0.5
}

// ---- Point gradient sampling ----

export const sampleGradientColor = (
  t: number,
  colors: readonly RGB[],
  ditherX?: number,
  ditherY?: number,
  ditherMode?: DitherMode,
): RGB => {
  if (colors.length === 0) return [0, 0, 0]
  if (colors.length === 1) return colors[0]!
  const clamped = Math.max(0, Math.min(1, t))
  const segments = colors.length - 1
  const scaled = clamped * segments
  const seg = Math.min(segments - 1, Math.floor(scaled))
  const localT = scaled - seg
  const c0 = colors[seg]!
  const c1 = colors[seg + 1]!
  if (ditherMode && ditherMode !== 'smooth' && ditherX !== undefined && ditherY !== undefined) {
    const threshold = getDitherThreshold(ditherX, ditherY, ditherMode)
    const color = localT >= threshold ? c1 : c0
    return [color[0], color[1], color[2]]
  }
  return [
    Math.round(c0[0] + (c1[0] - c0[0]) * localT),
    Math.round(c0[1] + (c1[1] - c0[1]) * localT),
    Math.round(c0[2] + (c1[2] - c0[2]) * localT),
  ]
}

// ---- Gradient fill ----

type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

const intersectRect = (a: Rect, b: Rect): Rect | null => {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  if (right <= x || bottom <= y) return null
  return { x, y, width: right - x, height: bottom - y }
}

export const fillGradientRect = (
  buffer: Uint8Array,
  bufferWidth: number,
  bufferHeight: number,
  rect: Rect,
  gradient: GradientDef,
  clipRect: Rect | null,
): void => {
  const colors = gradient.colors
  if (colors.length === 0) return
  if (colors.length === 1) {
    // Single color — solid fill
    const c = colors[0]!
    const target = clipRect ? intersectRect(rect, clipRect) : rect
    if (!target) return
    for (let y = target.y; y < target.y + target.height; y++) {
      for (let x = target.x; x < target.x + target.width; x++) {
        if (x < 0 || y < 0 || x >= bufferWidth || y >= bufferHeight) continue
        const offset = (y * bufferWidth + x) * 4
        buffer[offset] = c[0]
        buffer[offset + 1] = c[1]
        buffer[offset + 2] = c[2]
        buffer[offset + 3] = 255
      }
    }
    return
  }

  const target = clipRect ? intersectRect(rect, clipRect) : rect
  if (!target) return

  const type = gradient.type
  const angleDeg = gradient.angle ?? 0
  const cx = gradient.centerX ?? 0.5
  const cy = gradient.centerY ?? 0.5
  const ditherMode = gradient.dither ?? 'bayer4x4'
  const ditherStrength = gradient.ditherStrength ?? 1
  const mirror = gradient.mirror ?? false
  const animatedDither = gradient.animatedDither ?? false
  const ditherOffX = animatedDither ? animatedDitherOffX : 0
  const ditherOffY = animatedDither ? animatedDitherOffY : 0
  const segments = colors.length - 1

  for (let py = target.y; py < target.y + target.height; py++) {
    for (let px = target.x; px < target.x + target.width; px++) {
      if (px < 0 || py < 0 || px >= bufferWidth || py >= bufferHeight) continue

      const ref = gradient.referenceRect ?? rect
      const nx = ref.width > 1 ? (px - ref.x) / (ref.width - 1) : 0.5
      const ny = ref.height > 1 ? (py - ref.y) / (ref.height - 1) : 0.5

      let t = computeGradientT(nx, ny, type, angleDeg, cx, cy)
      t = Math.max(0, Math.min(1, t))

      if (mirror) {
        t = 1 - Math.abs(2 * t - 1)
      }

      const scaled = t * segments
      const seg = Math.min(segments - 1, Math.floor(scaled))
      const localT = scaled - seg

      const c0 = colors[seg]!
      const c1 = colors[seg + 1]!

      const offset = (py * bufferWidth + px) * 4
      if (ditherMode === 'smooth') {
        buffer[offset] = Math.round(c0[0] + (c1[0] - c0[0]) * localT)
        buffer[offset + 1] = Math.round(c0[1] + (c1[1] - c0[1]) * localT)
        buffer[offset + 2] = Math.round(c0[2] + (c1[2] - c0[2]) * localT)
      } else {
        const threshold = getDitherThreshold(px + ditherOffX, py + ditherOffY, ditherMode)
        const adjusted = 0.5 + (threshold - 0.5) * ditherStrength
        const color = localT >= adjusted ? c1 : c0
        buffer[offset] = color[0]
        buffer[offset + 1] = color[1]
        buffer[offset + 2] = color[2]
      }
      buffer[offset + 3] = 255
    }
  }
}

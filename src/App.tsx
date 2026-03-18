import { useEffect, useRef } from 'react'
import { WebGPURenderer } from 'three/webgpu'
import {
  createBitmapUiAtlas,
  type BitmapUiFontAtlas,
  type BitmapUiPalette,
} from 'three-bitmap-ui'

const DEMO_PALETTE: BitmapUiPalette = {
  background: '#0a0e14',
  panelFill: '#0d171f',
  panelBorder: '#274959',
  chromeFill: '#142a38',
  chromeBorder: '#3a6a7d',
  inputFill: '#081018',
  inputBorder: '#274959',
  selectionFill: { r: 0.15, g: 0.35, b: 0.55, a: 0.6 },
  caret: '#8af3b6',
  normalText: '#dff5ff',
  accentText: '#8af3b6',
  dimOpacity: 0.5,
}

export const App = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<WebGPURenderer | null>(null)
  const atlasRef = useRef<ReturnType<typeof createBitmapUiAtlas> | null>(null)
  const frameRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let disposed = false
    const init = async () => {
      const renderer = new WebGPURenderer({ canvas, antialias: false })
      await renderer.init()
      if (disposed) { renderer.dispose(); return }
      rendererRef.current = renderer

      const atlas = createBitmapUiAtlas()
      atlasRef.current = atlas

      const width = 320
      const height = 240
      atlas.setCrtSize(width, height)
      renderer.setSize(width, height, false)
      renderer.setPixelRatio(1)

      // Placeholder: add a simple text element when a font is loaded
      atlas.addElement({
        settings: {
          id: 'hello',
          font: createPlaceholderFont(),
          palette: DEMO_PALETTE,
          document: {
            backgroundColor: DEMO_PALETTE.background,
            root: {
              kind: 'view',
              id: 'root',
              direction: 'column',
              width: 'fill',
              height: 'fill',
              padding: 4,
              gap: 4,
              children: [
                {
                  kind: 'text',
                  id: 'title',
                  text: 'three-bitmap-ui',
                  textStyle: { tone: 'accent' },
                },
                {
                  kind: 'text',
                  id: 'body',
                  text: 'Bitmap UI engine for Three.js WebGPU.\nThis is the standalone demo.',
                  wrap: true,
                },
              ],
            },
          },
          logicalWidth: width,
          logicalHeight: height,
        },
        position: { x: 0, y: 0 },
        depth: 0,
      })

      const animate = () => {
        if (disposed) return
        atlas.render(renderer)
        atlas.renderToScreen(renderer)
        frameRef.current = requestAnimationFrame(animate)
      }
      animate()
    }

    init()

    return () => {
      disposed = true
      cancelAnimationFrame(frameRef.current)
      atlasRef.current?.dispose()
      rendererRef.current?.dispose()
    }
  }, [])

  return <canvas ref={canvasRef} />
}

function createPlaceholderFont(): BitmapUiFontAtlas {
  const cellWidth = 8
  const cellHeight = 16
  const glyphCount = 128
  const atlasColumns = 16
  const atlasRows = Math.ceil(glyphCount / atlasColumns)
  const atlasWidth = atlasColumns * cellWidth
  const atlasHeight = atlasRows * cellHeight
  const atlasData = new Uint8Array(atlasWidth * atlasHeight * 4)

  // Fill with white pixels so text is visible
  for (let i = 0; i < atlasData.length; i += 4) {
    atlasData[i] = 255
    atlasData[i + 1] = 255
    atlasData[i + 2] = 255
    atlasData[i + 3] = 255
  }

  return {
    id: 'placeholder',
    label: 'Placeholder 8x16',
    cellWidth,
    cellHeight,
    advanceWidth: cellWidth,
    lineAdvance: cellHeight,
    ascent: 12,
    descent: 4,
    internalLeading: 0,
    externalLeading: 0,
    firstCode: 0,
    glyphCount,
    defaultCode: 32,
    atlasColumns,
    atlasRows,
    atlasWidth,
    atlasHeight,
    atlasData,
    lookupGlyphCode: (glyph: string) => glyph.charCodeAt(0) || 32,
  }
}

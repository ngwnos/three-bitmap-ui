import { describe, expect, it } from 'bun:test'

import { FrequencyAnalyzer } from './component'
import { createBitmapUiSurface } from './surface'
import { createRichTextLayout, type ResolvedTextStyle } from './text-layout'
import type {
  BitmapUiDebugRichTextNode,
  BitmapUiDocument,
  BitmapUiFontAtlas,
  BitmapUiPalette,
  BitmapUiTableNode,
  BitmapUiViewNode,
} from './types'

const createTestFont = (options: {
  id: string
  label: string
  cellWidth: number
  cellHeight: number
  advanceWidth: number
  lineAdvance: number
  ascent: number
  descent: number
}): BitmapUiFontAtlas => {
  const glyphCount = 128
  const atlasColumns = 16
  const atlasRows = Math.ceil(glyphCount / atlasColumns)
  const atlasWidth = atlasColumns * options.cellWidth
  const atlasHeight = atlasRows * options.cellHeight
  const atlasData = new Uint8Array(atlasWidth * atlasHeight * 4)
  for (let index = 0; index < atlasData.length; index += 4) {
    atlasData[index] = 255
    atlasData[index + 1] = 255
    atlasData[index + 2] = 255
    atlasData[index + 3] = 255
  }

  return {
    id: options.id,
    label: options.label,
    cellWidth: options.cellWidth,
    cellHeight: options.cellHeight,
    advanceWidth: options.advanceWidth,
    lineAdvance: options.lineAdvance,
    ascent: options.ascent,
    descent: options.descent,
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
    lookupGlyphCode: (glyph) => glyph.charCodeAt(0) || 32,
  }
}

const TALL_FONT = createTestFont({
  id: 'test-tall',
  label: 'Test Tall',
  cellWidth: 8,
  cellHeight: 16,
  advanceWidth: 8,
  lineAdvance: 16,
  ascent: 12,
  descent: 4,
})

const SHORT_FONT = createTestFont({
  id: 'test-short',
  label: 'Test Short',
  cellWidth: 6,
  cellHeight: 8,
  advanceWidth: 6,
  lineAdvance: 8,
  ascent: 6,
  descent: 2,
})

const TEST_PALETTE: BitmapUiPalette = {
  background: { r: 0, g: 0, b: 0 },
  panelFill: { r: 0.1, g: 0.1, b: 0.1 },
  panelBorder: { r: 0.4, g: 0.4, b: 0.4 },
  chromeFill: { r: 0.1, g: 0.1, b: 0.1 },
  chromeBorder: { r: 0.6, g: 0.6, b: 0.6 },
  inputFill: { r: 0.05, g: 0.05, b: 0.05 },
  inputBorder: { r: 0.5, g: 0.5, b: 0.5 },
  selectionFill: { r: 0.2, g: 0.2, b: 0.8, a: 0.5 },
  caret: { r: 1, g: 1, b: 1 },
  normalText: { r: 1, g: 1, b: 1 },
  accentText: { r: 1, g: 0.9, b: 0.2 },
  dimOpacity: 0.5,
}

const DEFAULT_TEXT_STYLE: ResolvedTextStyle = {
  font: TALL_FONT,
  pixelScale: 1,
  lineGap: 0,
  textAlign: 'start',
  tone: 'normal',
  color: null,
}

const createSurface = (document: BitmapUiDocument, logicalWidth: number, logicalHeight: number) => {
  return createBitmapUiSurface({
    font: TALL_FONT,
    palette: TEST_PALETTE,
    document,
    logicalWidth,
    logicalHeight,
  })
}

const getPixel = (snapshot: { readonly width: number; readonly rgba: Uint8Array }, x: number, y: number) => {
  const offset = (y * snapshot.width + x) * 4
  return {
    r: snapshot.rgba[offset] ?? 0,
    g: snapshot.rgba[offset + 1] ?? 0,
    b: snapshot.rgba[offset + 2] ?? 0,
    a: snapshot.rgba[offset + 3] ?? 0,
  }
}

describe('bitmap ui engine', () => {
  it('aligns mixed rich text runs on a shared baseline', () => {
    const layout = createRichTextLayout(
      [
        { text: 'AB', font: TALL_FONT },
        { text: 'xy', font: SHORT_FONT },
      ],
      false,
      Number.POSITIVE_INFINITY,
      DEFAULT_TEXT_STYLE,
    )

    expect(layout.lines).toHaveLength(1)
    expect(layout.contentWidth).toBe(28)
    expect(layout.contentHeight).toBe(16)
    expect(layout.lines[0]).toMatchObject({
      width: 28,
      ascent: 12,
      descent: 4,
      baseline: 12,
    })
    expect(layout.lines[0]?.fragments.map((fragment) => fragment.font.id)).toEqual([
      'test-tall',
      'test-short',
    ])
    expect(layout.lines[0]?.fragments.map((fragment) => fragment.x)).toEqual([0, 16])
    expect(layout.lines[0]?.fragments.map((fragment) => fragment.ascent)).toEqual([12, 6])
  })

  it('wraps rich text on whitespace without carrying the break into the next line', () => {
    const layout = createRichTextLayout(
      [{ text: 'AA BB', font: TALL_FONT }],
      true,
      16,
      DEFAULT_TEXT_STYLE,
    )

    expect(layout.lines.map((line) => line.fragments.map((fragment) => fragment.text).join(''))).toEqual([
      'AA',
      'BB',
    ])
    expect(layout.contentHeight).toBe(32)
  })

  it('distributes flex remainder without exceeding the available width', () => {
    const root: BitmapUiViewNode = {
      kind: 'view',
      id: 'root',
      direction: 'row',
      gap: 0,
      children: [
        { kind: 'spacer', id: 'a', flex: 1 },
        { kind: 'spacer', id: 'b', flex: 1 },
        { kind: 'spacer', id: 'c', flex: 1 },
      ],
    }
    const surface = createSurface({ root, fields: {} }, 2, 1)

    try {
      const snapshot = surface.exportDebugSnapshot()
      if (snapshot.root.kind !== 'view') {
        throw new Error(`Expected a view root, received ${snapshot.root.kind}.`)
      }

      const widths = snapshot.root.children.map((child) => child.box.width)
      expect(widths).toEqual([1, 1, 0])
      expect(widths.reduce((sum, value) => sum + value, 0)).toBe(2)
    } finally {
      surface.dispose()
    }
  })

  it('renders higher z-index layers on top of lower ones', () => {
    const root: BitmapUiViewNode = {
      kind: 'view',
      id: 'root',
      direction: 'column',
      children: [
        {
          kind: 'view',
          id: 'backdrop',
          position: 'absolute',
          x: 1,
          y: 1,
          width: 4,
          height: 4,
          direction: 'column',
          backgroundColor: { r: 1, g: 0, b: 0 },
          children: [],
          zIndex: 0,
        },
        {
          kind: 'view',
          id: 'highlight',
          position: 'absolute',
          x: 2,
          y: 2,
          width: 2,
          height: 2,
          direction: 'column',
          backgroundColor: { r: 0, g: 0, b: 1 },
          children: [],
          zIndex: 10,
        },
      ],
    }
    const surface = createSurface({ root, fields: {} }, 6, 6)

    try {
      const snapshot = surface.exportSnapshot()
      expect(getPixel(snapshot, 1, 1)).toMatchObject({ r: 255, g: 0, b: 0, a: 255 })
      expect(getPixel(snapshot, 2, 2)).toMatchObject({ r: 0, g: 0, b: 255, a: 255 })
    } finally {
      surface.dispose()
    }
  })

  it('tracks interactive hover and click targets with child priority', () => {
    const root: BitmapUiViewNode = {
      kind: 'view',
      id: 'root',
      direction: 'column',
      children: [
        {
          kind: 'view',
          id: 'panel',
          position: 'absolute',
          x: 1,
          y: 1,
          width: 10,
          height: 6,
          direction: 'column',
          interaction: { id: 'panel' },
          backgroundColor: { r: 0.1, g: 0.1, b: 0.1 },
          children: [
            {
              kind: 'view',
              id: 'button',
              position: 'absolute',
              x: 2,
              y: 2,
              width: 4,
              height: 2,
              direction: 'column',
              interaction: { id: 'button' },
              backgroundColor: { r: 0.2, g: 0.2, b: 0.8 },
              children: [],
            },
          ],
        },
      ],
    }
    const surface = createSurface({ root, fields: {} }, 16, 10)

    try {
      expect(surface.handlePointerMove({ x: 4, y: 4 })).toMatchObject({
        hoveredInteractionId: 'button',
        pressedInteractionId: null,
        clickedInteractionId: null,
        consumed: true,
      })
      expect(surface.handlePointerDown({ x: 4, y: 4 })).toMatchObject({
        hoveredInteractionId: 'button',
        pressedInteractionId: 'button',
        clickedInteractionId: null,
        consumed: true,
      })
      expect(surface.handlePointerUp({ x: 4, y: 4 })).toMatchObject({
        hoveredInteractionId: 'button',
        pressedInteractionId: null,
        clickedInteractionId: 'button',
        consumed: true,
      })
      expect(surface.exportDebugSnapshot()).toMatchObject({
        hoveredInteractionId: 'button',
        pressedInteractionId: null,
      })
    } finally {
      surface.dispose()
    }
  })

  it('supports field submission, programmatic field values, and caret visibility', () => {
    const root: BitmapUiViewNode = {
      kind: 'view',
      id: 'root',
      direction: 'column',
      children: [
        {
          kind: 'input',
          id: 'prompt',
          fieldId: 'prompt',
          width: 24,
        },
      ],
    }
    const surface = createSurface({
      root,
      fields: {
        prompt: {
          type: 'input',
          value: '',
          placeholder: 'command',
        },
      },
    }, 32, 8)

    try {
      expect(surface.setFocusedFieldId('prompt')).toBe(true)
      expect(surface.setFieldValue('prompt', 'trace west', { caret: 'end' })).toBe(true)
      expect(surface.getFieldState('prompt')).toMatchObject({
        value: 'trace west',
        caret: 10,
      })
      expect(surface.handleKeyDown({ key: 'Enter' })).toMatchObject({
        consumed: true,
        submittedFieldId: 'prompt',
        changedFieldId: null,
        focusedFieldId: 'prompt',
      })
      surface.setCaretVisible(false)
      expect(surface.exportDebugSnapshot()).toMatchObject({
        focusedFieldId: 'prompt',
        caretVisible: false,
      })
    } finally {
      surface.dispose()
    }
  })

  it('preserves focused field when clicking non-field interaction targets', () => {
    const root: BitmapUiViewNode = {
      kind: 'view',
      id: 'root',
      direction: 'column',
      children: [
        {
          kind: 'input',
          id: 'prompt',
          fieldId: 'prompt',
          width: 24,
        },
        {
          kind: 'view',
          id: 'button',
          position: 'absolute',
          x: 16,
          y: 20,
          width: 12,
          height: 6,
          direction: 'column',
          interaction: { id: 'button' },
          backgroundColor: { r: 0.2, g: 0.2, b: 0.8 },
          children: [],
        },
      ],
    }
    const surface = createSurface({
      root,
      fields: {
        prompt: {
          type: 'input',
          value: 'trace west',
          placeholder: 'command',
        },
      },
    }, 32, 24)

    try {
      expect(surface.setFocusedFieldId('prompt')).toBe(true)
      expect(surface.getFocusedFieldId()).toBe('prompt')
      expect(surface.handlePointerDown({ x: 18, y: 22 })).toMatchObject({
        hoveredInteractionId: 'button',
        pressedInteractionId: 'button',
        consumed: true,
      })
      expect(surface.getFocusedFieldId()).toBe('prompt')
    } finally {
      surface.dispose()
    }
  })

  it('measures table columns and preserves rich text fragments in the debug snapshot', () => {
    const root: BitmapUiTableNode = {
      kind: 'table',
      id: 'schedule',
      columns: [
        { id: 'time', width: 4, textAlign: 'end' },
        { id: 'item', width: 'fill' },
      ],
      headerRow: {
        id: 'hdr',
        cells: {
          time: { text: 'TIME', tone: 'accent' },
          item: { text: 'ITEM', tone: 'accent' },
        },
      },
      rows: [
        {
          id: 'r1',
          cells: {
            time: { text: '0815' },
            item: {
              runs: [
                { text: 'NOVA ', font: TALL_FONT },
                { text: 'LAB', font: SHORT_FONT, color: { r: 0, g: 1, b: 0 } },
              ],
            },
          },
        },
        {
          id: 'r2',
          cells: {
            time: { text: '0900' },
            item: { text: 'WEATHER', wrap: true },
          },
        },
      ],
      columnGap: 1,
      rowGap: 1,
    }
    const surface = createSurface({ root, fields: {} }, 18, 64)

    try {
      const snapshot = surface.exportDebugSnapshot()
      if (snapshot.root.kind !== 'table') {
        throw new Error(`Expected a table root, received ${snapshot.root.kind}.`)
      }

      expect(snapshot.root.columns).toEqual([
        { id: 'time', width: 4, textAlign: 'end' },
        { id: 'item', width: 13, textAlign: 'start' },
      ])
      expect(snapshot.root.rowCount).toBe(3)
      expect(snapshot.root.headerRowId).toBe('hdr')
      expect(snapshot.root.children).toHaveLength(6)

      const richCell = snapshot.root.children.find((node): node is BitmapUiDebugRichTextNode => node.kind === 'richText')
      expect(richCell?.nodeId).toBe('schedule:r1:item')
      expect(richCell?.richTextLayout.lines[0]?.fragments.map((fragment) => fragment.font.id)).toEqual([
        'test-tall',
        'test-short',
      ])
    } finally {
      surface.dispose()
    }
  })

  it('dynamic overlay produces same output as full rebuild', () => {
    const makeDoc = (barHeight: number): BitmapUiDocument => ({
      backgroundColor: { r: 0, g: 0, b: 0 },
      root: {
        kind: 'view',
        id: 'root',
        direction: 'column',
        gap: 2,
        children: [
          {
            kind: 'text',
            id: 'static-label',
            text: 'STATIC LABEL',
          },
          {
            kind: 'view',
            id: 'graph-canvas',
            direction: 'row',
            gap: 0,
            width: 40,
            height: 20,
            backgroundColor: { r: 0.05, g: 0.05, b: 0.1 },
            dynamic: true,
            children: [
              {
                kind: 'view',
                id: 'bar-a',
                direction: 'column',
                width: 8,
                height: barHeight,
                backgroundColor: { r: 0, g: 1, b: 0.5 },
                position: 'absolute',
                x: 0,
                y: 20 - barHeight,
                children: [],
              },
              {
                kind: 'view',
                id: 'bar-b',
                direction: 'column',
                width: 8,
                height: barHeight + 3,
                backgroundColor: { r: 0, g: 1, b: 0.5 },
                position: 'absolute',
                x: 10,
                y: 20 - (barHeight + 3),
                children: [],
              },
            ],
          },
        ],
      },
    })

    // Full rebuild reference
    const fullSurface = createSurface(makeDoc(10), 80, 60)
    try {
      const fullSnapshot = fullSurface.exportSnapshot()

      // Dynamic overlay path: create with initial doc, then update dynamicOnly
      const dynamicSurface = createSurface(makeDoc(5), 80, 60)
      try {
        // Now update with the same bar heights as the full surface, using dynamicOnly
        dynamicSurface.setDocument(makeDoc(10), { dynamicOnly: true })
        const dynamicSnapshot = dynamicSurface.exportSnapshot()

        // Compare every pixel
        let mismatches = 0
        for (let i = 0; i < fullSnapshot.rgba.length; i++) {
          if (fullSnapshot.rgba[i] !== dynamicSnapshot.rgba[i]) {
            mismatches++
          }
        }
        expect(mismatches).toBe(0)
      } finally {
        dynamicSurface.dispose()
      }
    } finally {
      fullSurface.dispose()
    }
  })

  it('repaints frequency analyzers through rebuildDynamic without a full document rebuild', () => {
    const spectrum = new Float32Array([0.25, 0.75, 0.4])
    const surface = createSurface({
      backgroundColor: { r: 0, g: 0, b: 0 },
      root: {
        kind: 'view',
        id: 'root',
        direction: 'column',
        padding: 0,
        gap: 0,
        children: [
          FrequencyAnalyzer({
            id: 'analyzer',
            width: 11,
            height: 8,
            padding: 0,
            borderWidth: 0,
            backgroundColor: { r: 0, g: 0, b: 0 },
            spectrum,
            binWidth: 2,
            gap: 1,
            colorMode: 'magnitude',
            gradientColors: [[255, 64, 32], [255, 255, 128]],
            dither: 'smooth',
          }),
        ],
      },
    }, 11, 8)

    try {
      const before = surface.exportSnapshot()
      expect(getPixel(before, 0, 7).a).toBe(255)
      expect(getPixel(before, 3, 1)).toMatchObject({ r: 0, g: 0, b: 0, a: 255 })

      spectrum[0] = 1
      spectrum[1] = 0
      surface.rebuildDynamic()

      const after = surface.exportSnapshot()
      expect(getPixel(after, 0, 1).a).toBe(255)
      expect(getPixel(after, 0, 1).r).toBeGreaterThan(0)
      expect(getPixel(after, 3, 7)).toMatchObject({ r: 0, g: 0, b: 0, a: 255 })
    } finally {
      surface.dispose()
    }
  })
})

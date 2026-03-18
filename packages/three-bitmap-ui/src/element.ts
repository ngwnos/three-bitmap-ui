import * as THREE from 'three'
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))
const BITMAP_UI_MAX_TEXTURE_COLUMNS = 4096
const BITMAP_UI_MAX_TEXTURE_ROWS = 4096
import type {
  BitmapUiColorLike,
  BitmapUiDebugColor,
  DynamicRegionPainter,
  DynamicRegionRect,
  BitmapUiDebugFieldState,
  BitmapUiDebugFont,
  BitmapUiDebugNode,
  BitmapUiDebugRect,
  BitmapUiDebugSnapshot,
  BitmapUiDebugTextLayout,
  BitmapUiDocument,
  BitmapUiFieldType,
  BitmapUiFieldState,
  BitmapUiFontAtlas,
  BitmapUiKeyInput,
  BitmapUiKeyResult,
  BitmapUiLength,
  BitmapUiNode,
  BitmapUiPalette,
  BitmapUiPointerResult,
  BitmapUiSetFieldValueOptions,
  BitmapUiTableCell,
  BitmapUiTableColumn,
  BitmapUiTableNode,
  BitmapUiTextAlign,
  BitmapUiTone,
  BitmapUiOverflow,
} from './types'
import { fillGradientRect, type GradientDef } from './gradient'
import {
  alignTextOriginX,
  collectRichTextPlainText,
  createRichTextLayout,
  createTextLayout,
  findLineForCaret,
  resolveInheritedTextStyle,
  resolveRenderableTextStyle,
  type Rect,
  type ResolvedTextStyle,
  type RichTextLayout,
  type TextLayout,
} from './text-layout'

type RgbaByte = BitmapUiDebugColor

type InternalFieldState = {
  readonly type: BitmapUiFieldType
  value: string
  placeholder: string
  maxLength: number | null
  caret: number
  preferredColumn: number | null
}

type ResolvedBaseNode = {
  readonly kind: BitmapUiNode['kind']
  readonly nodeId: string
  readonly zIndex: number
  readonly box: Rect
  readonly contentBox: Rect
  readonly backgroundColor: RgbaByte | null
  readonly borderColor: RgbaByte | null
  readonly borderWidth: number
  readonly clip: boolean
  readonly interactionId: string | null
  readonly interactionRole: string | null
}

type ResolvedViewNode = ResolvedBaseNode & {
  readonly kind: 'view'
  readonly gradient: GradientDef | null
  readonly children: readonly ResolvedNode[]
}

type ResolvedTextNode = ResolvedBaseNode & {
  readonly kind: 'text'
  readonly text: string
  readonly font: BitmapUiFontAtlas
  readonly pixelScale: number
  readonly lineGap: number
  readonly textLayout: TextLayout
  readonly textAlign: BitmapUiTextAlign
  readonly textColor: RgbaByte
  readonly overflow: BitmapUiOverflow
  readonly scrollOffset: number
}

type ResolvedRichTextNode = ResolvedBaseNode & {
  readonly kind: 'richText'
  readonly text: string
  readonly lineGap: number
  readonly textAlign: BitmapUiTextAlign
  readonly richTextLayout: ResolvedRichTextLayout
  readonly overflow: BitmapUiOverflow
  readonly scrollOffset: number
}

type ResolvedRichTextFragment = {
  readonly text: string
  readonly x: number
  readonly width: number
  readonly font: BitmapUiFontAtlas
  readonly pixelScale: number
  readonly ascent: number
  readonly descent: number
  readonly textColor: RgbaByte
  readonly backgroundColor: RgbaByte | null
}

type ResolvedRichTextLine = {
  readonly width: number
  readonly ascent: number
  readonly descent: number
  readonly baseline: number
  readonly fragments: readonly ResolvedRichTextFragment[]
}

type ResolvedRichTextLayout = {
  readonly lines: readonly ResolvedRichTextLine[]
  readonly contentWidth: number
  readonly contentHeight: number
}

type ResolvedFieldNode = ResolvedBaseNode & {
  readonly kind: 'input' | 'textarea'
  readonly fieldId: string
  readonly fieldType: BitmapUiFieldType
  readonly font: BitmapUiFontAtlas
  readonly pixelScale: number
  readonly lineGap: number
  readonly textAlign: BitmapUiTextAlign
  readonly textColor: RgbaByte
  readonly placeholderColor: RgbaByte
  readonly caretColor: RgbaByte
  readonly valueLayout: TextLayout
  readonly renderLayout: TextLayout
  readonly showPlaceholder: boolean
}

type ResolvedSpacerNode = ResolvedBaseNode & {
  readonly kind: 'spacer'
}

type ResolvedRuleNode = ResolvedBaseNode & {
  readonly kind: 'rule'
  readonly orientation: 'horizontal' | 'vertical'
  readonly thickness: number
  readonly ruleColor: RgbaByte | null
}

type ResolvedTableNode = ResolvedBaseNode & {
  readonly kind: 'table'
  readonly columns: readonly {
    readonly id: string
    readonly width: number
    readonly textAlign: BitmapUiTextAlign
  }[]
  readonly rowCount: number
  readonly headerRowId: string | null
  readonly children: readonly ResolvedNode[]
}

type ResolvedNode =
  | ResolvedViewNode
  | ResolvedTextNode
  | ResolvedRichTextNode
  | ResolvedFieldNode
  | ResolvedSpacerNode
  | ResolvedRuleNode
  | ResolvedTableNode

type FieldHit = {
  readonly fieldId: string
  readonly fieldType: BitmapUiFieldType
  readonly box: Rect
  readonly contentBox: Rect
  readonly textAlign: BitmapUiTextAlign
  readonly valueLayout: TextLayout
  readonly zIndex: number
  readonly order: number
}

type InteractionHit = {
  readonly interactionId: string
  readonly interactionRole: string | null
  readonly box: Rect
  readonly zIndex: number
  readonly order: number
}

type MeasureContext = {
  readonly defaultTextStyle: ResolvedTextStyle
  readonly fields: Map<string, InternalFieldState>
  readonly palette: BitmapUiPalette
}

type LayoutHitState = {
  order: number
}

export type BitmapUiElementSettings = {
  readonly id: string
  readonly font: BitmapUiFontAtlas
  readonly palette: BitmapUiPalette
  readonly document: BitmapUiDocument
  readonly logicalWidth: number
  readonly logicalHeight: number
  readonly pixelScale?: number
  readonly defaultLineGap?: number
}

export type BitmapUiElement = {
  readonly id: string
  readonly texture: THREE.DataTexture
  exportSnapshot: () => { readonly width: number; readonly height: number; readonly rgba: Uint8Array }
  exportDebugSnapshot: () => BitmapUiDebugSnapshot
  setLogicalSize: (size: { readonly logicalWidth: number; readonly logicalHeight: number }) => void
  setDocument: (document: BitmapUiDocument) => void
  setFont: (font: BitmapUiFontAtlas) => void
  setPalette: (palette: BitmapUiPalette) => void
  setPixelScale: (pixelScale: number) => void
  setDefaultLineGap: (lineGap: number) => void
  getTextureWidth: () => number
  getTextureHeight: () => number
  containsPoint: (localX: number, localY: number) => boolean
  getInteractionRole: (interactionId: string) => string | null
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
  getNodeRect: (nodeId: string) => { x: number; y: number; width: number; height: number } | null
  dispose: () => void
}

const MAX_LOGICAL_TEXTURE_WIDTH = Math.max(1, Math.floor(BITMAP_UI_MAX_TEXTURE_COLUMNS / 3))
const MAX_LOGICAL_TEXTURE_HEIGHT = Math.max(1, BITMAP_UI_MAX_TEXTURE_ROWS)

const rectContains = (rect: Rect, x: number, y: number): boolean => {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height
}

const intersectRect = (a: Rect, b: Rect): Rect | null => {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  const width = right - x
  const height = bottom - y
  if (width <= 0 || height <= 0) return null
  return { x, y, width, height }
}

const insetRect = (rect: Rect, amount: number): Rect => {
  const nextAmount = Math.max(0, amount)
  const width = Math.max(0, rect.width - nextAmount * 2)
  const height = Math.max(0, rect.height - nextAmount * 2)
  return {
    x: rect.x + nextAmount,
    y: rect.y + nextAmount,
    width,
    height,
  }
}

const resolveLength = (
  length: BitmapUiLength | undefined,
  contentSize: number,
  availableSize: number,
  minSize: number | undefined,
  maxSize: number | undefined,
): number => {
  const fallback = length === 'fill' ? availableSize : contentSize
  const explicit = typeof length === 'number' ? length : fallback
  const clampedMin = minSize ?? 0
  const clampedMax = maxSize ?? Number.POSITIVE_INFINITY
  return clamp(Math.round(explicit), Math.round(clampedMin), Math.round(clampedMax))
}

const colorLikeToLinearRgba = (value: BitmapUiColorLike, fallbackAlpha = 1): RgbaByte => {
  if (typeof value === 'object' && 'r' in value && 'g' in value && 'b' in value) {
    const alpha = clamp(('a' in value ? value.a : undefined) ?? fallbackAlpha, 0, 1)
    return {
      r: Math.round(clamp(value.r, 0, 1) * 255),
      g: Math.round(clamp(value.g, 0, 1) * 255),
      b: Math.round(clamp(value.b, 0, 1) * 255),
      a: Math.round(alpha * 255),
    }
  }

  const color = new THREE.Color(value as THREE.ColorRepresentation)
  color.convertSRGBToLinear()
  return {
    r: Math.round(clamp(color.r, 0, 1) * 255),
    g: Math.round(clamp(color.g, 0, 1) * 255),
    b: Math.round(clamp(color.b, 0, 1) * 255),
    a: Math.round(clamp(fallbackAlpha, 0, 1) * 255),
  }
}

const withAlpha = (color: RgbaByte, alpha: number): RgbaByte => {
  return {
    r: color.r,
    g: color.g,
    b: color.b,
    a: Math.round(clamp(alpha, 0, 1) * 255),
  }
}

const resolveToneColor = (
  tone: BitmapUiTone | undefined,
  explicitColor: BitmapUiColorLike | null | undefined,
  palette: BitmapUiPalette,
): RgbaByte => {
  if (explicitColor) return colorLikeToLinearRgba(explicitColor)
  if (tone === 'accent') return colorLikeToLinearRgba(palette.accentText)
  const normal = colorLikeToLinearRgba(palette.normalText)
  if (tone === 'dim') return withAlpha(normal, palette.dimOpacity)
  return normal
}

const cloneRect = (rect: Rect): BitmapUiDebugRect => {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}

const cloneColor = (color: RgbaByte | null): BitmapUiDebugColor | null => {
  if (!color) return null
  return { r: color.r, g: color.g, b: color.b, a: color.a }
}

const cloneTextLayout = (layout: TextLayout): BitmapUiDebugTextLayout => {
  return {
    lines: layout.lines.map((line) => ({
      text: line.text,
      start: line.start,
      end: line.end,
      width: line.width,
    })),
    contentWidth: layout.contentWidth,
    contentHeight: layout.contentHeight,
    lineAdvance: layout.lineAdvance,
    cellHeight: layout.cellHeight,
    advanceWidth: layout.advanceWidth,
  }
}

const cloneFieldState = (field: InternalFieldState): BitmapUiDebugFieldState => {
  return {
    type: field.type,
    value: field.value,
    placeholder: field.placeholder,
    maxLength: field.maxLength,
    caret: field.caret,
    preferredColumn: field.preferredColumn,
  }
}

const cloneFont = (font: BitmapUiFontAtlas): BitmapUiDebugFont => {
  return {
    id: font.id,
    label: font.label,
    cellWidth: font.cellWidth,
    cellHeight: font.cellHeight,
    advanceWidth: font.advanceWidth,
    lineAdvance: font.lineAdvance,
    ascent: font.ascent,
    descent: font.descent,
    internalLeading: font.internalLeading,
    externalLeading: font.externalLeading,
    firstCode: font.firstCode,
    glyphCount: font.glyphCount,
    defaultCode: font.defaultCode,
    atlasColumns: font.atlasColumns,
    atlasRows: font.atlasRows,
    atlasWidth: font.atlasWidth,
    atlasHeight: font.atlasHeight,
  }
}

const cloneRichTextLayout = (layout: ResolvedRichTextLayout) => {
  return {
    lines: layout.lines.map((line) => ({
      width: line.width,
      ascent: line.ascent,
      descent: line.descent,
      baseline: line.baseline,
      fragments: line.fragments.map((fragment) => ({
        text: fragment.text,
        x: fragment.x,
        width: fragment.width,
        font: cloneFont(fragment.font),
        pixelScale: fragment.pixelScale,
        ascent: fragment.ascent,
        descent: fragment.descent,
        textColor: cloneColor(fragment.textColor)!,
        backgroundColor: cloneColor(fragment.backgroundColor),
      })),
    })),
    contentWidth: layout.contentWidth,
    contentHeight: layout.contentHeight,
  }
}

const cloneResolvedNode = (node: ResolvedNode): BitmapUiDebugNode => {
  const base = {
    kind: node.kind,
    nodeId: node.nodeId,
    zIndex: node.zIndex,
    box: cloneRect(node.box),
    contentBox: cloneRect(node.contentBox),
    backgroundColor: cloneColor(node.backgroundColor),
    borderColor: cloneColor(node.borderColor),
    borderWidth: node.borderWidth,
    clip: node.clip,
    interactionId: node.interactionId,
    interactionRole: node.interactionRole,
  }

  if (node.kind === 'view') {
    return {
      ...base,
      kind: 'view',
      children: node.children.map((child) => cloneResolvedNode(child)),
    }
  }

  if (node.kind === 'text') {
    return {
      ...base,
      kind: 'text',
      text: node.text,
      font: cloneFont(node.font),
      pixelScale: node.pixelScale,
      lineGap: node.lineGap,
      textLayout: cloneTextLayout(node.textLayout),
      textAlign: node.textAlign,
      textColor: cloneColor(node.textColor)!,
      overflow: node.overflow,
      scrollOffset: node.scrollOffset,
    }
  }

  if (node.kind === 'richText') {
    return {
      ...base,
      kind: 'richText',
      text: node.text,
      lineGap: node.lineGap,
      textAlign: node.textAlign,
      richTextLayout: cloneRichTextLayout(node.richTextLayout),
      overflow: node.overflow,
      scrollOffset: node.scrollOffset,
    }
  }

  if (node.kind === 'input' || node.kind === 'textarea') {
    return {
      ...base,
      kind: node.kind,
      fieldId: node.fieldId,
      fieldType: node.fieldType,
      font: cloneFont(node.font),
      pixelScale: node.pixelScale,
      lineGap: node.lineGap,
      textAlign: node.textAlign,
      textColor: cloneColor(node.textColor)!,
      placeholderColor: cloneColor(node.placeholderColor)!,
      caretColor: cloneColor(node.caretColor)!,
      valueLayout: cloneTextLayout(node.valueLayout),
      renderLayout: cloneTextLayout(node.renderLayout),
      showPlaceholder: node.showPlaceholder,
    }
  }

  if (node.kind === 'rule') {
    return {
      ...base,
      kind: 'rule',
      orientation: node.orientation,
      thickness: node.thickness,
      ruleColor: cloneColor(node.ruleColor),
    }
  }

  if (node.kind === 'table') {
    return {
      ...base,
      kind: 'table',
      columns: node.columns.map((column) => ({
        id: column.id,
        width: column.width,
        textAlign: column.textAlign,
      })),
      rowCount: node.rowCount,
      headerRowId: node.headerRowId,
      children: node.children.map((child) => cloneResolvedNode(child)),
    }
  }

  return {
    ...base,
    kind: 'spacer',
  }
}

const resolveDocumentBackgroundColor = (
  document: BitmapUiDocument,
  palette: BitmapUiPalette,
): RgbaByte => {
  if (document.backgroundColor !== undefined && document.backgroundColor !== null) {
    return colorLikeToLinearRgba(document.backgroundColor)
  }
  return colorLikeToLinearRgba(palette.background)
}

const getNodePadding = (node: BitmapUiNode): number => Math.max(0, Math.round(node.padding ?? 0))
const getNodeBorderWidth = (node: BitmapUiNode): number => Math.max(0, Math.round(node.borderWidth ?? 0))

const resolveRichTextLayoutColors = (
  layout: RichTextLayout,
  palette: BitmapUiPalette,
): ResolvedRichTextLayout => {
  return {
    lines: layout.lines.map((line) => ({
      width: line.width,
      ascent: line.ascent,
      descent: line.descent,
      baseline: line.baseline,
      fragments: line.fragments.map((fragment) => ({
        text: fragment.text,
        x: fragment.x,
        width: fragment.width,
        font: fragment.font,
        pixelScale: fragment.pixelScale,
        ascent: fragment.ascent,
        descent: fragment.descent,
        textColor: resolveToneColor(fragment.tone, fragment.color, palette),
        backgroundColor: fragment.backgroundColor ? colorLikeToLinearRgba(fragment.backgroundColor) : null,
      })),
    })),
    contentWidth: layout.contentWidth,
    contentHeight: layout.contentHeight,
  }
}

const resolveTableColumnTextStyle = (
  inheritedTextStyle: ResolvedTextStyle,
  column: BitmapUiTableColumn,
): ResolvedTextStyle => {
  const style = resolveInheritedTextStyle(inheritedTextStyle, column.textStyle)
  return column.textAlign ? { ...style, textAlign: column.textAlign } : style
}

const resolveTableCellTextStyle = (
  inheritedTextStyle: ResolvedTextStyle,
  column: BitmapUiTableColumn,
  cell: BitmapUiTableCell | undefined,
): ResolvedTextStyle => {
  let style = resolveTableColumnTextStyle(inheritedTextStyle, column)
  if (!cell) return style
  style = resolveInheritedTextStyle(style, cell.textStyle)
  if (cell.textAlign !== undefined) style = { ...style, textAlign: cell.textAlign }
  if (cell.tone !== undefined) style = { ...style, tone: cell.tone }
  if (cell.color !== undefined) style = { ...style, color: cell.color }
  return style
}

type TableCellMeasurement = {
  readonly columnId: string
  readonly textAlign: BitmapUiTextAlign
  readonly textColor: RgbaByte
  readonly font: BitmapUiFontAtlas
  readonly pixelScale: number
  readonly lineGap: number
  readonly contentKind: 'text' | 'richText' | 'empty'
  readonly text: string
  readonly textLayout: TextLayout | null
  readonly richTextLayout: ResolvedRichTextLayout | null
  readonly backgroundColor: RgbaByte | null
  readonly borderColor: RgbaByte | null
  readonly width: number
  readonly height: number
}

type TableRowMeasurement = {
  readonly id: string
  readonly cells: readonly TableCellMeasurement[]
  readonly height: number
  readonly backgroundColor: RgbaByte | null
  readonly borderColor: RgbaByte | null
}

type TableMeasurement = {
  readonly columns: readonly {
    readonly id: string
    readonly width: number
    readonly textAlign: BitmapUiTextAlign
  }[]
  readonly headerRowId: string | null
  readonly rows: readonly TableRowMeasurement[]
  readonly contentWidth: number
  readonly contentHeight: number
}

const measureTableContent = (
  node: BitmapUiTableNode,
  availableWidth: number,
  _availableHeight: number,
  inheritedTextStyle: ResolvedTextStyle,
  palette: BitmapUiPalette,
): TableMeasurement => {
  const columnGap = Math.max(0, Math.round(node.columnGap ?? 1))
  const rowGap = Math.max(0, Math.round(node.rowGap ?? 1))
  const rows = node.headerRow ? [node.headerRow, ...node.rows] : [...node.rows]
  const intrinsicWidths = new Map<string, number>()

  const measureIntrinsicCellWidth = (column: BitmapUiTableColumn, cell: BitmapUiTableCell | undefined): number => {
    const style = resolveTableCellTextStyle(inheritedTextStyle, column, cell)
    if (cell?.runs && cell.runs.length > 0) {
      return createRichTextLayout(cell.runs, false, Number.POSITIVE_INFINITY, style).contentWidth
    }
    const text = cell?.text ?? ''
    return createTextLayout(text, false, Number.POSITIVE_INFINITY, style.font, style.pixelScale, style.lineGap).contentWidth
  }

  for (const column of node.columns) {
    let intrinsicWidth = 0
    for (const row of rows) {
      intrinsicWidth = Math.max(intrinsicWidth, measureIntrinsicCellWidth(column, row.cells[column.id]))
    }
    intrinsicWidths.set(column.id, intrinsicWidth)
  }

  const gapWidth = Math.max(0, node.columns.length - 1) * columnGap
  const fixedWidth = node.columns.reduce((sum, column) => {
    if (typeof column.width === 'number') return sum + Math.round(column.width)
    if (column.width === 'fill') return sum
    const intrinsic = intrinsicWidths.get(column.id) ?? 0
    return sum + resolveLength('content', intrinsic, intrinsic, column.minWidth, column.maxWidth)
  }, 0)
  const fillColumns = node.columns.filter((column) => column.width === 'fill')
  const finiteWidth = Number.isFinite(availableWidth)
  const remainingWidth = finiteWidth
    ? Math.max(0, availableWidth - fixedWidth - gapWidth)
    : 0
  const fillWidth = fillColumns.length > 0
    ? Math.floor(remainingWidth / fillColumns.length)
    : 0
  const fillRemainder = fillColumns.length > 0
    ? remainingWidth - fillWidth * fillColumns.length
    : 0

  const resolvedColumns = node.columns.map((column, index) => {
    let width = 0
    if (typeof column.width === 'number') {
      width = Math.round(column.width)
    } else if (column.width === 'fill') {
      const fillIndex = fillColumns.findIndex((candidate) => candidate.id === column.id)
      width = fillWidth + (fillIndex >= 0 && fillIndex < fillRemainder ? 1 : 0)
      if (!finiteWidth) {
        width = intrinsicWidths.get(column.id) ?? 0
      }
    } else {
      width = intrinsicWidths.get(column.id) ?? 0
    }
    width = resolveLength(width, width, width, column.minWidth, column.maxWidth)
    return {
      id: column.id,
      width,
      textAlign: column.textAlign ?? 'start',
      index,
    }
  })

  const measuredRows = rows.map((row) => {
    const cells = resolvedColumns.map((column) => {
      const cell = row.cells[column.id]
      const textStyle = resolveTableCellTextStyle(inheritedTextStyle, node.columns[column.index]!, cell)
      const textAlign = cell?.textAlign ?? column.textAlign
      const backgroundColor = cell?.backgroundColor ? colorLikeToLinearRgba(cell.backgroundColor) : null
      const borderColor = cell?.borderColor ? colorLikeToLinearRgba(cell.borderColor) : null
      if (cell?.runs && cell.runs.length > 0) {
        const richTextLayout = resolveRichTextLayoutColors(
          createRichTextLayout(cell.runs, Boolean(cell.wrap), column.width, textStyle),
          palette,
        )
        return {
          columnId: column.id,
          textAlign,
          textColor: resolveToneColor(textStyle.tone, textStyle.color, palette),
          font: textStyle.font,
          pixelScale: textStyle.pixelScale,
          lineGap: textStyle.lineGap,
          contentKind: 'richText',
          text: collectRichTextPlainText(cell.runs),
          textLayout: null,
          richTextLayout,
          backgroundColor,
          borderColor,
          width: column.width,
          height: richTextLayout.contentHeight,
        } satisfies TableCellMeasurement
      }
      const text = cell?.text ?? ''
      const textLayout = createTextLayout(
        text,
        Boolean(cell?.wrap),
        cell?.wrap ? column.width : Number.POSITIVE_INFINITY,
        textStyle.font,
        textStyle.pixelScale,
        textStyle.lineGap,
      )
      return {
        columnId: column.id,
        textAlign,
        textColor: resolveToneColor(textStyle.tone, textStyle.color, palette),
        font: textStyle.font,
        pixelScale: textStyle.pixelScale,
        lineGap: textStyle.lineGap,
        contentKind: text.length > 0 ? 'text' : 'empty',
        text,
        textLayout,
        richTextLayout: null,
        backgroundColor,
        borderColor,
        width: column.width,
        height: textLayout.contentHeight,
      } satisfies TableCellMeasurement
    })

    const intrinsicHeight = cells.reduce((maxValue, cell) => Math.max(maxValue, cell.height), 0)
    const resolvedHeight = resolveLength(
      row.height,
      intrinsicHeight,
      intrinsicHeight,
      undefined,
      undefined,
    )
    return {
      id: row.id,
      cells,
      height: resolvedHeight,
      backgroundColor: row.backgroundColor ? colorLikeToLinearRgba(row.backgroundColor) : null,
      borderColor: row.borderColor ? colorLikeToLinearRgba(row.borderColor) : null,
    } satisfies TableRowMeasurement
  })

  const contentWidth = resolvedColumns.reduce((sum, column) => sum + column.width, 0) + gapWidth
  const contentHeight = measuredRows.reduce((sum, row) => sum + row.height, 0) + Math.max(0, measuredRows.length - 1) * rowGap

  return {
    columns: resolvedColumns.map(({ id, width, textAlign }) => ({ id, width, textAlign })),
    headerRowId: node.headerRow?.id ?? null,
    rows: measuredRows,
    contentWidth,
    contentHeight,
  }
}

const allocateFlexLengths = (remainingMain: number, flexValues: readonly number[]): readonly number[] => {
  const totalFlex = flexValues.reduce((sum, value) => sum + value, 0)
  if (totalFlex <= 0) return flexValues.map(() => 0)
  const base = flexValues.map((flex) => Math.floor((remainingMain * flex) / totalFlex))
  let remainder = remainingMain - base.reduce((sum, value) => sum + value, 0)
  const order = flexValues
    .map((flex, index) => ({
      index,
      fraction: (remainingMain * flex) / totalFlex - base[index]!,
    }))
    .sort((left, right) => {
      if (right.fraction !== left.fraction) return right.fraction - left.fraction
      return left.index - right.index
    })
  for (const entry of order) {
    if (remainder <= 0) break
    base[entry.index] = (base[entry.index] ?? 0) + 1
    remainder -= 1
  }
  return base
}

const measureNode = (
  node: BitmapUiNode,
  availableWidth: number,
  availableHeight: number,
  context: MeasureContext,
  inheritedTextStyle: ResolvedTextStyle,
): { width: number; height: number } => {
  const borderWidth = getNodeBorderWidth(node)
  const padding = getNodePadding(node)
  const inset = borderWidth + padding
  const innerAvailableWidth = Math.max(0, availableWidth - inset * 2)
  const innerAvailableHeight = Math.max(0, availableHeight - inset * 2)
  const nextInheritedTextStyle = resolveInheritedTextStyle(inheritedTextStyle, node.textStyle)

  switch (node.kind) {
    case 'text': {
      const textStyle = resolveRenderableTextStyle(node, nextInheritedTextStyle)
      const textLayout = createTextLayout(
        node.text,
        Boolean(node.wrap),
        node.wrap ? innerAvailableWidth : Number.POSITIVE_INFINITY,
        textStyle.font,
        textStyle.pixelScale,
        textStyle.lineGap,
      )
      return {
        width: resolveLength(node.width, textLayout.contentWidth + inset * 2, availableWidth, node.minWidth, node.maxWidth),
        height: resolveLength(node.height, textLayout.contentHeight + inset * 2, availableHeight, node.minHeight, node.maxHeight),
      }
    }
    case 'richText': {
      const textStyle = resolveRenderableTextStyle(node, nextInheritedTextStyle)
      const richTextLayout = createRichTextLayout(
        node.runs,
        Boolean(node.wrap),
        node.wrap ? innerAvailableWidth : Number.POSITIVE_INFINITY,
        textStyle,
      )
      return {
        width: resolveLength(node.width, richTextLayout.contentWidth + inset * 2, availableWidth, node.minWidth, node.maxWidth),
        height: resolveLength(node.height, richTextLayout.contentHeight + inset * 2, availableHeight, node.minHeight, node.maxHeight),
      }
    }
    case 'input':
    case 'textarea': {
      const textStyle = resolveRenderableTextStyle(node, nextInheritedTextStyle)
      const field = context.fields.get(node.fieldId)
      const placeholder = field?.placeholder ?? ''
      const renderText = field && field.value.length > 0 ? field.value : placeholder
      const textLayout = createTextLayout(
        renderText,
        node.kind === 'textarea',
        node.kind === 'textarea' ? innerAvailableWidth : Number.POSITIVE_INFINITY,
        textStyle.font,
        textStyle.pixelScale,
        textStyle.lineGap,
      )
      const minimumWidth = node.kind === 'textarea'
        ? textStyle.font.advanceWidth * textStyle.pixelScale * 18
        : textStyle.font.advanceWidth * textStyle.pixelScale * 12
      const minimumHeight = node.kind === 'textarea'
        ? textStyle.font.cellHeight * textStyle.pixelScale * 4
        : textStyle.font.cellHeight * textStyle.pixelScale
      return {
        width: resolveLength(
          node.width,
          Math.max(textLayout.contentWidth, minimumWidth) + inset * 2,
          availableWidth,
          node.minWidth,
          node.maxWidth,
        ),
        height: resolveLength(
          node.height,
          Math.max(textLayout.contentHeight, minimumHeight) + inset * 2,
          availableHeight,
          node.minHeight,
          node.maxHeight,
        ),
      }
    }
    case 'spacer':
      return {
        width: resolveLength(node.width, 0, availableWidth, node.minWidth, node.maxWidth),
        height: resolveLength(node.height, 0, availableHeight, node.minHeight, node.maxHeight),
      }
    case 'rule': {
      const thickness = Math.max(1, Math.round(node.thickness ?? 1))
      const contentWidth = node.orientation === 'vertical' ? thickness : Number.isFinite(innerAvailableWidth) ? innerAvailableWidth : thickness
      const contentHeight = node.orientation === 'vertical' ? (Number.isFinite(innerAvailableHeight) ? innerAvailableHeight : thickness) : thickness
      return {
        width: resolveLength(node.width, contentWidth + inset * 2, availableWidth, node.minWidth, node.maxWidth),
        height: resolveLength(node.height, contentHeight + inset * 2, availableHeight, node.minHeight, node.maxHeight),
      }
    }
    case 'table': {
      const table = measureTableContent(node, innerAvailableWidth, innerAvailableHeight, nextInheritedTextStyle, context.palette)
      return {
        width: resolveLength(node.width, table.contentWidth + inset * 2, availableWidth, node.minWidth, node.maxWidth),
        height: resolveLength(node.height, table.contentHeight + inset * 2, availableHeight, node.minHeight, node.maxHeight),
      }
    }
    case 'view': {
      const gap = Math.max(0, Math.round(node.gap ?? 0))
      const flowChildren = node.children.filter((child) => child.position !== 'absolute')
      const flowMeasurements = flowChildren.map((child) =>
        measureNode(
          child,
          node.direction === 'column' ? innerAvailableWidth : Number.POSITIVE_INFINITY,
          node.direction === 'row' ? innerAvailableHeight : Number.POSITIVE_INFINITY,
          context,
          nextInheritedTextStyle,
        ),
      )
      const flowWidth =
        node.direction === 'column'
          ? flowMeasurements.reduce((maxValue, child) => Math.max(maxValue, child.width), 0)
          : flowMeasurements.reduce((sum, child) => sum + child.width, 0) + Math.max(0, flowMeasurements.length - 1) * gap
      const flowHeight =
        node.direction === 'column'
          ? flowMeasurements.reduce((sum, child) => sum + child.height, 0) + Math.max(0, flowMeasurements.length - 1) * gap
          : flowMeasurements.reduce((maxValue, child) => Math.max(maxValue, child.height), 0)
      let absoluteWidth = 0
      let absoluteHeight = 0
      for (const child of node.children) {
        if (child.position !== 'absolute') continue
        const childX = Math.max(0, Math.round(child.x ?? 0))
        const childY = Math.max(0, Math.round(child.y ?? 0))
        const measurement = measureNode(
          child,
          Math.max(0, innerAvailableWidth - childX),
          Math.max(0, innerAvailableHeight - childY),
          context,
          nextInheritedTextStyle,
        )
        absoluteWidth = Math.max(absoluteWidth, childX + measurement.width)
        absoluteHeight = Math.max(absoluteHeight, childY + measurement.height)
      }
      const contentWidth = Math.max(flowWidth, absoluteWidth)
      const contentHeight = Math.max(flowHeight, absoluteHeight)
      return {
        width: resolveLength(node.width, contentWidth + inset * 2, availableWidth, node.minWidth, node.maxWidth),
        height: resolveLength(node.height, contentHeight + inset * 2, availableHeight, node.minHeight, node.maxHeight),
      }
    }
  }
}

const resolveFieldBackground = (node: BitmapUiNode, palette: BitmapUiPalette): RgbaByte | null => {
  if ('backgroundColor' in node && node.backgroundColor !== undefined && node.backgroundColor !== null) {
    return colorLikeToLinearRgba(node.backgroundColor)
  }
  if (node.kind === 'input' || node.kind === 'textarea') {
    return colorLikeToLinearRgba(palette.inputFill)
  }
  return null
}

const createResolvedTableChildren = (
  node: BitmapUiTableNode,
  contentBox: Rect,
  measurement: TableMeasurement,
): readonly ResolvedNode[] => {
  const columnGap = Math.max(0, Math.round(node.columnGap ?? 1))
  const rowGap = Math.max(0, Math.round(node.rowGap ?? 1))
  const children: ResolvedNode[] = []
  let rowY = contentBox.y

  for (const row of measurement.rows) {
    let columnX = contentBox.x
    for (const cell of row.cells) {
      const cellBox = { x: columnX, y: rowY, width: cell.width, height: row.height }
      const cellBorderWidth = cell.borderColor || row.borderColor ? 1 : 0
      const cellContentBox = insetRect(cellBox, cellBorderWidth)
      const cellBackgroundColor = cell.backgroundColor ?? row.backgroundColor
      const cellBorderColor = cell.borderColor ?? row.borderColor
      const nodeId = `${node.id}:${row.id}:${cell.columnId}`

      if (cell.contentKind === 'richText' && cell.richTextLayout) {
        children.push({
          kind: 'richText',
          nodeId,
          zIndex: 0,
          box: cellBox,
          contentBox: cellContentBox,
          backgroundColor: cellBackgroundColor,
          borderColor: cellBorderColor,
          borderWidth: cellBorderWidth,
          clip: true,
          interactionId: null,
          interactionRole: null,
          text: cell.text,
          lineGap: cell.lineGap,
          textAlign: cell.textAlign,
          richTextLayout: cell.richTextLayout,
          overflow: 'visible',
          scrollOffset: 0,
        })
      } else if (cell.contentKind === 'text' && cell.textLayout) {
        children.push({
          kind: 'text',
          nodeId,
          zIndex: 0,
          box: cellBox,
          contentBox: cellContentBox,
          backgroundColor: cellBackgroundColor,
          borderColor: cellBorderColor,
          borderWidth: cellBorderWidth,
          clip: true,
          interactionId: null,
          interactionRole: null,
          text: cell.text,
          font: cell.font,
          pixelScale: cell.pixelScale,
          lineGap: cell.lineGap,
          textLayout: cell.textLayout,
          textAlign: cell.textAlign,
          textColor: cell.textColor,
          overflow: 'visible',
          scrollOffset: 0,
        })
      } else {
        children.push({
          kind: 'view',
          nodeId,
          zIndex: 0,
          box: cellBox,
          contentBox: cellContentBox,
          backgroundColor: cellBackgroundColor,
          borderColor: cellBorderColor,
          borderWidth: cellBorderWidth,
          clip: true,
          interactionId: null,
          interactionRole: null,
          gradient: null,
          children: [],
        })
      }
      columnX += cell.width + columnGap
    }
    rowY += row.height + rowGap
  }

  return children
}

const resolveFieldBorder = (node: BitmapUiNode, palette: BitmapUiPalette): RgbaByte | null => {
  if ('borderColor' in node && node.borderColor !== undefined && node.borderColor !== null) {
    return colorLikeToLinearRgba(node.borderColor)
  }
  if (node.kind === 'input' || node.kind === 'textarea') {
    return colorLikeToLinearRgba(palette.inputBorder)
  }
  return null
}

const selectTopHit = <THit extends { readonly box: Rect; readonly zIndex: number; readonly order: number }>(
  hits: readonly THit[],
  position: { readonly x: number; readonly y: number },
): THit | null => {
  let match: THit | null = null
  for (const hit of hits) {
    if (!rectContains(hit.box, position.x, position.y)) continue
    if (!match) {
      match = hit
      continue
    }
    if (hit.zIndex !== match.zIndex ? hit.zIndex > match.zIndex : hit.order > match.order) {
      match = hit
    }
  }
  return match
}

const layoutNode = (
  node: BitmapUiNode,
  box: Rect,
  context: MeasureContext,
  palette: BitmapUiPalette,
  fieldHits: FieldHit[],
  interactionHits: InteractionHit[],
  fieldOrder: string[],
  hitState: LayoutHitState,
  inheritedTextStyle: ResolvedTextStyle,
): ResolvedNode => {
  const borderWidth = getNodeBorderWidth(node)
  const padding = getNodePadding(node)
  const contentBox = insetRect(box, borderWidth + padding)
  const backgroundColor = resolveFieldBackground(node, palette)
  const borderColor = resolveFieldBorder(node, palette)
  const hasScroll = node.kind === 'view' && (typeof node.scrollX === 'number' || typeof node.scrollY === 'number')
  const clip = Boolean(node.clip || hasScroll || node.kind === 'input' || node.kind === 'textarea')
  const nextInheritedTextStyle = resolveInheritedTextStyle(inheritedTextStyle, node.textStyle)
  const interactionId = node.interaction?.id?.trim() ? node.interaction.id.trim() : null
  const interactionRole = node.interaction?.role?.trim() ? node.interaction.role.trim() : null
  if (interactionId) {
    interactionHits.push({
      interactionId,
      interactionRole,
      box: node.interaction?.bounds === 'content' ? contentBox : box,
      zIndex: Math.round(node.zIndex ?? 0),
      order: hitState.order,
    })
  }
  hitState.order += 1

  if (node.kind === 'view') {
    const scrollX = Math.round(node.scrollX ?? 0)
    const scrollY = Math.round(node.scrollY ?? 0)
    const scrolledContentBox = {
      x: contentBox.x - scrollX,
      y: contentBox.y - scrollY,
      width: contentBox.width,
      height: contentBox.height,
    }
    const gap = Math.max(0, Math.round(node.gap ?? 0))
    const align = node.align ?? 'start'
    const justify = node.justify ?? 'start'
    const flowChildren = node.children.filter((child) => child.position !== 'absolute')
    const flowMeasurements = flowChildren.map((child) =>
      measureNode(
        child,
        node.direction === 'column' ? scrolledContentBox.width : Number.POSITIVE_INFINITY,
        node.direction === 'row' ? scrolledContentBox.height : Number.POSITIVE_INFINITY,
        context,
        nextInheritedTextStyle,
      ),
    )
    const flowMeasurementById = new Map(flowChildren.map((child, index) => [child.id, flowMeasurements[index]!]))
    const flowIndexById = new Map(flowChildren.map((child, index) => [child.id, index]))
    const flexValues = flowChildren.map((child) => {
      if (child.kind === 'spacer') return Math.max(0, child.flex ?? 1)
      const mainLength = node.direction === 'column' ? child.height : child.width
      return mainLength === 'fill' ? 1 : 0
    })
    const totalFlex = flexValues.reduce((sum, value) => sum + value, 0)
    const fixedMain = flowMeasurements.reduce((sum, measurement, index) => {
      const child = flowChildren[index]
      if (!child) return sum
      if ((flexValues[index] ?? 0) > 0) return sum
      return sum + (node.direction === 'column' ? measurement.height : measurement.width)
    }, 0)
    const availableMain = node.direction === 'column' ? scrolledContentBox.height : scrolledContentBox.width
    const availableCross = node.direction === 'column' ? scrolledContentBox.width : scrolledContentBox.height
    const remainingMain = Math.max(0, availableMain - fixedMain - Math.max(0, flowChildren.length - 1) * gap)
    const flexAllocations = allocateFlexLengths(remainingMain, flexValues)
    const intrinsicMain = fixedMain + Math.max(0, flowChildren.length - 1) * gap
    let cursor = node.direction === 'column' ? scrolledContentBox.y : scrolledContentBox.x
    if (totalFlex <= 0 && justify === 'center') {
      cursor += Math.round((availableMain - intrinsicMain) * 0.5)
    } else if (totalFlex <= 0 && justify === 'end') {
      cursor += Math.max(0, availableMain - intrinsicMain)
    }

    const children = node.children.map((child) => {
      if (child.position === 'absolute') {
        const childLocalX = Math.max(0, Math.round(child.x ?? 0))
        const childLocalY = Math.max(0, Math.round(child.y ?? 0))
        const measurement = measureNode(
          child,
          Math.max(0, scrolledContentBox.width - childLocalX),
          Math.max(0, scrolledContentBox.height - childLocalY),
          context,
          nextInheritedTextStyle,
        )
        return layoutNode(
          child,
          {
            x: scrolledContentBox.x + childLocalX,
            y: scrolledContentBox.y + childLocalY,
            width: measurement.width,
            height: measurement.height,
          },
          context,
          palette,
          fieldHits,
          interactionHits,
          fieldOrder,
          hitState,
          nextInheritedTextStyle,
        )
      }

      const flowIndex = flowIndexById.get(child.id) ?? -1
      const measurement = flowMeasurementById.get(child.id)!
      const flex = flexValues[flowIndex] ?? 0
      const allocatedMain = totalFlex > 0 && flex > 0
        ? (flexAllocations[flowIndex] ?? 0)
        : node.direction === 'column'
          ? measurement.height
          : measurement.width
      const desiredCross =
        node.direction === 'column'
          ? (child.width === 'fill' || align === 'stretch' ? availableCross : measurement.width)
          : (child.height === 'fill' || align === 'stretch' ? availableCross : measurement.height)
      const childWidth = node.direction === 'column' ? desiredCross : allocatedMain
      const childHeight = node.direction === 'column' ? allocatedMain : desiredCross
      let childX = scrolledContentBox.x
      let childY = scrolledContentBox.y
      if (node.direction === 'column') {
        childY = cursor
        if (align === 'center') childX = scrolledContentBox.x + Math.round((availableCross - childWidth) * 0.5)
        else if (align === 'end') childX = scrolledContentBox.x + Math.max(0, availableCross - childWidth)
      } else {
        childX = cursor
        if (align === 'center') childY = scrolledContentBox.y + Math.round((availableCross - childHeight) * 0.5)
        else if (align === 'end') childY = scrolledContentBox.y + Math.max(0, availableCross - childHeight)
      }
      const childNode = layoutNode(
        child,
        { x: childX, y: childY, width: childWidth, height: childHeight },
        context,
        palette,
        fieldHits,
        interactionHits,
        fieldOrder,
        hitState,
        nextInheritedTextStyle,
      )
      cursor += allocatedMain + gap
      return childNode
    })

    return {
      kind: 'view',
      nodeId: node.id,
      zIndex: Math.round(node.zIndex ?? 0),
      box,
      contentBox,
      backgroundColor,
      borderColor,
      borderWidth,
      clip,
      interactionId,
      interactionRole,
      gradient: node.gradient ?? null,
      children,
    }
  }

  if (node.kind === 'text') {
    const textStyle = resolveRenderableTextStyle(node, nextInheritedTextStyle)
    const textLayout = createTextLayout(
      node.text,
      Boolean(node.wrap),
      node.wrap ? contentBox.width : Number.POSITIVE_INFINITY,
      textStyle.font,
      textStyle.pixelScale,
      textStyle.lineGap,
    )
    return {
      kind: 'text',
      nodeId: node.id,
      zIndex: Math.round(node.zIndex ?? 0),
      box,
      contentBox,
      backgroundColor,
      borderColor,
      borderWidth,
      clip,
      interactionId,
      interactionRole,
      text: node.text,
      font: textStyle.font,
      pixelScale: textStyle.pixelScale,
      lineGap: textStyle.lineGap,
      textLayout,
      textAlign: textStyle.textAlign,
      textColor: resolveToneColor(textStyle.tone, textStyle.color, palette),
      overflow: node.overflow ?? 'visible',
      scrollOffset: node.scrollOffset ?? 0,
    }
  }

  if (node.kind === 'richText') {
    const textStyle = resolveRenderableTextStyle(node, nextInheritedTextStyle)
    const richTextLayout = resolveRichTextLayoutColors(
      createRichTextLayout(
        node.runs,
        Boolean(node.wrap),
        node.wrap ? contentBox.width : Number.POSITIVE_INFINITY,
        textStyle,
      ),
      palette,
    )
    return {
      kind: 'richText',
      nodeId: node.id,
      zIndex: Math.round(node.zIndex ?? 0),
      box,
      contentBox,
      backgroundColor,
      borderColor,
      borderWidth,
      clip,
      interactionId,
      interactionRole,
      text: collectRichTextPlainText(node.runs),
      lineGap: textStyle.lineGap,
      textAlign: textStyle.textAlign,
      richTextLayout,
      overflow: node.overflow ?? 'visible',
      scrollOffset: node.scrollOffset ?? 0,
    }
  }

  if (node.kind === 'rule') {
    const orientation = node.orientation ?? 'horizontal'
    return {
      kind: 'rule',
      nodeId: node.id,
      zIndex: Math.round(node.zIndex ?? 0),
      box,
      contentBox,
      backgroundColor,
      borderColor,
      borderWidth,
      clip,
      interactionId,
      interactionRole,
      orientation,
      thickness: Math.max(1, Math.round(node.thickness ?? 1)),
      ruleColor: node.color !== undefined && node.color !== null
        ? colorLikeToLinearRgba(node.color)
        : borderColor ?? colorLikeToLinearRgba(palette.chromeBorder),
    }
  }

  if (node.kind === 'table') {
    const tableMeasurement = measureTableContent(node, contentBox.width, contentBox.height, nextInheritedTextStyle, palette)
    return {
      kind: 'table',
      nodeId: node.id,
      zIndex: Math.round(node.zIndex ?? 0),
      box,
      contentBox,
      backgroundColor,
      borderColor,
      borderWidth,
      clip,
      interactionId,
      interactionRole,
      columns: tableMeasurement.columns,
      rowCount: tableMeasurement.rows.length,
      headerRowId: tableMeasurement.headerRowId,
      children: createResolvedTableChildren(node, contentBox, tableMeasurement),
    }
  }

  if (node.kind === 'input' || node.kind === 'textarea') {
    const textStyle = resolveRenderableTextStyle(node, nextInheritedTextStyle)
    const field = context.fields.get(node.fieldId)
    const value = field?.value ?? ''
    const placeholder = field?.placeholder ?? ''
    const lineGap = textStyle.lineGap
    const valueLayout = createTextLayout(
      value,
      node.kind === 'textarea',
      node.kind === 'textarea' ? contentBox.width : Number.POSITIVE_INFINITY,
      textStyle.font,
      textStyle.pixelScale,
      lineGap,
    )
    const showPlaceholder = value.length === 0 && placeholder.length > 0
    const renderLayout = showPlaceholder
      ? createTextLayout(
        placeholder,
        node.kind === 'textarea',
        node.kind === 'textarea' ? contentBox.width : Number.POSITIVE_INFINITY,
        textStyle.font,
        textStyle.pixelScale,
        lineGap,
      )
      : valueLayout
    const textAlign = textStyle.textAlign
    const textColor = resolveToneColor(textStyle.tone, textStyle.color, palette)
    const placeholderColor = 'placeholderColor' in node && node.placeholderColor !== undefined && node.placeholderColor !== null
      ? colorLikeToLinearRgba(node.placeholderColor)
      : withAlpha(textColor, palette.dimOpacity)
    const caretColor = 'caretColor' in node && node.caretColor !== undefined && node.caretColor !== null
      ? colorLikeToLinearRgba(node.caretColor)
      : colorLikeToLinearRgba(palette.caret)
    fieldHits.push({
      fieldId: node.fieldId,
      fieldType: node.kind,
      box,
      contentBox,
      textAlign,
      valueLayout,
      zIndex: Math.round(node.zIndex ?? 0),
      order: hitState.order,
    })
    fieldOrder.push(node.fieldId)
    return {
      kind: node.kind,
      nodeId: node.id,
      zIndex: Math.round(node.zIndex ?? 0),
      box,
      contentBox,
      backgroundColor,
      borderColor,
      borderWidth,
      clip,
      interactionId,
      interactionRole,
      fieldId: node.fieldId,
      fieldType: node.kind,
      font: textStyle.font,
      pixelScale: textStyle.pixelScale,
      lineGap,
      textAlign,
      textColor,
      placeholderColor,
      caretColor,
      valueLayout,
      renderLayout,
      showPlaceholder,
    }
  }

  return {
    kind: 'spacer',
    nodeId: node.id,
    zIndex: Math.round(node.zIndex ?? 0),
    box,
    contentBox,
    backgroundColor,
    borderColor,
    borderWidth,
    clip,
    interactionId,
    interactionRole,
  }
}

// Bitmap pixel buffer: row 0 = top of image, Y-down. See COORDINATES.md.
const createDataTexture = (data: Uint8Array, width: number, height: number, name: string): THREE.DataTexture => {
  const textureRef = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType)
  textureRef.name = name
  textureRef.magFilter = THREE.NearestFilter
  textureRef.minFilter = THREE.NearestFilter
  textureRef.wrapS = THREE.ClampToEdgeWrapping
  textureRef.wrapT = THREE.ClampToEdgeWrapping
  textureRef.generateMipmaps = false
  textureRef.needsUpdate = true
  textureRef.unpackAlignment = 1
  textureRef.flipY = false
  textureRef.colorSpace = THREE.NoColorSpace
  return textureRef
}

const blendPixel = (
  buffer: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  color: RgbaByte,
  clipRect: Rect | null,
  alphaScale = 1,
): void => {
  if (x < 0 || y < 0 || x >= width || y >= height) return
  if (clipRect && !rectContains(clipRect, x, y)) return
  const scaledAlpha = clamp(Math.round(color.a * alphaScale), 0, 255)
  if (scaledAlpha <= 0) return
  const offset = (y * width + x) * 4
  const destinationAlpha = buffer[offset + 3] ?? 0
  const srcAlpha = scaledAlpha / 255
  const dstAlpha = destinationAlpha / 255
  const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha)
  const blendChannel = (src: number, dst: number): number => {
    if (outAlpha <= 1e-6) return 0
    return Math.round((src * srcAlpha + dst * dstAlpha * (1 - srcAlpha)) / outAlpha)
  }
  buffer[offset] = blendChannel(color.r, buffer[offset] ?? 0)
  buffer[offset + 1] = blendChannel(color.g, buffer[offset + 1] ?? 0)
  buffer[offset + 2] = blendChannel(color.b, buffer[offset + 2] ?? 0)
  buffer[offset + 3] = Math.round(outAlpha * 255)
}

const fillRect = (
  buffer: Uint8Array,
  width: number,
  height: number,
  rect: Rect,
  color: RgbaByte | null,
  clipRect: Rect | null,
): void => {
  if (!color || color.a <= 0) return
  const target = clipRect ? intersectRect(rect, clipRect) : rect
  if (!target) return
  for (let y = target.y; y < target.y + target.height; y += 1) {
    for (let x = target.x; x < target.x + target.width; x += 1) {
      blendPixel(buffer, width, height, x, y, color, null)
    }
  }
}

const strokeRect = (
  buffer: Uint8Array,
  width: number,
  height: number,
  rect: Rect,
  borderWidth: number,
  color: RgbaByte | null,
  clipRect: Rect | null,
): void => {
  if (!color || borderWidth <= 0) return
  fillRect(buffer, width, height, { x: rect.x, y: rect.y, width: rect.width, height: borderWidth }, color, clipRect)
  fillRect(
    buffer,
    width,
    height,
    { x: rect.x, y: rect.y + Math.max(0, rect.height - borderWidth), width: rect.width, height: borderWidth },
    color,
    clipRect,
  )
  fillRect(buffer, width, height, { x: rect.x, y: rect.y, width: borderWidth, height: rect.height }, color, clipRect)
  fillRect(
    buffer,
    width,
    height,
    { x: rect.x + Math.max(0, rect.width - borderWidth), y: rect.y, width: borderWidth, height: rect.height },
    color,
    clipRect,
  )
}

const drawGlyph = (
  buffer: Uint8Array,
  width: number,
  height: number,
  font: BitmapUiFontAtlas,
  pixelScale: number,
  glyphCode: number,
  x: number,
  y: number,
  color: RgbaByte,
  clipRect: Rect | null,
): void => {
  const glyphIndex = clamp(glyphCode - font.firstCode, 0, Math.max(0, font.glyphCount - 1))
  const atlasColumn = glyphIndex % font.atlasColumns
  const atlasRow = Math.floor(glyphIndex / font.atlasColumns)
  const atlasOriginX = atlasColumn * font.cellWidth
  const atlasOriginY = atlasRow * font.cellHeight

  for (let sourceY = 0; sourceY < font.cellHeight; sourceY += 1) {
    for (let sourceX = 0; sourceX < font.cellWidth; sourceX += 1) {
      const atlasOffset = ((atlasOriginY + sourceY) * font.atlasWidth + (atlasOriginX + sourceX)) * 4
      const coverage = font.atlasData[atlasOffset] ?? 0
      if (coverage <= 0) continue
      const destinationX = x + sourceX * pixelScale
      const destinationY = y + sourceY * pixelScale
      for (let scaleY = 0; scaleY < pixelScale; scaleY += 1) {
        for (let scaleX = 0; scaleX < pixelScale; scaleX += 1) {
          blendPixel(buffer, width, height, destinationX + scaleX, destinationY + scaleY, color, clipRect, coverage / 255)
        }
      }
    }
  }
}

const drawTextLayout = (
  buffer: Uint8Array,
  width: number,
  height: number,
  font: BitmapUiFontAtlas,
  pixelScale: number,
  layout: TextLayout,
  origin: Rect,
  textAlign: BitmapUiTextAlign,
  color: RgbaByte,
  clipRect: Rect | null,
  scrollOffset = 0,
): void => {
  layout.lines.forEach((line, lineIndex) => {
    const lineWidth = line.width * layout.advanceWidth
    const lineX = alignTextOriginX(origin, lineWidth, textAlign) - scrollOffset
    const lineY = origin.y + lineIndex * layout.lineAdvance
    for (let characterIndex = 0; characterIndex < line.text.length; characterIndex += 1) {
      const glyph = line.text[characterIndex] ?? ' '
      if (glyph === ' ') continue
      drawGlyph(
        buffer,
        width,
        height,
        font,
        pixelScale,
        font.lookupGlyphCode(glyph),
        lineX + characterIndex * layout.advanceWidth,
        lineY,
        color,
        clipRect,
      )
    }
  })
}

const drawRichTextLayout = (
  buffer: Uint8Array,
  width: number,
  height: number,
  layout: ResolvedRichTextLayout,
  origin: Rect,
  textAlign: BitmapUiTextAlign,
  clipRect: Rect | null,
  scrollOffset = 0,
): void => {
  for (const line of layout.lines) {
    const lineX = alignTextOriginX(origin, line.width, textAlign) - scrollOffset
    const lineTop = origin.y + line.baseline - line.ascent
    for (const fragment of line.fragments) {
      if (fragment.backgroundColor && fragment.width > 0) {
        fillRect(
          buffer,
          width,
          height,
          {
            x: lineX + fragment.x,
            y: lineTop + line.ascent - fragment.ascent,
            width: fragment.width,
            height: fragment.ascent + fragment.descent,
          },
          fragment.backgroundColor,
          clipRect,
        )
      }
      let cursorX = lineX + fragment.x
      const glyphTop = lineTop + line.ascent - fragment.ascent
      for (const glyph of fragment.text) {
        if (glyph !== ' ') {
          drawGlyph(
            buffer,
            width,
            height,
            fragment.font,
            fragment.pixelScale,
            fragment.font.lookupGlyphCode(glyph),
            cursorX,
            glyphTop,
            fragment.textColor,
            clipRect,
          )
        }
        cursorX += fragment.font.advanceWidth * fragment.pixelScale
      }
    }
  }
}

const renderCaret = (
  buffer: Uint8Array,
  width: number,
  height: number,
  field: ResolvedFieldNode,
  fieldState: InternalFieldState,
  clipRect: Rect | null,
): void => {
  const layout = field.valueLayout
  const { lineIndex, line } = findLineForCaret(layout, fieldState.caret)
  const column = clamp(fieldState.caret - line.start, 0, line.width)
  const lineWidth = line.width * layout.advanceWidth
  const contentOriginY = field.kind === 'input'
    ? field.contentBox.y + Math.round((field.contentBox.height - layout.cellHeight) * 0.5)
    : field.contentBox.y
  const lineX = alignTextOriginX(field.contentBox, lineWidth, field.textAlign)
  const caretX = lineX + column * layout.advanceWidth
  const caretY = contentOriginY + lineIndex * layout.lineAdvance
  const blockCode = field.font.lookupGlyphCode('\u2588')
  drawGlyph(buffer, width, height, field.font, field.pixelScale, blockCode, caretX, caretY, field.caretColor, clipRect)
}

const renderNode = (
  buffer: Uint8Array,
  width: number,
  height: number,
  node: ResolvedNode,
  fields: Map<string, InternalFieldState>,
  focusedFieldId: string | null,
  caretVisible: boolean,
  parentClip: Rect | null,
): void => {
  const clipRect = node.clip ? intersectRect(parentClip ?? node.box, node.contentBox) : parentClip
  fillRect(buffer, width, height, node.box, node.backgroundColor, parentClip)
  strokeRect(buffer, width, height, node.box, node.borderWidth, node.borderColor, parentClip)

  if (node.kind === 'view') {
    if (node.gradient) {
      fillGradientRect(buffer, width, height, node.contentBox, node.gradient, parentClip)
    }
    [...node.children]
      .sort((left, right) => {
        if (left.zIndex !== right.zIndex) return left.zIndex - right.zIndex
        return left.nodeId.localeCompare(right.nodeId)
      })
      .forEach((child) => renderNode(buffer, width, height, child, fields, focusedFieldId, caretVisible, clipRect))
    return
  }

  if (node.kind === 'table') {
    [...node.children]
      .sort((left, right) => {
        if (left.zIndex !== right.zIndex) return left.zIndex - right.zIndex
        return left.nodeId.localeCompare(right.nodeId)
      })
      .forEach((child) => renderNode(buffer, width, height, child, fields, focusedFieldId, caretVisible, clipRect))
    return
  }

  if (node.kind === 'text') {
    const textClip = node.overflow !== 'visible'
      ? intersectRect(clipRect ?? node.contentBox, node.contentBox)
      : clipRect
    const textScrollOffset = node.overflow === 'scroll' ? node.scrollOffset : 0
    drawTextLayout(buffer, width, height, node.font, node.pixelScale, node.textLayout, node.contentBox, node.textAlign, node.textColor, textClip, textScrollOffset)
    return
  }

  if (node.kind === 'richText') {
    const richTextClip = node.overflow !== 'visible'
      ? intersectRect(clipRect ?? node.contentBox, node.contentBox)
      : clipRect
    const richTextScrollOffset = node.overflow === 'scroll' ? node.scrollOffset : 0
    drawRichTextLayout(buffer, width, height, node.richTextLayout, node.contentBox, node.textAlign, richTextClip, richTextScrollOffset)
    return
  }

  if (node.kind === 'rule') {
    const ruleRect = node.orientation === 'vertical'
      ? { x: node.contentBox.x, y: node.contentBox.y, width: node.thickness, height: node.contentBox.height }
      : { x: node.contentBox.x, y: node.contentBox.y, width: node.contentBox.width, height: node.thickness }
    fillRect(buffer, width, height, ruleRect, node.ruleColor, clipRect)
    return
  }

  if (node.kind === 'input' || node.kind === 'textarea') {
    drawTextLayout(
      buffer,
      width,
      height,
      node.font,
      node.pixelScale,
      node.renderLayout,
      {
        x: node.contentBox.x,
        y: node.kind === 'input'
          ? node.contentBox.y + Math.round((node.contentBox.height - node.renderLayout.cellHeight) * 0.5)
          : node.contentBox.y,
        width: node.contentBox.width,
        height: node.contentBox.height,
      },
      node.textAlign,
      node.showPlaceholder ? node.placeholderColor : node.textColor,
      clipRect,
    )
    if (caretVisible && focusedFieldId === node.fieldId) {
      const fieldState = fields.get(node.fieldId)
      if (fieldState) {
        renderCaret(
          buffer,
          width,
          height,
          node,
          fieldState,
          clipRect,
        )
      }
    }
    return
  }
}

class BitmapUiElementImpl implements BitmapUiElement {
  readonly id: string
  readonly texture: THREE.DataTexture

  private textureWidth: number
  private textureHeight: number
  private pixelBuffer: Uint8Array

  private font: BitmapUiFontAtlas
  private palette: BitmapUiPalette
  private document: BitmapUiDocument
  private pixelScale: number
  private defaultLineGap: number
  private logicalWidth: number
  private logicalHeight: number
  private readonly fields = new Map<string, InternalFieldState>()
  private fieldHits: FieldHit[] = []
  private interactionHits: InteractionHit[] = []
  private fieldOrder: string[] = []
  private lastResolvedRoot: ResolvedNode | null = null
  private focusedFieldId: string | null = null
  private hoveredInteractionId: string | null = null
  private pressedInteractionId: string | null = null
  private caretVisible = true
  private disposed = false
  private readonly dynamicRegions = new Map<string, DynamicRegionPainter>()
  private resolvedDynamicRects = new Map<string, DynamicRegionRect>()

  constructor(settings: BitmapUiElementSettings) {
    this.id = settings.id
    this.font = settings.font
    this.palette = settings.palette
    this.document = settings.document
    this.pixelScale = clamp(Math.round(settings.pixelScale ?? 1), 1, 8)
    this.defaultLineGap = Math.max(0, Math.round(settings.defaultLineGap ?? 0))
    this.logicalWidth = clamp(Math.round(settings.logicalWidth), 1, MAX_LOGICAL_TEXTURE_WIDTH)
    this.logicalHeight = clamp(Math.round(settings.logicalHeight), 1, MAX_LOGICAL_TEXTURE_HEIGHT)
    this.textureWidth = this.logicalWidth
    this.textureHeight = this.logicalHeight
    this.pixelBuffer = new Uint8Array(this.textureWidth * this.textureHeight * 4)
    this.texture = createDataTexture(this.pixelBuffer, this.textureWidth, this.textureHeight, `BitmapUiElement:${this.id}`)

    this.syncFieldsFromDocument()
    this.rebuild()
  }

  private resizeTexture(nextWidth: number, nextHeight: number): void {
    if (nextWidth === this.textureWidth && nextHeight === this.textureHeight) return
    this.textureWidth = nextWidth
    this.textureHeight = nextHeight
    this.pixelBuffer = new Uint8Array(this.textureWidth * this.textureHeight * 4)
    // WebGPU treats DataTexture size changes as a new allocation. Dispose the old
    // GPU backing texture before mutating the CPU image dimensions so the next
    // upload recreates it at the new size instead of writing past the old bounds.
    this.texture.dispose()
    this.texture.image.data = this.pixelBuffer
    this.texture.image.width = this.textureWidth
    this.texture.image.height = this.textureHeight
    this.texture.needsUpdate = true
  }

  private syncFieldsFromDocument(): void {
    const definitions = this.document.fields ?? {}
    const nextFieldIds = new Set(Object.keys(definitions))

    for (const [fieldId, definition] of Object.entries(definitions)) {
      const existing = this.fields.get(fieldId)
      if (existing && existing.type === definition.type) {
        existing.placeholder = definition.placeholder ?? existing.placeholder
        existing.maxLength = definition.maxLength ?? existing.maxLength
        if (existing.value.length === 0 && definition.value !== undefined) {
          existing.value = definition.value
          existing.caret = clamp(existing.caret, 0, existing.value.length)
        }
        continue
      }
      const value = definition.value ?? ''
      this.fields.set(fieldId, {
        type: definition.type,
        value,
        placeholder: definition.placeholder ?? '',
        maxLength: definition.maxLength ?? null,
        caret: value.length,
        preferredColumn: null,
      })
    }

    for (const fieldId of [...this.fields.keys()]) {
      if (!nextFieldIds.has(fieldId)) {
        this.fields.delete(fieldId)
        if (this.focusedFieldId === fieldId) {
          this.focusedFieldId = null
        }
      }
    }
  }

  private rebuild(): void {
    if (this.disposed) return
    this.pixelBuffer.fill(0)
    this.fieldHits = []
    this.interactionHits = []
    this.fieldOrder = []
    const backgroundColor = resolveDocumentBackgroundColor(this.document, this.palette)
    fillRect(
      this.pixelBuffer,
      this.textureWidth,
      this.textureHeight,
      { x: 0, y: 0, width: this.textureWidth, height: this.textureHeight },
      backgroundColor,
      null,
    )

    const layoutContext: MeasureContext = {
      defaultTextStyle: {
        font: this.font,
        pixelScale: this.pixelScale,
        lineGap: this.defaultLineGap,
        textAlign: 'start',
        tone: 'normal',
        color: null,
      },
      fields: this.fields,
      palette: this.palette,
    }
    const rootNode = layoutNode(
      this.document.root,
      {
        x: 0,
        y: 0,
        width: this.textureWidth,
        height: this.textureHeight,
      },
      layoutContext,
      this.palette,
      this.fieldHits,
      this.interactionHits,
      this.fieldOrder,
      { order: 0 },
      layoutContext.defaultTextStyle,
    )
    if (this.hoveredInteractionId && !this.interactionHits.some((hit) => hit.interactionId === this.hoveredInteractionId)) {
      this.hoveredInteractionId = null
    }
    if (this.pressedInteractionId && !this.interactionHits.some((hit) => hit.interactionId === this.pressedInteractionId)) {
      this.pressedInteractionId = null
    }
    this.lastResolvedRoot = rootNode
    renderNode(
      this.pixelBuffer,
      this.textureWidth,
      this.textureHeight,
      rootNode,
      this.fields,
      this.focusedFieldId,
      this.caretVisible,
      { x: 0, y: 0, width: this.textureWidth, height: this.textureHeight },
    )
    this.resolveDynamicRects(rootNode)
    this.paintDynamicRegions()
    this.texture.needsUpdate = true
  }

  exportSnapshot(): { readonly width: number; readonly height: number; readonly rgba: Uint8Array } {
    return {
      width: this.textureWidth,
      height: this.textureHeight,
      rgba: new Uint8Array(this.pixelBuffer),
    }
  }

  exportDebugSnapshot(): BitmapUiDebugSnapshot {
    if (!this.lastResolvedRoot) {
      this.rebuild()
    }
    const rootNode = this.lastResolvedRoot
    if (!rootNode) {
      throw new Error('Bitmap UI layout snapshot is unavailable.')
    }

    return {
      width: this.textureWidth,
      height: this.textureHeight,
      pixelScale: this.pixelScale,
      defaultLineGap: this.defaultLineGap,
      offsetX: 0,
      offsetY: 0,
      backgroundColor: cloneColor(resolveDocumentBackgroundColor(this.document, this.palette))!,
      focusedFieldId: this.focusedFieldId,
      hoveredInteractionId: this.hoveredInteractionId,
      pressedInteractionId: this.pressedInteractionId,
      caretVisible: this.caretVisible,
      font: cloneFont(this.font),
      fieldOrder: [...this.fieldOrder],
      fields: Object.fromEntries(
        [...this.fields.entries()].map(([fieldId, field]) => [fieldId, cloneFieldState(field)]),
      ),
      root: cloneResolvedNode(rootNode),
    }
  }

  setLogicalSize(size: { readonly logicalWidth: number; readonly logicalHeight: number }): void {
    this.logicalWidth = clamp(Math.round(size.logicalWidth), 1, MAX_LOGICAL_TEXTURE_WIDTH)
    this.logicalHeight = clamp(Math.round(size.logicalHeight), 1, MAX_LOGICAL_TEXTURE_HEIGHT)
    this.resizeTexture(this.logicalWidth, this.logicalHeight)
    this.rebuild()
  }

  setDocument(document: BitmapUiDocument): void {
    this.document = document
    this.syncFieldsFromDocument()
    this.rebuild()
  }

  setFont(font: BitmapUiFontAtlas): void {
    this.font = font
    this.rebuild()
  }

  setPalette(palette: BitmapUiPalette): void {
    this.palette = palette
    this.rebuild()
  }

  setPixelScale(pixelScale: number): void {
    this.pixelScale = clamp(Math.round(pixelScale), 1, 8)
    this.rebuild()
  }

  setDefaultLineGap(lineGap: number): void {
    this.defaultLineGap = Math.max(0, Math.round(lineGap))
    this.rebuild()
  }

  getTextureWidth(): number {
    return this.textureWidth
  }

  getTextureHeight(): number {
    return this.textureHeight
  }

  containsPoint(localX: number, localY: number): boolean {
    return localX >= 0 && localY >= 0 && localX < this.textureWidth && localY < this.textureHeight
  }

  getInteractionRole(interactionId: string): string | null {
    const hit = this.interactionHits.find((h) => h.interactionId === interactionId)
    return hit?.interactionRole ?? null
  }

  private buildPointerResult(consumed: boolean, localPosition: { readonly x: number; readonly y: number }, clickedInteractionId: string | null = null): BitmapUiPointerResult {
    return {
      focusedFieldId: this.focusedFieldId,
      hoveredInteractionId: this.hoveredInteractionId,
      pressedInteractionId: this.pressedInteractionId,
      clickedInteractionId,
      localX: localPosition.x,
      localY: localPosition.y,
      consumed,
    }
  }

  private updateHoveredInteraction(localPosition: { readonly x: number; readonly y: number } | null): boolean {
    const nextHoveredInteractionId = localPosition
      ? selectTopHit(this.interactionHits, localPosition)?.interactionId ?? null
      : null
    if (nextHoveredInteractionId === this.hoveredInteractionId) return false
    this.hoveredInteractionId = nextHoveredInteractionId
    return true
  }

  private focusField(fieldId: string | null): boolean {
    const normalizedFieldId = fieldId && this.fields.has(fieldId) ? fieldId : null
    if (normalizedFieldId === this.focusedFieldId) return false
    this.focusedFieldId = normalizedFieldId
    return true
  }

  private setCaretPositionFromPointer(fieldHit: FieldHit, localPosition: { readonly x: number; readonly y: number }): boolean {
    const fieldState = this.fields.get(fieldHit.fieldId)
    if (!fieldState) return false
    const previousCaret = fieldState.caret
    const previousPreferredColumn = fieldState.preferredColumn
    if (fieldState.type === 'input') {
      const line = fieldHit.valueLayout.lines[0] ?? { start: 0, end: 0, width: 0, text: '' }
      const lineWidth = line.width * fieldHit.valueLayout.advanceWidth
      const lineX = alignTextOriginX(fieldHit.contentBox, lineWidth, fieldHit.textAlign)
      const column = clamp(
        Math.round((localPosition.x - lineX) / Math.max(1, fieldHit.valueLayout.advanceWidth)),
        0,
        line.width,
      )
      fieldState.caret = line.start + column
      fieldState.preferredColumn = column
    } else {
      const relativeY = localPosition.y - fieldHit.contentBox.y
      const lineIndex = clamp(
        Math.floor(relativeY / Math.max(1, fieldHit.valueLayout.lineAdvance)),
        0,
        Math.max(0, fieldHit.valueLayout.lines.length - 1),
      )
      const line = fieldHit.valueLayout.lines[lineIndex] ?? fieldHit.valueLayout.lines[0] ?? { start: 0, end: 0, width: 0, text: '' }
      const lineWidth = line.width * fieldHit.valueLayout.advanceWidth
      const lineX = alignTextOriginX(fieldHit.contentBox, lineWidth, fieldHit.textAlign)
      const column = clamp(
        Math.round((localPosition.x - lineX) / Math.max(1, fieldHit.valueLayout.advanceWidth)),
        0,
        line.width,
      )
      fieldState.caret = line.start + column
      fieldState.preferredColumn = column
    }
    return fieldState.caret !== previousCaret || fieldState.preferredColumn !== previousPreferredColumn
  }

  // All pointer methods receive element-local coordinates (0,0 = top-left of
  // this element's bitmap). The atlas or surface handles the coordinate transform.
  handlePointerDown(position: { readonly x: number; readonly y: number }): BitmapUiPointerResult {
    const fieldHit = selectTopHit(this.fieldHits, position)
    this.updateHoveredInteraction(position)
    let didChange = false

    if (fieldHit) {
      didChange = this.focusField(fieldHit.fieldId) || didChange
      didChange = this.setCaretPositionFromPointer(fieldHit, position) || didChange
      didChange = this.pressedInteractionId !== null || didChange
      this.pressedInteractionId = null
      if (didChange) this.rebuild()
      return this.buildPointerResult(true, position)
    }

    const interactionHit = selectTopHit(this.interactionHits, position)
    const previousPressedInteractionId = this.pressedInteractionId
    this.pressedInteractionId = interactionHit?.interactionId ?? null
    didChange = this.pressedInteractionId !== previousPressedInteractionId || didChange
    if (didChange) this.rebuild()
    return this.buildPointerResult(Boolean(interactionHit), position)
  }

  handlePointerMove(position: { readonly x: number; readonly y: number }): BitmapUiPointerResult {
    this.updateHoveredInteraction(position)
    return this.buildPointerResult(Boolean(this.hoveredInteractionId || this.pressedInteractionId), position)
  }

  handlePointerUp(position: { readonly x: number; readonly y: number }): BitmapUiPointerResult {
    this.updateHoveredInteraction(position)
    const releasedInteractionId = this.pressedInteractionId
    const clickedInteractionId =
      releasedInteractionId && releasedInteractionId === this.hoveredInteractionId
        ? releasedInteractionId
        : null
    this.pressedInteractionId = null
    return this.buildPointerResult(Boolean(clickedInteractionId || this.hoveredInteractionId), position, clickedInteractionId)
  }

  handlePointerLeave(): BitmapUiPointerResult {
    this.hoveredInteractionId = null
    return this.buildPointerResult(Boolean(this.pressedInteractionId), { x: -1, y: -1 })
  }

  private cycleFocus(backward: boolean): boolean {
    if (this.fieldOrder.length === 0) return false
    const currentIndex = this.focusedFieldId ? this.fieldOrder.indexOf(this.focusedFieldId) : -1
    const nextIndex = currentIndex < 0
      ? (backward ? this.fieldOrder.length - 1 : 0)
      : (currentIndex + (backward ? -1 : 1) + this.fieldOrder.length) % this.fieldOrder.length
    this.focusedFieldId = this.fieldOrder[nextIndex] ?? null
    this.rebuild()
    return this.focusedFieldId !== null
  }

  private insertText(text: string): string | null {
    if (!this.focusedFieldId) return null
    const field = this.fields.get(this.focusedFieldId)
    if (!field) return null
    const sanitized = field.type === 'input' ? text.replace(/\r?\n/g, '') : text
    if (sanitized.length === 0) return null
    const nextValue = field.value.slice(0, field.caret) + sanitized + field.value.slice(field.caret)
    field.value = field.maxLength !== null ? nextValue.slice(0, field.maxLength) : nextValue
    field.caret = clamp(field.caret + sanitized.length, 0, field.value.length)
    field.preferredColumn = null
    this.rebuild()
    return this.focusedFieldId
  }

  private deleteBackward(): string | null {
    if (!this.focusedFieldId) return null
    const field = this.fields.get(this.focusedFieldId)
    if (!field || field.caret <= 0) return null
    field.value = field.value.slice(0, field.caret - 1) + field.value.slice(field.caret)
    field.caret -= 1
    field.preferredColumn = null
    this.rebuild()
    return this.focusedFieldId
  }

  private deleteForward(): string | null {
    if (!this.focusedFieldId) return null
    const field = this.fields.get(this.focusedFieldId)
    if (!field || field.caret >= field.value.length) return null
    field.value = field.value.slice(0, field.caret) + field.value.slice(field.caret + 1)
    field.preferredColumn = null
    this.rebuild()
    return this.focusedFieldId
  }

  private moveCaretHorizontal(delta: -1 | 1): boolean {
    if (!this.focusedFieldId) return false
    const field = this.fields.get(this.focusedFieldId)
    if (!field) return false
    const nextCaret = clamp(field.caret + delta, 0, field.value.length)
    if (nextCaret === field.caret) return false
    field.caret = nextCaret
    field.preferredColumn = null
    this.rebuild()
    return true
  }

  private moveCaretLineBoundary(toEnd: boolean): boolean {
    if (!this.focusedFieldId) return false
    const field = this.fields.get(this.focusedFieldId)
    if (!field) return false
    const hit = this.fieldHits.find((entry) => entry.fieldId === this.focusedFieldId)
    if (!hit) return false
    const { line } = findLineForCaret(hit.valueLayout, field.caret)
    const nextCaret = toEnd ? line.end : line.start
    if (nextCaret === field.caret) return false
    field.caret = nextCaret
    field.preferredColumn = null
    this.rebuild()
    return true
  }

  private moveCaretVertical(delta: -1 | 1): boolean {
    if (!this.focusedFieldId) return false
    const field = this.fields.get(this.focusedFieldId)
    if (!field || field.type !== 'textarea') return false
    const hit = this.fieldHits.find((entry) => entry.fieldId === this.focusedFieldId)
    if (!hit) return false
    const current = findLineForCaret(hit.valueLayout, field.caret)
    const nextLineIndex = clamp(current.lineIndex + delta, 0, Math.max(0, hit.valueLayout.lines.length - 1))
    const nextLine = hit.valueLayout.lines[nextLineIndex]
    if (!nextLine) return false
    const preferredColumn = field.preferredColumn ?? clamp(field.caret - current.line.start, 0, current.line.width)
    const nextCaret = clamp(nextLine.start + preferredColumn, nextLine.start, nextLine.end)
    if (nextCaret === field.caret) return false
    field.caret = nextCaret
    field.preferredColumn = preferredColumn
    this.rebuild()
    return true
  }

  handleKeyDown(input: BitmapUiKeyInput): BitmapUiKeyResult {
    if (input.metaKey || input.ctrlKey || input.altKey) {
      return {
        consumed: false,
        focusedFieldId: this.focusedFieldId,
        changedFieldId: null,
        submittedFieldId: null,
      }
    }
    switch (input.key) {
      case 'Tab':
        return {
          consumed: this.cycleFocus(Boolean(input.shiftKey)),
          focusedFieldId: this.focusedFieldId,
          changedFieldId: null,
          submittedFieldId: null,
        }
      case 'Backspace':
        {
          const changedFieldId = this.deleteBackward()
          return {
            consumed: changedFieldId !== null,
            focusedFieldId: this.focusedFieldId,
            changedFieldId,
            submittedFieldId: null,
          }
        }
      case 'Delete':
        {
          const changedFieldId = this.deleteForward()
          return {
            consumed: changedFieldId !== null,
            focusedFieldId: this.focusedFieldId,
            changedFieldId,
            submittedFieldId: null,
          }
        }
      case 'ArrowLeft':
        return {
          consumed: this.moveCaretHorizontal(-1),
          focusedFieldId: this.focusedFieldId,
          changedFieldId: null,
          submittedFieldId: null,
        }
      case 'ArrowRight':
        return {
          consumed: this.moveCaretHorizontal(1),
          focusedFieldId: this.focusedFieldId,
          changedFieldId: null,
          submittedFieldId: null,
        }
      case 'ArrowUp':
        return {
          consumed: this.moveCaretVertical(-1),
          focusedFieldId: this.focusedFieldId,
          changedFieldId: null,
          submittedFieldId: null,
        }
      case 'ArrowDown':
        return {
          consumed: this.moveCaretVertical(1),
          focusedFieldId: this.focusedFieldId,
          changedFieldId: null,
          submittedFieldId: null,
        }
      case 'Home':
        return {
          consumed: this.moveCaretLineBoundary(false),
          focusedFieldId: this.focusedFieldId,
          changedFieldId: null,
          submittedFieldId: null,
        }
      case 'End':
        return {
          consumed: this.moveCaretLineBoundary(true),
          focusedFieldId: this.focusedFieldId,
          changedFieldId: null,
          submittedFieldId: null,
        }
      case 'Escape': {
        const consumed = this.focusField(null)
        if (consumed) this.rebuild()
        return {
          consumed,
          focusedFieldId: this.focusedFieldId,
          changedFieldId: null,
          submittedFieldId: null,
        }
      }
      case 'Enter': {
        if (!this.focusedFieldId) {
          return {
            consumed: false,
            focusedFieldId: this.focusedFieldId,
            changedFieldId: null,
            submittedFieldId: null,
          }
        }
        const field = this.fields.get(this.focusedFieldId)
        if (!field) {
          return {
            consumed: false,
            focusedFieldId: this.focusedFieldId,
            changedFieldId: null,
            submittedFieldId: null,
          }
        }
        if (field.type === 'textarea') {
          const changedFieldId = this.insertText('\n')
          return {
            consumed: changedFieldId !== null,
            focusedFieldId: this.focusedFieldId,
            changedFieldId,
            submittedFieldId: null,
          }
        }
        return {
          consumed: true,
          focusedFieldId: this.focusedFieldId,
          changedFieldId: null,
          submittedFieldId: this.focusedFieldId,
        }
      }
      default:
        if (input.key.length === 1) {
          const changedFieldId = this.insertText(input.key)
          return {
            consumed: changedFieldId !== null,
            focusedFieldId: this.focusedFieldId,
            changedFieldId,
            submittedFieldId: null,
          }
        }
        return {
          consumed: false,
          focusedFieldId: this.focusedFieldId,
          changedFieldId: null,
          submittedFieldId: null,
        }
    }
  }

  getFocusedFieldId(): string | null {
    return this.focusedFieldId
  }

  getHoveredInteractionId(): string | null {
    return this.hoveredInteractionId
  }

  getPressedInteractionId(): string | null {
    return this.pressedInteractionId
  }

  getFieldState(fieldId: string): BitmapUiFieldState | null {
    const field = this.fields.get(fieldId)
    return field ? cloneFieldState(field) : null
  }

  setFieldValue(fieldId: string, value: string, options: BitmapUiSetFieldValueOptions = {}): boolean {
    const field = this.fields.get(fieldId)
    if (!field) return false
    const sanitizedValue = field.type === 'input' ? value.replace(/\r?\n/g, '') : value
    const previousValue = field.value
    const nextValue = field.maxLength !== null ? sanitizedValue.slice(0, field.maxLength) : sanitizedValue
    const caretOption = options.caret ?? 'end'
    const nextCaret =
      caretOption === 'preserve'
        ? clamp(field.caret, 0, nextValue.length)
        : caretOption === 'start'
          ? 0
          : caretOption === 'end'
            ? nextValue.length
            : clamp(Math.round(caretOption), 0, nextValue.length)
    const didChange = previousValue !== nextValue || field.caret !== nextCaret
    field.value = nextValue
    field.caret = nextCaret
    field.preferredColumn = null
    if (didChange) this.rebuild()
    return didChange
  }

  setFocusedFieldId(fieldId: string | null): boolean {
    const didChange = this.focusField(fieldId)
    if (didChange) this.rebuild()
    return didChange
  }

  setCaretVisible(visible: boolean): void {
    if (this.caretVisible === visible) return
    this.caretVisible = visible
    this.rebuild()
  }

  registerDynamicRegion(nodeId: string, painter: DynamicRegionPainter): void {
    this.dynamicRegions.set(nodeId, painter)
  }

  unregisterDynamicRegion(nodeId: string): void {
    this.dynamicRegions.delete(nodeId)
    this.resolvedDynamicRects.delete(nodeId)
  }

  rebuildDynamic(): void {
    if (this.disposed || this.dynamicRegions.size === 0) return
    this.paintDynamicRegions()
    this.texture.needsUpdate = true
  }

  private resolveDynamicRects(root: ResolvedNode): void {
    this.resolvedDynamicRects.clear()
    if (this.dynamicRegions.size === 0) return
    const walk = (node: ResolvedNode): void => {
      if (this.dynamicRegions.has(node.nodeId)) {
        const cb = node.contentBox
        this.resolvedDynamicRects.set(node.nodeId, { x: cb.x, y: cb.y, width: cb.width, height: cb.height })
      }
      if (node.kind === 'view' || node.kind === 'table') {
        for (const child of node.children) walk(child)
      }
    }
    walk(root)
  }

  private paintDynamicRegions(): void {
    for (const [nodeId, painter] of this.dynamicRegions) {
      const rect = this.resolvedDynamicRects.get(nodeId)
      if (!rect) continue
      painter(this.pixelBuffer, this.textureWidth, this.textureHeight, rect)
    }
  }

  getNodeRect(nodeId: string): { x: number; y: number; width: number; height: number } | null {
    if (!this.lastResolvedRoot) return null
    const walk = (node: ResolvedNode): { x: number; y: number; width: number; height: number } | null => {
      if (node.nodeId === nodeId) {
        const cb = node.contentBox
        return { x: cb.x, y: cb.y, width: cb.width, height: cb.height }
      }
      if (node.kind === 'view' || node.kind === 'table') {
        for (const child of node.children) {
          const found = walk(child)
          if (found) return found
        }
      }
      return null
    }
    return walk(this.lastResolvedRoot)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.texture.dispose()
  }
}

export const createBitmapUiElement = (settings: BitmapUiElementSettings): BitmapUiElement => {
  return new BitmapUiElementImpl(settings)
}

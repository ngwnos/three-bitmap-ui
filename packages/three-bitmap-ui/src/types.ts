import * as THREE from 'three'

export type BitmapUiLength = number | 'content' | 'fill'
export type BitmapUiDirection = 'row' | 'column'
export type BitmapUiAlign = 'start' | 'center' | 'end' | 'stretch'
export type BitmapUiJustify = 'start' | 'center' | 'end'
export type BitmapUiTextAlign = 'start' | 'center' | 'end'
export type BitmapUiTone = 'normal' | 'dim' | 'accent'
export type BitmapUiInteractionBounds = 'box' | 'content'
export type BitmapUiOverflow = 'visible' | 'clip' | 'scroll'
export type BitmapUiDitherMode = 'bayer4x4' | 'bayer2x2' | 'bluenoise' | 'none' | 'smooth'
export type BitmapUiFrequencyAnalyzerColorMode = 'height' | 'frequency' | 'magnitude'
export type BitmapUiColorLike =
  | string
  | THREE.ColorRepresentation
  | {
      readonly r: number
      readonly g: number
      readonly b: number
      readonly a?: number
    }

export type BitmapUiFontAtlas = {
  readonly id: string
  readonly label: string
  readonly cellWidth: number
  readonly cellHeight: number
  readonly advanceWidth: number
  readonly lineAdvance: number
  readonly ascent: number
  readonly descent: number
  readonly internalLeading: number
  readonly externalLeading: number
  readonly firstCode: number
  readonly glyphCount: number
  readonly defaultCode: number
  readonly atlasColumns: number
  readonly atlasRows: number
  readonly atlasWidth: number
  readonly atlasHeight: number
  readonly atlasData: Uint8Array
  readonly lookupGlyphCode: (glyph: string) => number
}

export type BitmapUiPalette = {
  readonly background: BitmapUiColorLike
  readonly panelFill: BitmapUiColorLike
  readonly panelBorder: BitmapUiColorLike
  readonly chromeFill: BitmapUiColorLike
  readonly chromeBorder: BitmapUiColorLike
  readonly inputFill: BitmapUiColorLike
  readonly inputBorder: BitmapUiColorLike
  readonly selectionFill: BitmapUiColorLike
  readonly caret: BitmapUiColorLike
  readonly normalText: BitmapUiColorLike
  readonly accentText: BitmapUiColorLike
  readonly dimOpacity: number
}

export type BitmapUiTextStyle = {
  readonly font?: BitmapUiFontAtlas
  readonly pixelScale?: number
  readonly lineGap?: number
  readonly textAlign?: BitmapUiTextAlign
  readonly tone?: BitmapUiTone
  readonly color?: BitmapUiColorLike | null
}

export type BitmapUiRichTextRun = {
  readonly text: string
  readonly font?: BitmapUiFontAtlas
  readonly pixelScale?: number
  readonly tone?: BitmapUiTone
  readonly color?: BitmapUiColorLike | null
  readonly backgroundColor?: BitmapUiColorLike | null
}

export type BitmapUiRuleOrientation = 'horizontal' | 'vertical'

export type BitmapUiInteraction = {
  readonly id: string
  readonly role?: string
  readonly bounds?: BitmapUiInteractionBounds
}

type BitmapUiNodeBase = {
  readonly id: string
  readonly position?: 'flow' | 'absolute'
  readonly x?: number
  readonly y?: number
  readonly zIndex?: number
  readonly width?: BitmapUiLength
  readonly height?: BitmapUiLength
  readonly minWidth?: number
  readonly minHeight?: number
  readonly maxWidth?: number
  readonly maxHeight?: number
  readonly padding?: number
  readonly backgroundColor?: BitmapUiColorLike | null
  readonly borderColor?: BitmapUiColorLike | null
  readonly borderWidth?: number
  readonly clip?: boolean
  readonly textStyle?: BitmapUiTextStyle
  readonly interaction?: BitmapUiInteraction
}

export type BitmapUiGradientDef = {
  readonly colors: readonly (readonly [number, number, number])[]
  readonly type: 'linear' | 'radial' | 'conical' | 'diamond'
  readonly angle?: number
  readonly centerX?: number
  readonly centerY?: number
  readonly dither?: BitmapUiDitherMode
  readonly ditherStrength?: number
  readonly mirror?: boolean
  readonly referenceRect?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  readonly animatedDither?: boolean
}

export type BitmapUiViewNode = BitmapUiNodeBase & {
  readonly kind: 'view'
  readonly direction: BitmapUiDirection
  readonly gap?: number
  readonly align?: BitmapUiAlign
  readonly justify?: BitmapUiJustify
  readonly scrollX?: number
  readonly scrollY?: number
  readonly gradient?: BitmapUiGradientDef
  readonly children: readonly BitmapUiNode[]
}

export type BitmapUiTextNode = BitmapUiNodeBase & {
  readonly kind: 'text'
  readonly text: string
  readonly wrap?: boolean
  readonly textAlign?: BitmapUiTextAlign
  readonly tone?: BitmapUiTone
  readonly color?: BitmapUiColorLike | null
  readonly lineGap?: number
  readonly overflow?: BitmapUiOverflow
  readonly scrollOffset?: number
}

export type BitmapUiRichTextNode = BitmapUiNodeBase & {
  readonly kind: 'richText'
  readonly runs: readonly BitmapUiRichTextRun[]
  readonly wrap?: boolean
  readonly textAlign?: BitmapUiTextAlign
  readonly lineGap?: number
  readonly overflow?: BitmapUiOverflow
  readonly scrollOffset?: number
}

export type BitmapUiInputNode = BitmapUiNodeBase & {
  readonly kind: 'input'
  readonly fieldId: string
  readonly textAlign?: BitmapUiTextAlign
  readonly tone?: BitmapUiTone
  readonly color?: BitmapUiColorLike | null
  readonly placeholderColor?: BitmapUiColorLike | null
  readonly caretColor?: BitmapUiColorLike | null
}

export type BitmapUiTextareaNode = BitmapUiNodeBase & {
  readonly kind: 'textarea'
  readonly fieldId: string
  readonly textAlign?: BitmapUiTextAlign
  readonly tone?: BitmapUiTone
  readonly color?: BitmapUiColorLike | null
  readonly lineGap?: number
  readonly placeholderColor?: BitmapUiColorLike | null
  readonly caretColor?: BitmapUiColorLike | null
}

export type BitmapUiSpacerNode = BitmapUiNodeBase & {
  readonly kind: 'spacer'
  readonly flex?: number
}

export type BitmapUiRuleNode = BitmapUiNodeBase & {
  readonly kind: 'rule'
  readonly orientation?: BitmapUiRuleOrientation
  readonly thickness?: number
  readonly color?: BitmapUiColorLike | null
}

export type BitmapUiTableColumn = {
  readonly id: string
  readonly width?: BitmapUiLength
  readonly minWidth?: number
  readonly maxWidth?: number
  readonly textAlign?: BitmapUiTextAlign
  readonly textStyle?: BitmapUiTextStyle
}

export type BitmapUiTableCell = {
  readonly text?: string
  readonly runs?: readonly BitmapUiRichTextRun[]
  readonly wrap?: boolean
  readonly textAlign?: BitmapUiTextAlign
  readonly tone?: BitmapUiTone
  readonly color?: BitmapUiColorLike | null
  readonly backgroundColor?: BitmapUiColorLike | null
  readonly borderColor?: BitmapUiColorLike | null
  readonly textStyle?: BitmapUiTextStyle
}

export type BitmapUiTableRow = {
  readonly id: string
  readonly cells: Readonly<Record<string, BitmapUiTableCell | undefined>>
  readonly height?: BitmapUiLength
  readonly backgroundColor?: BitmapUiColorLike | null
  readonly borderColor?: BitmapUiColorLike | null
}

export type BitmapUiTableNode = BitmapUiNodeBase & {
  readonly kind: 'table'
  readonly columns: readonly BitmapUiTableColumn[]
  readonly rows: readonly BitmapUiTableRow[]
  readonly headerRow?: BitmapUiTableRow | null
  readonly columnGap?: number
  readonly rowGap?: number
}

export type BitmapUiFrequencyAnalyzerNode = BitmapUiNodeBase & {
  readonly kind: 'frequencyAnalyzer'
  readonly spectrum?: ArrayLike<number>
  readonly getSpectrum?: (binCount: number) => ArrayLike<number>
  readonly binWidth?: number
  readonly gap?: number
  readonly colorMode?: BitmapUiFrequencyAnalyzerColorMode
  readonly gradientColors?: readonly (readonly [number, number, number])[]
  readonly dither?: BitmapUiDitherMode
  readonly minBarHeight?: number
  readonly minMagnitude?: number
}

export type BitmapUiNode =
  | BitmapUiViewNode
  | BitmapUiTextNode
  | BitmapUiRichTextNode
  | BitmapUiInputNode
  | BitmapUiTextareaNode
  | BitmapUiSpacerNode
  | BitmapUiRuleNode
  | BitmapUiTableNode
  | BitmapUiFrequencyAnalyzerNode

export type BitmapUiFieldType = 'input' | 'textarea'

export type BitmapUiFieldDefinition = {
  readonly type: BitmapUiFieldType
  readonly value?: string
  readonly placeholder?: string
  readonly maxLength?: number
}

export type BitmapUiFieldState = {
  readonly type: BitmapUiFieldType
  readonly value: string
  readonly placeholder: string
  readonly maxLength: number | null
  readonly caret: number
  readonly preferredColumn: number | null
}

export type BitmapUiDocument = {
  readonly backgroundColor?: BitmapUiColorLike | null
  readonly root: BitmapUiNode
  readonly fields?: Readonly<Record<string, BitmapUiFieldDefinition>>
}

export type BitmapUiPointerResult = {
  readonly focusedFieldId: string | null
  readonly hoveredInteractionId: string | null
  readonly pressedInteractionId: string | null
  readonly clickedInteractionId: string | null
  readonly localX: number
  readonly localY: number
  readonly consumed: boolean
}

export type BitmapUiKeyInput = {
  readonly key: string
  readonly shiftKey?: boolean
  readonly ctrlKey?: boolean
  readonly altKey?: boolean
  readonly metaKey?: boolean
}

export type BitmapUiKeyResult = {
  readonly consumed: boolean
  readonly focusedFieldId: string | null
  readonly changedFieldId: string | null
  readonly submittedFieldId: string | null
}

export type BitmapUiSetFieldValueOptions = {
  readonly caret?: number | 'start' | 'end' | 'preserve'
}

export type BitmapUiSurfaceSettings = {
  readonly font: BitmapUiFontAtlas
  readonly palette: BitmapUiPalette
  readonly document: BitmapUiDocument
  readonly logicalWidth: number
  readonly logicalHeight: number
  readonly pixelScale?: number
  readonly defaultLineGap?: number
  readonly offsetX?: number
  readonly offsetY?: number
}

export type DynamicRegionRect = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type DynamicRegionPainter = (
  buffer: Uint8Array,
  bufferWidth: number,
  bufferHeight: number,
  region: DynamicRegionRect,
) => void

export type BitmapUiDebugRect = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type BitmapUiDebugColor = {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly a: number
}

export type BitmapUiDebugLine = {
  readonly text: string
  readonly start: number
  readonly end: number
  readonly width: number
}

export type BitmapUiDebugTextLayout = {
  readonly lines: readonly BitmapUiDebugLine[]
  readonly contentWidth: number
  readonly contentHeight: number
  readonly lineAdvance: number
  readonly cellHeight: number
  readonly advanceWidth: number
}

export type BitmapUiDebugRichTextFragment = {
  readonly text: string
  readonly x: number
  readonly width: number
  readonly font: BitmapUiDebugFont
  readonly pixelScale: number
  readonly ascent: number
  readonly descent: number
  readonly textColor: BitmapUiDebugColor
  readonly backgroundColor: BitmapUiDebugColor | null
}

export type BitmapUiDebugRichTextLine = {
  readonly width: number
  readonly ascent: number
  readonly descent: number
  readonly baseline: number
  readonly fragments: readonly BitmapUiDebugRichTextFragment[]
}

export type BitmapUiDebugRichTextLayout = {
  readonly lines: readonly BitmapUiDebugRichTextLine[]
  readonly contentWidth: number
  readonly contentHeight: number
}

export type BitmapUiDebugFieldState = BitmapUiFieldState

export type BitmapUiDebugFont = {
  readonly id: string
  readonly label: string
  readonly cellWidth: number
  readonly cellHeight: number
  readonly advanceWidth: number
  readonly lineAdvance: number
  readonly ascent: number
  readonly descent: number
  readonly internalLeading: number
  readonly externalLeading: number
  readonly firstCode: number
  readonly glyphCount: number
  readonly defaultCode: number
  readonly atlasColumns: number
  readonly atlasRows: number
  readonly atlasWidth: number
  readonly atlasHeight: number
}

type BitmapUiDebugNodeBase = {
  readonly kind: BitmapUiNode['kind']
  readonly nodeId: string
  readonly zIndex: number
  readonly box: BitmapUiDebugRect
  readonly contentBox: BitmapUiDebugRect
  readonly backgroundColor: BitmapUiDebugColor | null
  readonly borderColor: BitmapUiDebugColor | null
  readonly borderWidth: number
  readonly clip: boolean
  readonly interactionId: string | null
  readonly interactionRole: string | null
}

export type BitmapUiDebugViewNode = BitmapUiDebugNodeBase & {
  readonly kind: 'view'
  readonly children: readonly BitmapUiDebugNode[]
}

export type BitmapUiDebugTextNode = BitmapUiDebugNodeBase & {
  readonly kind: 'text'
  readonly text: string
  readonly font: BitmapUiDebugFont
  readonly pixelScale: number
  readonly lineGap: number
  readonly textLayout: BitmapUiDebugTextLayout
  readonly textAlign: BitmapUiTextAlign
  readonly textColor: BitmapUiDebugColor
  readonly overflow: BitmapUiOverflow
  readonly scrollOffset: number
}

export type BitmapUiDebugRichTextNode = BitmapUiDebugNodeBase & {
  readonly kind: 'richText'
  readonly text: string
  readonly lineGap: number
  readonly textAlign: BitmapUiTextAlign
  readonly richTextLayout: BitmapUiDebugRichTextLayout
  readonly overflow: BitmapUiOverflow
  readonly scrollOffset: number
}

export type BitmapUiDebugFieldNode = BitmapUiDebugNodeBase & {
  readonly kind: 'input' | 'textarea'
  readonly fieldId: string
  readonly fieldType: BitmapUiFieldType
  readonly font: BitmapUiDebugFont
  readonly pixelScale: number
  readonly lineGap: number
  readonly textAlign: BitmapUiTextAlign
  readonly textColor: BitmapUiDebugColor
  readonly placeholderColor: BitmapUiDebugColor
  readonly caretColor: BitmapUiDebugColor
  readonly valueLayout: BitmapUiDebugTextLayout
  readonly renderLayout: BitmapUiDebugTextLayout
  readonly showPlaceholder: boolean
}

export type BitmapUiDebugSpacerNode = BitmapUiDebugNodeBase & {
  readonly kind: 'spacer'
}

export type BitmapUiDebugRuleNode = BitmapUiDebugNodeBase & {
  readonly kind: 'rule'
  readonly orientation: BitmapUiRuleOrientation
  readonly thickness: number
  readonly ruleColor: BitmapUiDebugColor | null
}

export type BitmapUiDebugTableColumn = {
  readonly id: string
  readonly width: number
  readonly textAlign: BitmapUiTextAlign
}

export type BitmapUiDebugTableNode = BitmapUiDebugNodeBase & {
  readonly kind: 'table'
  readonly columns: readonly BitmapUiDebugTableColumn[]
  readonly rowCount: number
  readonly headerRowId: string | null
  readonly children: readonly BitmapUiDebugNode[]
}

export type BitmapUiDebugFrequencyAnalyzerNode = BitmapUiDebugNodeBase & {
  readonly kind: 'frequencyAnalyzer'
  readonly binWidth: number
  readonly gap: number
  readonly colorMode: BitmapUiFrequencyAnalyzerColorMode
  readonly gradientStopCount: number
  readonly dither: BitmapUiDitherMode
  readonly minBarHeight: number
  readonly minMagnitude: number
  readonly spectrumLength: number
  readonly hasSpectrumSource: boolean
}

export type BitmapUiDebugNode =
  | BitmapUiDebugViewNode
  | BitmapUiDebugTextNode
  | BitmapUiDebugRichTextNode
  | BitmapUiDebugFieldNode
  | BitmapUiDebugSpacerNode
  | BitmapUiDebugRuleNode
  | BitmapUiDebugTableNode
  | BitmapUiDebugFrequencyAnalyzerNode

export type BitmapUiDebugSnapshot = {
  readonly width: number
  readonly height: number
  readonly pixelScale: number
  readonly defaultLineGap: number
  readonly offsetX: number
  readonly offsetY: number
  readonly backgroundColor: BitmapUiDebugColor
  readonly focusedFieldId: string | null
  readonly hoveredInteractionId: string | null
  readonly pressedInteractionId: string | null
  readonly caretVisible: boolean
  readonly font: BitmapUiDebugFont
  readonly fieldOrder: readonly string[]
  readonly fields: Readonly<Record<string, BitmapUiDebugFieldState>>
  readonly root: BitmapUiDebugNode
}

/**
 * Standalone definition of a bitmap UI element. Each element lives in its
 * own file and can be rendered by the CLI script or used in the app.
 */
export type BitmapUiElementDef<S = Record<string, never>> = {
  readonly id: string
  readonly logicalWidth: number
  readonly logicalHeight: number
  readonly defaultState: S
  readonly buildDocument: (state: S) => BitmapUiDocument
}

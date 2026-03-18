const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))
import type {
  BitmapUiColorLike,
  BitmapUiDebugLine,
  BitmapUiDebugRect,
  BitmapUiFontAtlas,
  BitmapUiNode,
  BitmapUiRichTextRun,
  BitmapUiTextAlign,
  BitmapUiTextStyle,
  BitmapUiTone,
} from './types'

export type Rect = BitmapUiDebugRect
export type WrappedLine = BitmapUiDebugLine

export type TextLayout = {
  readonly lines: readonly WrappedLine[]
  readonly contentWidth: number
  readonly contentHeight: number
  readonly lineAdvance: number
  readonly cellHeight: number
  readonly advanceWidth: number
}

export type ResolvedTextStyle = {
  readonly font: BitmapUiFontAtlas
  readonly pixelScale: number
  readonly lineGap: number
  readonly textAlign: BitmapUiTextAlign
  readonly tone: BitmapUiTone
  readonly color: BitmapUiColorLike | null
}

export type ResolvedRichTextRunStyle = ResolvedTextStyle & {
  readonly backgroundColor: BitmapUiColorLike | null
}

export type RichTextFragmentLayout = {
  readonly text: string
  readonly x: number
  readonly width: number
  readonly font: BitmapUiFontAtlas
  readonly pixelScale: number
  readonly ascent: number
  readonly descent: number
  readonly tone: BitmapUiTone
  readonly color: BitmapUiColorLike | null
  readonly backgroundColor: BitmapUiColorLike | null
}

export type RichTextLineLayout = {
  readonly width: number
  readonly ascent: number
  readonly descent: number
  readonly baseline: number
  readonly fragments: readonly RichTextFragmentLayout[]
}

export type RichTextLayout = {
  readonly lines: readonly RichTextLineLayout[]
  readonly contentWidth: number
  readonly contentHeight: number
}

type GlyphAtom = {
  readonly text: string
  readonly width: number
  readonly ascent: number
  readonly descent: number
  readonly lineAdvance: number
  readonly style: ResolvedRichTextRunStyle
}

const clampPixelScale = (value: number | undefined, fallback: number): number => {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return clamp(Math.round(value), 1, 8)
}

export const resolveInheritedTextStyle = (
  inherited: ResolvedTextStyle,
  override: BitmapUiTextStyle | undefined,
): ResolvedTextStyle => {
  if (!override) return inherited
  return {
    font: override.font ?? inherited.font,
    pixelScale: clampPixelScale(override.pixelScale, inherited.pixelScale),
    lineGap: override.lineGap === undefined ? inherited.lineGap : Math.max(0, Math.round(override.lineGap)),
    textAlign: override.textAlign ?? inherited.textAlign,
    tone: override.tone ?? inherited.tone,
    color: override.color === undefined ? inherited.color : override.color,
  }
}

export const resolveRenderableTextStyle = (
  node: BitmapUiNode,
  inherited: ResolvedTextStyle,
): ResolvedTextStyle => {
  let style = resolveInheritedTextStyle(inherited, node.textStyle)

  if ('textAlign' in node && node.textAlign !== undefined) {
    style = { ...style, textAlign: node.textAlign }
  }
  if ('tone' in node && node.tone !== undefined) {
    style = { ...style, tone: node.tone }
  }
  if ('color' in node && node.color !== undefined) {
    style = { ...style, color: node.color }
  }
  if ('lineGap' in node && node.lineGap !== undefined) {
    style = { ...style, lineGap: Math.max(0, Math.round(node.lineGap)) }
  }

  return style
}

export const resolveRichTextRunStyle = (
  inherited: ResolvedTextStyle,
  run: BitmapUiRichTextRun,
): ResolvedRichTextRunStyle => {
  return {
    font: run.font ?? inherited.font,
    pixelScale: clampPixelScale(run.pixelScale, inherited.pixelScale),
    lineGap: inherited.lineGap,
    textAlign: inherited.textAlign,
    tone: run.tone ?? inherited.tone,
    color: run.color === undefined ? inherited.color : run.color,
    backgroundColor: run.backgroundColor ?? null,
  }
}

const splitWrappedLines = (text: string, wrap: boolean, maxColumns: number): WrappedLine[] => {
  const safeMaxColumns = Math.max(1, maxColumns)
  const lines: WrappedLine[] = []
  const pushLine = (start: number, end: number): void => {
    const safeStart = clamp(start, 0, text.length)
    const safeEnd = clamp(end, safeStart, text.length)
    lines.push({
      text: text.slice(safeStart, safeEnd),
      start: safeStart,
      end: safeEnd,
      width: safeEnd - safeStart,
    })
  }

  let lineStart = 0
  let cursor = 0
  let column = 0
  let lastBreak = -1

  while (cursor < text.length) {
    const character = text[cursor]
    if (character === '\r') {
      cursor += 1
      continue
    }
    if (character === '\n') {
      pushLine(lineStart, cursor)
      cursor += 1
      lineStart = cursor
      column = 0
      lastBreak = -1
      continue
    }

    column += 1
    if (character === ' ' || character === '\t') {
      lastBreak = cursor
    }

    if (wrap && column > safeMaxColumns) {
      if (lastBreak >= lineStart) {
        pushLine(lineStart, lastBreak)
        cursor = lastBreak + 1
      } else {
        pushLine(lineStart, cursor)
      }
      lineStart = cursor
      column = 0
      lastBreak = -1
      continue
    }

    cursor += 1
  }

  if (lineStart <= text.length) {
    pushLine(lineStart, text.length)
  }

  if (lines.length === 0) {
    lines.push({ text: '', start: 0, end: 0, width: 0 })
  }

  return lines
}

export const createTextLayout = (
  text: string,
  wrap: boolean,
  availableWidth: number,
  font: BitmapUiFontAtlas,
  pixelScale: number,
  lineGap: number,
): TextLayout => {
  const scaledAdvanceWidth = Math.max(1, font.advanceWidth * pixelScale)
  const scaledCellHeight = Math.max(1, font.cellHeight * pixelScale)
  const scaledLineAdvance = Math.max(1, font.lineAdvance * pixelScale + lineGap)
  const maxColumns = Number.isFinite(availableWidth)
    ? Math.max(1, Math.floor(Math.max(availableWidth, scaledAdvanceWidth) / scaledAdvanceWidth))
    : Number.POSITIVE_INFINITY
  const lines = splitWrappedLines(text, wrap && Number.isFinite(maxColumns), Number.isFinite(maxColumns) ? maxColumns : 1_000_000)
  const contentWidth = lines.reduce((maxValue, line) => Math.max(maxValue, line.width * scaledAdvanceWidth), 0)
  const contentHeight = scaledCellHeight + Math.max(0, lines.length - 1) * scaledLineAdvance
  return {
    lines,
    contentWidth,
    contentHeight,
    lineAdvance: scaledLineAdvance,
    cellHeight: scaledCellHeight,
    advanceWidth: scaledAdvanceWidth,
  }
}

const createGlyphAtom = (character: string, style: ResolvedRichTextRunStyle): GlyphAtom => {
  const pixelScale = style.pixelScale
  const ascent = Math.max(1, style.font.ascent * pixelScale)
  const descent = Math.max(0, style.font.descent * pixelScale)
  const lineAdvance = Math.max(1, style.font.lineAdvance * pixelScale + style.lineGap)
  return {
    text: character,
    width: Math.max(1, style.font.advanceWidth * pixelScale),
    ascent,
    descent,
    lineAdvance,
    style,
  }
}

const buildRichTextLines = (
  runs: readonly BitmapUiRichTextRun[],
  wrap: boolean,
  availableWidth: number,
  inheritedStyle: ResolvedTextStyle,
): readonly GlyphAtom[][] => {
  const maxWidth = Number.isFinite(availableWidth) ? Math.max(1, availableWidth) : Number.POSITIVE_INFINITY
  const lines: GlyphAtom[][] = []
  let currentLine: GlyphAtom[] = []
  let currentWidth = 0
  let lastBreakIndex = -1

  const pushCurrentLine = (): void => {
    lines.push(currentLine)
    currentLine = []
    currentWidth = 0
    lastBreakIndex = -1
  }

  for (const run of runs) {
    const style = resolveRichTextRunStyle(inheritedStyle, run)
    for (const character of run.text) {
      if (character === '\r') continue
      if (character === '\n') {
        pushCurrentLine()
        continue
      }

      const atom = createGlyphAtom(character, style)
      currentLine.push(atom)
      currentWidth += atom.width
      if (character === ' ' || character === '\t') {
        lastBreakIndex = currentLine.length - 1
      }

      if (!wrap || !Number.isFinite(maxWidth) || currentWidth <= maxWidth) continue

      if (lastBreakIndex >= 0) {
        const overflowLine = currentLine.slice(0, lastBreakIndex)
        lines.push(overflowLine)
        currentLine = currentLine.slice(lastBreakIndex + 1).filter((item) => item.text !== ' ' && item.text !== '\t')
      } else if (currentLine.length > 1) {
        const overflowLine = currentLine.slice(0, -1)
        lines.push(overflowLine)
        currentLine = currentLine.slice(-1)
      }

      currentWidth = currentLine.reduce((sum, item) => sum + item.width, 0)
      lastBreakIndex = -1
      currentLine.forEach((item, index) => {
        if (item.text === ' ' || item.text === '\t') {
          lastBreakIndex = index
        }
      })
    }
  }

  if (lines.length === 0 || currentLine.length > 0) {
    lines.push(currentLine)
  }

  return lines
}

const sameRunStyle = (left: ResolvedRichTextRunStyle, right: ResolvedRichTextRunStyle): boolean => {
  return left.font.id === right.font.id &&
    left.pixelScale === right.pixelScale &&
    left.tone === right.tone &&
    left.color === right.color &&
    left.backgroundColor === right.backgroundColor
}

export const createRichTextLayout = (
  runs: readonly BitmapUiRichTextRun[],
  wrap: boolean,
  availableWidth: number,
  inheritedStyle: ResolvedTextStyle,
): RichTextLayout => {
  const normalizedRuns = runs.length > 0 ? runs : [{ text: '' }]
  const rawLines = buildRichTextLines(normalizedRuns, wrap, availableWidth, inheritedStyle)
  const fallbackStyle = resolveRichTextRunStyle(inheritedStyle, { text: '' })
  let baseline = 0
  let contentWidth = 0
  const lines: RichTextLineLayout[] = rawLines.map((lineAtoms, lineIndex) => {
    const atoms = lineAtoms.length > 0 ? lineAtoms : [createGlyphAtom('', fallbackStyle)]
    const lineWidth = atoms.reduce((sum, atom) => sum + atom.width, 0)
    const lineAscent = atoms.reduce((maxValue, atom) => Math.max(maxValue, atom.ascent), 0)
    const lineDescent = atoms.reduce((maxValue, atom) => Math.max(maxValue, atom.descent), 0)
    const lineAdvance = atoms.reduce((maxValue, atom) => Math.max(maxValue, atom.lineAdvance), 0)
    baseline = lineIndex === 0 ? lineAscent : baseline + lineAdvance
    contentWidth = Math.max(contentWidth, lineWidth)

    const fragments: RichTextFragmentLayout[] = []
    let fragmentX = 0
    for (const atom of atoms) {
      const lastFragment = fragments[fragments.length - 1]
      if (lastFragment && sameRunStyle(
        {
          font: lastFragment.font,
          pixelScale: lastFragment.pixelScale,
          lineGap: inheritedStyle.lineGap,
          textAlign: inheritedStyle.textAlign,
          tone: lastFragment.tone,
          color: lastFragment.color,
          backgroundColor: lastFragment.backgroundColor,
        },
        atom.style,
      )) {
        fragments[fragments.length - 1] = {
          ...lastFragment,
          text: `${lastFragment.text}${atom.text}`,
          width: lastFragment.width + atom.width,
        }
      } else {
        fragments.push({
          text: atom.text,
          x: fragmentX,
          width: atom.width,
          font: atom.style.font,
          pixelScale: atom.style.pixelScale,
          ascent: atom.ascent,
          descent: atom.descent,
          tone: atom.style.tone,
          color: atom.style.color,
          backgroundColor: atom.style.backgroundColor,
        })
      }
      fragmentX += atom.width
    }

    return {
      width: lineWidth,
      ascent: lineAscent,
      descent: lineDescent,
      baseline,
      fragments,
    }
  })

  const lastLine = lines.at(-1)
  return {
    lines,
    contentWidth,
    contentHeight: lastLine ? lastLine.baseline + lastLine.descent : 0,
  }
}

export const alignTextOriginX = (contentBox: Rect, lineWidth: number, align: BitmapUiTextAlign): number => {
  if (align === 'center') return contentBox.x + Math.round((contentBox.width - lineWidth) * 0.5)
  if (align === 'end') return contentBox.x + contentBox.width - lineWidth
  return contentBox.x
}

export const findLineForCaret = (
  layout: TextLayout,
  caret: number,
): { readonly lineIndex: number; readonly line: WrappedLine } => {
  const lastLineIndex = layout.lines.length - 1
  for (let index = 0; index < layout.lines.length; index += 1) {
    const line = layout.lines[index]
    if (line && caret >= line.start && caret <= line.end) {
      return { lineIndex: index, line }
    }
  }
  return { lineIndex: lastLineIndex, line: layout.lines[lastLineIndex]! }
}

export const collectRichTextPlainText = (runs: readonly BitmapUiRichTextRun[]): string => {
  return runs.map((run) => run.text).join('')
}

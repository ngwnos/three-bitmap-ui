import type {
  BitmapUiAlign,
  BitmapUiColorLike,
  BitmapUiDirection,
  BitmapUiDocument,
  BitmapUiFieldDefinition,
  BitmapUiFontAtlas,
  BitmapUiGradientDef,
  BitmapUiInteraction,
  BitmapUiJustify,
  BitmapUiKeyInput,
  BitmapUiKeyResult,
  BitmapUiLength,
  BitmapUiNode,
  BitmapUiPalette,
  BitmapUiPointerResult,
  BitmapUiTextStyle,
  BitmapUiViewNode,
} from './types'
import type { BitmapUiElement } from './element'

export type RuntimeSnapshot = {
  readonly nowMs: number
  readonly blinkVisible: boolean
  readonly hoveredInteractionId: string | null
  readonly pressedInteractionId: string | null
  readonly focusedFieldId: string | null
}

export type ComponentContext = {
  readonly fonts: Readonly<Record<string, BitmapUiFontAtlas>>
  readonly palette: BitmapUiPalette
  readonly runtime: RuntimeSnapshot
}

export type BitmapUiComponent<P = Record<string, never>> = (props: P, ctx: ComponentContext) => BitmapUiNode

export type Store<S> = {
  readonly state: Readonly<S>
  update: (recipe: (draft: S) => void) => void
  set: (next: S) => void
  subscribe: (listener: () => void) => () => void
}

export const createStore = <S>(initial: S): Store<S> => {
  let current: S = initial
  const listeners = new Set<() => void>()

  const notify = (): void => {
    for (const listener of listeners) listener()
  }

  return {
    get state() {
      return current
    },

    update(recipe) {
      const draft = { ...current }
      recipe(draft)
      current = draft
      notify()
    },

    set(next) {
      current = next
      notify()
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export type BitmapUiApp<S> = {
  readonly store: Store<S>
  readonly root: BitmapUiComponent<Record<string, never>>
  readonly fields: (state: Readonly<S>) => Record<string, BitmapUiFieldDefinition>
  readonly onPointer?: (interactionId: string, surface: BitmapUiElement) => boolean
  readonly onPointerDrag?: (interactionId: string, localX: number, localY: number, surface: BitmapUiElement) => boolean
  readonly onKey?: (result: BitmapUiKeyResult, surface: BitmapUiElement) => boolean
  readonly onTick?: (nowMs: number, surface: BitmapUiElement) => boolean
  readonly onMount?: (surface: BitmapUiElement) => void
  readonly dispose?: () => void
}

export const renderApp = <S>(app: BitmapUiApp<S>, ctx: ComponentContext): BitmapUiDocument => {
  const root = app.root({}, ctx)
  const fields = app.fields(app.store.state)
  return { root, fields }
}

export type AppShellOptions = {
  readonly surface: BitmapUiElement
  readonly fonts: Readonly<Record<string, BitmapUiFontAtlas>>
  readonly palette: BitmapUiPalette
  readonly tickIntervalMs?: number
}

export type AppShell = {
  invalidate: () => void
  handlePointerDown: (position: { readonly x: number; readonly y: number }) => BitmapUiPointerResult
  handlePointerMove: (position: { readonly x: number; readonly y: number }) => BitmapUiPointerResult
  handlePointerUp: (position: { readonly x: number; readonly y: number }) => BitmapUiPointerResult
  handlePointerLeave: () => BitmapUiPointerResult
  handleKeyDown: (input: BitmapUiKeyInput) => BitmapUiKeyResult
  dispose: () => void
}

export const createBitmapUiAppShell = <S>(app: BitmapUiApp<S>, options: AppShellOptions): AppShell => {
  const { surface, fonts, palette } = options
  let nowMs = Date.now()
  let blinkVisible = Math.floor(nowMs / 500) % 2 === 0
  let disposed = false

  const buildContext = (): ComponentContext => ({
    fonts,
    palette,
    runtime: {
      nowMs,
      blinkVisible,
      hoveredInteractionId: surface.getHoveredInteractionId(),
      pressedInteractionId: surface.getPressedInteractionId(),
      focusedFieldId: surface.getFocusedFieldId(),
    },
  })

  const rebuild = (): void => {
    if (disposed) return
    const doc = renderApp(app, buildContext())
    surface.setDocument(doc)
  }

  const unsubscribe = app.store.subscribe(rebuild)

  rebuild()
  app.onMount?.(surface)

  const tickId = options.tickIntervalMs !== 0
    ? setInterval(() => {
        if (disposed) return
        const previousSecond = Math.floor(nowMs / 1000)
        nowMs = Date.now()
        const nextBlink = Math.floor(nowMs / 500) % 2 === 0
        const blinkChanged = nextBlink !== blinkVisible
        blinkVisible = nextBlink
        if (blinkChanged) {
          surface.setCaretVisible(blinkVisible)
        }
        const appChanged = app.onTick?.(nowMs, surface) ?? false
        if (blinkChanged || appChanged || Math.floor(nowMs / 1000) !== previousSecond) {
          rebuild()
        }
      }, options.tickIntervalMs ?? 200)
    : null

  const handlePointerEvent = (
    surfaceHandler: () => BitmapUiPointerResult,
  ): BitmapUiPointerResult => {
    const previousHovered = surface.getHoveredInteractionId()
    const previousPressed = surface.getPressedInteractionId()
    const previousFocused = surface.getFocusedFieldId()
    const result = surfaceHandler()
    const clickedId = result.clickedInteractionId
    const appChanged = clickedId ? (app.onPointer?.(clickedId, surface) ?? false) : false
    const runtimeChanged =
      surface.getHoveredInteractionId() !== previousHovered ||
      surface.getPressedInteractionId() !== previousPressed ||
      surface.getFocusedFieldId() !== previousFocused
    if (appChanged || runtimeChanged) {
      rebuild()
    }
    return result
  }

  return {
    invalidate: rebuild,

    handlePointerDown: (position) =>
      handlePointerEvent(() => surface.handlePointerDown(position)),

    handlePointerMove: (position) =>
      handlePointerEvent(() => surface.handlePointerMove(position)),

    handlePointerUp: (position) =>
      handlePointerEvent(() => surface.handlePointerUp(position)),

    handlePointerLeave: () =>
      handlePointerEvent(() => surface.handlePointerLeave()),

    handleKeyDown: (input) => {
      const previousFocused = surface.getFocusedFieldId()
      const result = surface.handleKeyDown(input)
      const appChanged = app.onKey?.(result, surface) ?? false
      const runtimeChanged = surface.getFocusedFieldId() !== previousFocused
      if (appChanged || runtimeChanged) {
        rebuild()
      }
      return result
    },

    dispose: () => {
      disposed = true
      if (tickId !== null) clearInterval(tickId)
      unsubscribe()
      app.dispose?.()
    },
  }
}

export type PanelProps = {
  readonly id: string
  readonly children: readonly BitmapUiNode[]
  readonly direction?: BitmapUiDirection
  readonly width?: BitmapUiLength
  readonly height?: BitmapUiLength
  readonly gap?: number
  readonly padding?: number
  readonly backgroundColor?: BitmapUiColorLike | null
  readonly borderColor?: BitmapUiColorLike | null
  readonly borderWidth?: number
  readonly align?: BitmapUiAlign
  readonly justify?: BitmapUiJustify
  readonly clip?: boolean
  readonly scrollX?: number
  readonly scrollY?: number
  readonly gradient?: BitmapUiGradientDef
  readonly textStyle?: BitmapUiTextStyle
  readonly interaction?: BitmapUiInteraction
  readonly position?: 'flow' | 'absolute'
  readonly x?: number
  readonly y?: number
  readonly zIndex?: number
}

export const Panel = (props: PanelProps): BitmapUiViewNode => ({
  kind: 'view',
  id: props.id,
  direction: props.direction ?? 'column',
  width: props.width ?? 'content',
  height: props.height ?? 'content',
  gap: props.gap ?? 2,
  padding: props.padding ?? 2,
  backgroundColor: props.backgroundColor,
  borderColor: props.borderColor,
  borderWidth: props.borderWidth ?? 1,
  align: props.align,
  justify: props.justify,
  clip: props.clip,
  scrollX: props.scrollX,
  scrollY: props.scrollY,
  gradient: props.gradient,
  textStyle: props.textStyle,
  interaction: props.interaction,
  position: props.position,
  x: props.x,
  y: props.y,
  zIndex: props.zIndex,
  children: props.children,
})

export type ScrollbarProps = {
  readonly id: string
  readonly orientation: 'vertical' | 'horizontal'
  readonly scrollOffset: number
  readonly maxScroll: number
  readonly trackLength: number
  readonly thickness?: number
  readonly interactionPrefix: string
  readonly trackColor?: BitmapUiColorLike
  readonly thumbColor?: BitmapUiColorLike
  readonly buttonColor?: BitmapUiColorLike
  readonly arrowColor?: BitmapUiColorLike
  readonly pressedInteractionId?: string | null
}

const buildArrowTriangle = (
  id: string,
  direction: 'up' | 'down' | 'left' | 'right',
  innerSize: number,
  color: BitmapUiColorLike,
): BitmapUiNode[] => {
  // Build a triangle that fits inside innerSize × innerSize content area.
  // For a 6×6 area (8px button minus 1px border each side):
  //   up:    row0=2px, row1=4px (2 rows, centered, top-aligned)
  //   down:  row0=4px, row1=2px (2 rows, centered, bottom-aligned)
  const nodes: BitmapUiNode[] = []
  const triHeight = Math.max(1, Math.floor(innerSize / 2))
  const center = Math.floor(innerSize / 2)
  const startY = Math.floor((innerSize - triHeight) / 2)

  for (let i = 0; i < triHeight; i++) {
    const span = 1 + i * 2
    const clampedSpan = Math.min(span, innerSize)
    const offset = center - Math.floor(clampedSpan / 2)

    if (direction === 'up') {
      nodes.push({
        kind: 'view', id: `${id}-r${i}`, direction: 'column',
        width: clampedSpan, height: 1, backgroundColor: color,
        position: 'absolute', x: offset, y: startY + i, children: [],
      })
    } else if (direction === 'down') {
      nodes.push({
        kind: 'view', id: `${id}-r${i}`, direction: 'column',
        width: clampedSpan, height: 1, backgroundColor: color,
        position: 'absolute', x: offset, y: startY + (triHeight - 1 - i), children: [],
      })
    } else if (direction === 'left') {
      nodes.push({
        kind: 'view', id: `${id}-r${i}`, direction: 'column',
        width: 1, height: clampedSpan, backgroundColor: color,
        position: 'absolute', x: startY + i, y: offset, children: [],
      })
    } else {
      nodes.push({
        kind: 'view', id: `${id}-r${i}`, direction: 'column',
        width: 1, height: clampedSpan, backgroundColor: color,
        position: 'absolute', x: startY + (triHeight - 1 - i), y: offset, children: [],
      })
    }
  }
  return nodes
}

export const Scrollbar = (props: ScrollbarProps): BitmapUiViewNode => {
  const thickness = props.thickness ?? 8
  const isVertical = props.orientation === 'vertical'
  const upId = `${props.interactionPrefix}:dec`
  const downId = `${props.interactionPrefix}:inc`
  const upPressed = props.pressedInteractionId === upId
  const downPressed = props.pressedInteractionId === downId
  const btnColor = props.buttonColor ?? '#0d171f'
  const btnBorder = '#274959'
  const pressedColor = '#8af3b6'
  const arrowColor = props.arrowColor ?? '#dff5ff'
  const pressedArrowColor = '#071015'

  const buttonSize = thickness
  const trackLength = Math.max(0, props.trackLength - buttonSize * 2)
  const thumbSize = Math.max(2, Math.round(trackLength * Math.min(1, trackLength / Math.max(1, trackLength + props.maxScroll))))
  const thumbMax = Math.max(0, trackLength - thumbSize)
  const thumbOffset = props.maxScroll > 0 ? Math.round((props.scrollOffset / props.maxScroll) * thumbMax) : 0

  const trackColor = props.trackColor ?? '#050a0f'
  const thumbColor = props.thumbColor ?? '#2a4a5c'

  const upDir = isVertical ? 'up' as const : 'left' as const
  const downDir = isVertical ? 'down' as const : 'right' as const

  const arrowButton = (id: string, dir: 'up' | 'down' | 'left' | 'right', pressed: boolean): BitmapUiViewNode => Panel({
    id,
    width: isVertical ? thickness : buttonSize,
    height: isVertical ? buttonSize : thickness,
    padding: 0,
    backgroundColor: pressed ? pressedColor : btnColor,
    borderColor: btnBorder,
    interaction: { id, role: 'button' },
    children: buildArrowTriangle(`${id}-arrow`, dir, buttonSize - 2, pressed ? pressedArrowColor : arrowColor),
  })

  const track: BitmapUiViewNode = Panel({
    id: `${props.id}-track`,
    width: isVertical ? thickness : trackLength,
    height: isVertical ? trackLength : thickness,
    padding: 0,
    gap: 0,
    backgroundColor: trackColor,
    borderColor: null,
    borderWidth: 0,
    children: [
      {
        kind: 'view',
        id: `${props.id}-thumb`,
        direction: 'column',
        width: isVertical ? thickness : thumbSize,
        height: isVertical ? thumbSize : thickness,
        backgroundColor: thumbColor,
        position: 'absolute',
        x: isVertical ? 0 : thumbOffset,
        y: isVertical ? thumbOffset : 0,
        children: [],
      },
    ],
  })

  return Panel({
    id: props.id,
    direction: isVertical ? 'column' : 'row',
    width: isVertical ? thickness : props.trackLength,
    height: isVertical ? props.trackLength : thickness,
    padding: 0,
    gap: 0,
    backgroundColor: null,
    borderColor: null,
    borderWidth: 0,
    children: [
      arrowButton(upId, upDir, upPressed),
      track,
      arrowButton(downId, downDir, downPressed),
    ],
  })
}

export type SliderProps = {
  readonly id: string
  readonly value: number // 0..1
  readonly width: number
  readonly height?: number
  readonly trackColor?: BitmapUiColorLike
  readonly fillColor?: BitmapUiColorLike
  readonly fillGradient?: BitmapUiGradientDef
  readonly thumbColor?: BitmapUiColorLike
  readonly borderColor?: BitmapUiColorLike
}

export const Slider = (props: SliderProps): BitmapUiViewNode => {
  const height = props.height ?? 8
  const thumbWidth = Math.max(3, Math.min(7, Math.round(height * 0.8)))
  const trackInner = props.width - 2 // 1px border each side
  const thumbTravel = Math.max(0, trackInner - thumbWidth)
  const thumbX = Math.round(Math.max(0, Math.min(1, props.value)) * thumbTravel)
  const fillWidth = thumbX + Math.round(thumbWidth / 2)

  return {
    kind: 'view',
    id: props.id,
    direction: 'row',
    width: props.width,
    height,
    padding: 0,
    backgroundColor: props.trackColor ?? '#050a0f',
    borderColor: props.borderColor ?? '#274959',
    borderWidth: 1,
    interaction: { id: props.id, role: 'slider' },
    children: [
      // Fill bar
      {
        kind: 'view', id: `${props.id}-fill`, direction: 'column',
        width: fillWidth, height: height - 2,
        backgroundColor: props.fillGradient ? null : (props.fillColor ?? '#1d3541'),
        gradient: props.fillGradient,
        position: 'absolute', x: 0, y: 0, children: [],
      },
      // Thumb
      {
        kind: 'view', id: `${props.id}-thumb`, direction: 'column',
        width: thumbWidth, height: height - 2,
        backgroundColor: props.thumbColor ?? '#8af3b6',
        position: 'absolute', x: thumbX, y: 0, children: [],
      },
    ],
  }
}

export type ToggleProps = {
  readonly id: string
  readonly value: boolean
  readonly width?: number
  readonly height?: number
  readonly trackOnColor?: BitmapUiColorLike
  readonly trackOffColor?: BitmapUiColorLike
  readonly thumbColor?: BitmapUiColorLike
  readonly borderColor?: BitmapUiColorLike
}

export const Toggle = (props: ToggleProps): BitmapUiViewNode => {
  const width = props.width ?? 16
  const height = props.height ?? 8
  const thumbWidth = Math.max(3, height - 2)
  const trackInner = width - 2
  const thumbX = props.value ? trackInner - thumbWidth : 0

  return {
    kind: 'view',
    id: props.id,
    direction: 'row',
    width,
    height,
    padding: 0,
    backgroundColor: props.value
      ? (props.trackOnColor ?? '#1a4030')
      : (props.trackOffColor ?? '#1a1a2a'),
    borderColor: props.borderColor ?? '#274959',
    borderWidth: 1,
    interaction: { id: props.id, role: 'button' },
    children: [
      {
        kind: 'view', id: `${props.id}-thumb`, direction: 'column',
        width: thumbWidth, height: height - 2,
        backgroundColor: props.value
          ? (props.thumbColor ?? '#8af3b6')
          : '#6e7a8a',
        position: 'absolute', x: thumbX, y: 0, children: [],
      },
    ],
  }
}

export type CheckboxProps = {
  readonly id: string
  readonly value: boolean
  readonly size?: number
  readonly checkColor?: BitmapUiColorLike
  readonly boxColor?: BitmapUiColorLike
  readonly borderColor?: BitmapUiColorLike
}

export const Checkbox = (props: CheckboxProps): BitmapUiViewNode => {
  const size = props.size ?? 8
  const inner = size - 2
  const checkMarks: BitmapUiNode[] = []
  if (props.value && inner >= 3) {
    const color = props.checkColor ?? '#8af3b6'
    for (let i = 0; i < inner; i++) {
      const y = Math.round(i * (inner - 1) / Math.max(1, inner - 1))
      checkMarks.push({
        kind: 'view', id: `${props.id}-a${i}`, direction: 'column',
        width: 1, height: 1, backgroundColor: color,
        position: 'absolute', x: i, y, children: [],
      })
      checkMarks.push({
        kind: 'view', id: `${props.id}-b${i}`, direction: 'column',
        width: 1, height: 1, backgroundColor: color,
        position: 'absolute', x: inner - 1 - i, y, children: [],
      })
    }
  }

  return {
    kind: 'view',
    id: props.id,
    direction: 'column',
    width: size,
    height: size,
    padding: 0,
    backgroundColor: props.boxColor ?? '#0d171f',
    borderColor: props.value ? (props.checkColor ?? '#8af3b6') : (props.borderColor ?? '#274959'),
    borderWidth: 1,
    interaction: { id: props.id, role: 'button' },
    children: checkMarks,
  }
}

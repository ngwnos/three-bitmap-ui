# Coordinate Systems Reference

The rendering pipeline has **4 Y-flips** spread across 3 files. This document
is the single source of truth for what convention applies at each stage.

## Pipeline stages

```
Screen pixels ──[flip 1]──▶ CRT-normalized ──[flip 2]──▶ Logical pixels
                                                              │
                            Bitmap pixels ◀── toLocalPosition ┘
                                │
                          DataTexture (flipY=false)
                                │
                      Ortho camera (Y-up) ──[flip 3]──▶ Overlay shader UV
                                │
                          RenderTarget texture
                                │
                      CRT shader ──[flip 4]──▶ contentUv sample
```

## Stage details

### 1. Screen pixels (DOM)
- **Origin:** top-left of canvas
- **Y:** down
- **Units:** CSS pixels
- **Source:** `PointerEvent.clientX/clientY`

### 2. CRT-normalized (App.tsx `resolveTextScenePointerPosition`)
- **Origin:** bottom-left
- **Y:** up (0 = bottom, 1 = top)
- **Units:** normalized [0, 1]
- **Variables:** `cursorX`, `cursorY`, `contentX`, `contentY`
- **Y-flip 1** (App.tsx): `cursorY = 1 - (clientY - rect.top) / height`

### 3. Logical pixels (App.tsx → surface)
- **Origin:** top-left
- **Y:** down (0 = top row)
- **Units:** integer pixels, range [0, logicalWidth) × [0, logicalHeight)
- **Y-flip 2** (App.tsx): `y = floor((1 - contentY) * logicalHeight)`
- These are CRT grid coordinates, not bitmap coordinates.

### 4. Bitmap-local pixels (surface.ts `toLocalPosition`)
- **Origin:** top-left of bitmap
- **Y:** down
- **Units:** integer pixels, range [0, textureWidth) × [0, textureHeight)
- **No flip** — just subtracts offset: `localY = logicalY - offsetY`
- Hit rects are in this space.

### 5. Bitmap pixel buffer (surface.ts DataTexture)
- **Origin:** top-left (row 0 = top of image)
- **Y:** down
- **flipY:** false
- **Format:** RGBA, UnsignedByte
- Index: `(y * width + x) * 4`

### 6. Ortho camera (surface.ts GPU scene)
- **Origin:** bottom-left (Three.js convention)
- **Y:** up
- **Camera:** left=0, right=crtW, bottom=0, top=crtH
- The bitmap plane is centered at `(crtW/2, crtH/2)` and scaled to
  `(crtW, crtH)`.

### 7. Overlay shader UV (surface.ts plane material)
- **fragUv:** standard Three.js UV — (0,0) bottom-left, Y-up
- **Y-flip 3** (surface.ts): `bitmapV = (1 - fragUv.y - rectY) / rectH`
  - Converts from ortho Y-up to bitmap Y-down for texture sampling.
- **bitmapU/bitmapV:** normalized [0, 1] within bitmap texture
- Outside [0, 1]: `opacityNode = 0` (transparent)

### 8. RenderTarget texture
- Three.js RenderTarget textures are **not auto-flipped**.
- UV (0, 0) = bottom-left of what the camera rendered.
- Since the ortho camera is Y-up, the texture's bottom = scene bottom.

### 9. CRT shader content sampling (buildPhosphorUpdateNode.ts)
- Input: `samplePixelX/Y` — logical pixel indices, Y-down (0 = top)
- **Y-flip 4** (buildPhosphorUpdateNode.ts):
  `contentUv.y = 1 - samplePixelY / phosphorRows`
  - Converts from logical Y-down to texture UV Y-up.
- Samples `contentTexture` (= the RenderTarget from stage 8).

## Offset convention

- `offsetX` / `offsetY`: position of the bitmap's **top-left corner** within
  the CRT logical grid, in logical pixels.
- Increasing `offsetX` moves the bitmap **right** visually.
- Increasing `offsetY` moves the bitmap **down** visually.
- Used in two places:
  1. Shader uniforms (`bitmapRectX/Y/W/H`) — positions the texture sample window
  2. `toLocalPosition()` — maps logical pointer coords to bitmap-local coords

## Why each flip exists (and can't be removed)

**Flips 1+2** form a round-trip: screen Y-down → normalized Y-up → logical
Y-down. They look redundant but exist because `centerY` (the CRT view pan
variable) is consumed by the CRT presentation shader (`buildDotTriadOnlyNode.ts`)
where it's added to a fragment UV that is Y-up. So the intermediate Y-up
representation is forced by the shader. Moving the flip to the shader boundary
would just relocate it, not eliminate it, and would split the view transform
into two conventions (Y-down in JS, Y-up in shader) — a worse outcome.

**Flips 3+4** bridge Three.js's Y-up texture/camera convention with the
bitmap's Y-down pixel buffer. Eliminating them would require storing bitmap
rows bottom-to-top, which would make every layout, text rendering, and hit-test
operation backwards. Not worth it.

## Rules

1. Pointer events enter as screen Y-down and exit `resolveTextScenePointerPosition`
   as logical Y-down. The two Y-flips (screen→normalized→logical) cancel out
   directionally — the net effect is just a coordinate space change, not a
   visual inversion.

2. The overlay shader flips Y once to go from ortho Y-up to bitmap Y-down.
   The CRT shader flips Y once to go from logical Y-down to texture UV Y-up.
   These two flips also form a matched pair — they undo each other across the
   RT boundary.

3. **Never add a Y-flip without updating this document.** If you think you need
   a new flip, first check whether the existing 4 flips already handle it.

4. **Offset is always top-left, Y-down, in logical pixels.** Both the shader
   path and the hit-test path use the same convention. Don't negate it.

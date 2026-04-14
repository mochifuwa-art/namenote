import { useRef, useCallback } from 'react'
import type { DrawingTool, DrawTarget } from '../types'
import { CANVAS_SCALE } from '../utils/canvasScale'

const PAGE_WIDTH = 560
const PAGE_HEIGHT = 800

// Normalize pointer pressure: pen → [0.1, 1.0], mouse/touch → 1.0
function getPressure(e: { pointerType: string; pressure: number }): number {
  return e.pointerType === 'pen' ? Math.max(0.1, e.pressure) : 1.0
}

// Exponential moving average factor for pressure smoothing (lower = smoother)
const PRESSURE_ALPHA = 0.3

function getDrawTarget(
  clientX: number,
  clientY: number,
  leftRect: DOMRect | null,
  rightRect: DOMRect | null
): DrawTarget | null {
  if (leftRect && clientX >= leftRect.left && clientX <= leftRect.right &&
      clientY >= leftRect.top && clientY <= leftRect.bottom) {
    return { kind: 'page', side: 'left' }
  }
  if (rightRect && clientX >= rightRect.left && clientX <= rightRect.right &&
      clientY >= rightRect.top && clientY <= rightRect.bottom) {
    return { kind: 'page', side: 'right' }
  }
  return null
}

function toCanvasCoords(clientX: number, clientY: number, rect: DOMRect, canvas: HTMLCanvasElement) {
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height),
  }
}

/**
 * Given a line segment from `prev` (outside rect) to `curr` (inside rect),
 * find the screen-space point where the segment first crosses the rect boundary.
 * Falls back to `curr` if no intersection is found (e.g. prev was also inside).
 */
function findRectEntryPoint(
  prev: { x: number; y: number },
  curr: { x: number; y: number },
  rect: DOMRect,
): { x: number; y: number } {
  const dx = curr.x - prev.x
  const dy = curr.y - prev.y
  let tMin: number | null = null

  const tryEdge = (t: number, coord: number, lo: number, hi: number) => {
    if (t >= 0 && t <= 1 && coord >= lo && coord <= hi) {
      if (tMin === null || t < tMin) tMin = t
    }
  }

  if (dx !== 0) {
    const tL = (rect.left - prev.x) / dx
    tryEdge(tL, prev.y + tL * dy, rect.top, rect.bottom)
    const tR = (rect.right - prev.x) / dx
    tryEdge(tR, prev.y + tR * dy, rect.top, rect.bottom)
  }
  if (dy !== 0) {
    const tT = (rect.top - prev.y) / dy
    tryEdge(tT, prev.x + tT * dx, rect.left, rect.right)
    const tB = (rect.bottom - prev.y) / dy
    tryEdge(tB, prev.x + tB * dx, rect.left, rect.right)
  }

  if (tMin === null) return curr
  return { x: prev.x + tMin * dx, y: prev.y + tMin * dy }
}

// ── Hook interface ────────────────────────────────────────────────────────────

interface UseDrawingOptions {
  tool: DrawingTool
  leftCanvasRef: React.RefObject<HTMLCanvasElement | null>
  rightCanvasRef: React.RefObject<HTMLCanvasElement | null>
  overlayRef: React.RefObject<HTMLDivElement | null>
  onBeforeStroke?: (target: DrawTarget) => void
  onStrokeEnd: (target: DrawTarget) => void
  onCancelStroke?: () => void
  enabled: boolean  // false when lasso tool is active
}

export function useDrawing({
  tool,
  leftCanvasRef,
  rightCanvasRef,
  overlayRef,
  onBeforeStroke,
  onStrokeEnd,
  onCancelStroke,
  enabled,
}: UseDrawingOptions) {
  const isDrawingRef = useRef(false)
  // Set to true when pointerdown happened outside a canvas (pointer held but not yet drawing).
  // On the first pointermove that enters a canvas we start the stroke there.
  const pendingPointerRef = useRef(false)
  // Last known screen position while in pending (outside-canvas) state.
  // Used to back-project the exact canvas-edge entry point when the pointer
  // crosses the boundary between two pointermove samples (fast movement).
  const lastOutsidePosRef = useRef<{ x: number; y: number } | null>(null)
  const lastPointRef = useRef({ x: 0, y: 0 })
  // Last known screen-space position of the draw cursor (updated each coalesced event).
  // Used to find the exact exit/entry edge point when the stroke crosses between pages.
  const lastScreenPosRef = useRef({ x: 0, y: 0 })
  // Which page sides have been drawn on in the current stroke (for cross-page history).
  const visitedSidesRef = useRef<Set<'left' | 'right'>>(new Set())
  const activeTargetRef = useRef<DrawTarget | null>(null)
  const activeCtxRef = useRef<CanvasRenderingContext2D | null>(null)
  const activeRectRef = useRef<DOMRect | null>(null)
  const activeCanvasRef = useRef<HTMLCanvasElement | null>(null)
  // true while the pointer is outside the active canvas during an ongoing stroke.
  // Used to clip at the exit edge and re-enter cleanly without a connecting line.
  const wasOutsideRef = useRef(false)
  // Quadratic curve midpoint tracking for smooth curves
  const lastMidRef = useRef({ x: 0, y: 0 })
  // Exponential moving average of pen pressure for smooth width transitions
  const smoothedPressureRef = useRef(1.0)
  // Avoid the degenerate first bezier segment (control point = start point → straight line).
  // Set true at stroke start; cleared after the first move event.
  const firstMoveRef = useRef(false)
  // EMA pre-smooth filter applied to raw canvas coords before the string stabilizer.
  // Reduces the visual impact of sparse pointer samples (e.g. iPad at 60 Hz) by
  // blending consecutive raw positions so the midpoint-quadratic curves between them
  // look smooth rather than polygonal.
  // Alpha 0 = cursor frozen, 1 = no smoothing.  0.6 gives a barely-perceptible
  // ~11 ms lag at 60 Hz but turns 10-sided polygons into smooth curves.
  const preSmoothRef = useRef({ x: 0, y: 0 })
  const PRE_SMOOTH_ALPHA = 0.6

  const applyToolToCtx = useCallback(
    (ctx: CanvasRenderingContext2D, pressure = 1.0) => {
      ctx.globalCompositeOperation = tool.type === 'eraser' ? 'destination-out' : 'source-over'
      ctx.strokeStyle = tool.color
      // Backing store is CANVAS_SCALE× larger than CSS size, so stroke widths must be
      // scaled accordingly to preserve the user-perceived line thickness.
      ctx.lineWidth = tool.size * pressure * CANVAS_SCALE
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
    },
    [tool]
  )

  // Begin an active stroke on the canvas that contains (clientX, clientY).
  // Called both from handlePointerDown (direct hit) and handlePointerMove
  // (entry into canvas after a pending outside-origin press).
  const startStroke = useCallback((
    clientX: number,
    clientY: number,
    pointerId: number,
    target: DrawTarget,
    pressure = 1.0,
  ) => {
    if (target.kind !== 'page') return
    const canvas = target.side === 'left' ? leftCanvasRef.current : rightCanvasRef.current
    if (!canvas) return
    // Use a fresh rect to avoid stale coordinates after pinch-zoom state update / render lag
    const rect = canvas.getBoundingClientRect()

    onBeforeStroke?.(target)

    const ctx = canvas.getContext('2d', { desynchronized: true })
    if (!ctx) return
    applyToolToCtx(ctx, pressure)

    const coords = toCanvasCoords(clientX, clientY, rect, canvas)

    // Draw initial dot at entry point, scaled by pressure (and HiDPI backing-store scale)
    ctx.beginPath()
    ctx.arc(coords.x, coords.y, (tool.size / 2) * pressure * CANVAS_SCALE, 0, Math.PI * 2)
    ctx.fillStyle = tool.type === 'eraser' ? 'rgba(0,0,0,1)' : tool.color
    ctx.globalCompositeOperation = tool.type === 'eraser' ? 'destination-out' : 'source-over'
    ctx.fill()

    isDrawingRef.current = true
    pendingPointerRef.current = false
    wasOutsideRef.current = false
    lastPointRef.current = coords
    lastMidRef.current = coords
    preSmoothRef.current = { ...coords }
    smoothedPressureRef.current = pressure
    lastScreenPosRef.current = { x: clientX, y: clientY }
    visitedSidesRef.current = new Set([target.side])
    activeTargetRef.current = target
    activeCtxRef.current = ctx
    activeRectRef.current = rect
    activeCanvasRef.current = canvas

    firstMoveRef.current = true
    overlayRef.current?.setPointerCapture(pointerId)
  }, [leftCanvasRef, rightCanvasRef, overlayRef, onBeforeStroke, applyToolToCtx, tool])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return
      if (e.pointerType === 'touch' && e.isPrimary === false) return

      const leftRect = leftCanvasRef.current?.getBoundingClientRect() ?? null
      const rightRect = rightCanvasRef.current?.getBoundingClientRect() ?? null
      const target = getDrawTarget(e.clientX, e.clientY, leftRect, rightRect)

      if (!target || target.kind !== 'page') {
        // Pointer went down outside any canvas — mark as pending so that the
        // first pointermove that enters a canvas will begin the stroke there.
        pendingPointerRef.current = true
        lastOutsidePosRef.current = { x: e.clientX, y: e.clientY }
        overlayRef.current?.setPointerCapture(e.pointerId)
        return
      }

      startStroke(e.clientX, e.clientY, e.pointerId, target, getPressure(e))
    },
    [enabled, startStroke, leftCanvasRef, rightCanvasRef, overlayRef]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === 'touch' && e.isPrimary === false) return

      // Pointer was held outside a canvas — check if we've entered one now
      if (pendingPointerRef.current && !isDrawingRef.current) {
        const leftRect = leftCanvasRef.current?.getBoundingClientRect() ?? null
        const rightRect = rightCanvasRef.current?.getBoundingClientRect() ?? null
        const target = getDrawTarget(e.clientX, e.clientY, leftRect, rightRect)
        if (target && target.kind === 'page') {
          // Back-project to the exact canvas-boundary crossing point so that
          // fast strokes start at the edge rather than an interior sample.
          const rect = target.side === 'left' ? leftRect : rightRect
          const curr = { x: e.clientX, y: e.clientY }
          const entry = (rect && lastOutsidePosRef.current)
            ? findRectEntryPoint(lastOutsidePosRef.current, curr, rect)
            : curr
          lastOutsidePosRef.current = null
          startStroke(entry.x, entry.y, e.pointerId, target, getPressure(e))
        } else {
          // Still outside — update the last known outside position for the
          // next sample's entry-point calculation.
          lastOutsidePosRef.current = { x: e.clientX, y: e.clientY }
        }
        return
      }

      if (!isDrawingRef.current || !activeCtxRef.current || !activeCanvasRef.current) return

      // Compute both rects up front so cross-page transitions can find the other canvas
      const leftRect = leftCanvasRef.current?.getBoundingClientRect() ?? null
      const rightRect = rightCanvasRef.current?.getBoundingClientRect() ?? null

      // Use coalesced events for smoother high-frequency input (pen tablets 200Hz+).
      // Cap at 32 events per frame: on old iPads a long freeze can queue 100+ events;
      // processing them all in one JS tick keeps the thread busy and causes another freeze.
      // Dropping excess events is imperceptible — the EMA pre-smooth fills in the path.
      const allEvents = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]
      const events = allEvents.length > 32 ? allEvents.slice(-32) : allEvents

      // Local mutable state — updated on page transitions, committed to refs after the loop
      let ctx = activeCtxRef.current
      let canvas = activeCanvasRef.current
      let activeSide = (activeTargetRef.current as { side: 'left' | 'right' }).side
      // Always use the freshly-measured rect to stay correct after pinch-zoom
      let rect = (activeSide === 'left' ? leftRect : rightRect) ?? activeRectRef.current!

      // ── Batched path building ──────────────────────────────────────────────
      // Instead of beginPath/stroke per bezier segment (expensive GPU round-trips),
      // accumulate all same-canvas segments into a single path and stroke once.
      // Flush the batch whenever we switch canvases or need a separate stroke call.
      let batchHasSegments = false

      const flushBatch = () => {
        if (batchHasSegments) {
          applyToolToCtx(ctx, smoothedPressureRef.current)
          ctx.stroke()
          batchHasSegments = false
        }
      }

      // Open the initial path for same-canvas segments
      ctx.beginPath()
      ctx.moveTo(lastMidRef.current.x, lastMidRef.current.y)

      for (const ce of events) {
        const currScreen = { x: ce.clientX, y: ce.clientY }
        const ceTarget = getDrawTarget(ce.clientX, ce.clientY, leftRect, rightRect)
        // Per-event pressure with exponential smoothing for gradual width transitions
        const rawPressure = ce.pointerType === 'pen' ? Math.max(0.1, ce.pressure) : 1.0
        smoothedPressureRef.current = smoothedPressureRef.current * (1 - PRESSURE_ALPHA) + rawPressure * PRESSURE_ALPHA

        if (ceTarget && ceTarget.kind === 'page' && ceTarget.side !== activeSide) {
          // ── Cross-page transition ──────────────────────────────────────
          flushBatch()

          const newSide = ceTarget.side
          const newCanvas = newSide === 'left' ? leftCanvasRef.current : rightCanvasRef.current
          const newRect   = newSide === 'left' ? leftRect : rightRect
          if (!newCanvas || !newRect) {
            lastScreenPosRef.current = currScreen
            continue
          }

          // 1. Draw to the exit edge of the current canvas (skip if already clipped by wasOutside)
          if (!wasOutsideRef.current) {
            const exitScreen = findRectEntryPoint(lastScreenPosRef.current, currScreen, rect)
            const exitCoords = toCanvasCoords(exitScreen.x, exitScreen.y, rect, canvas)
            applyToolToCtx(ctx, smoothedPressureRef.current)
            ctx.beginPath()
            ctx.moveTo(lastMidRef.current.x, lastMidRef.current.y)
            ctx.quadraticCurveTo(lastPointRef.current.x, lastPointRef.current.y, exitCoords.x, exitCoords.y)
            ctx.stroke()
          }

          // 2. Save history for the new canvas before first mark (once per stroke)
          if (!visitedSidesRef.current.has(newSide)) {
            onBeforeStroke?.({ kind: 'page', side: newSide })
            visitedSidesRef.current.add(newSide)
          }

          // 3. Find the entry point on the new canvas
          const entryScreen = findRectEntryPoint(lastScreenPosRef.current, currScreen, newRect)
          const entryCoords = toCanvasCoords(entryScreen.x, entryScreen.y, newRect, newCanvas)

          // 4. Switch active canvas and draw initial dot at entry
          const newCtx = newCanvas.getContext('2d', { desynchronized: true })
          if (!newCtx) continue
          applyToolToCtx(newCtx, smoothedPressureRef.current)
          newCtx.beginPath()
          newCtx.arc(entryCoords.x, entryCoords.y, (tool.size / 2) * smoothedPressureRef.current * CANVAS_SCALE, 0, Math.PI * 2)
          newCtx.fillStyle = tool.type === 'eraser' ? 'rgba(0,0,0,1)' : tool.color
          newCtx.globalCompositeOperation = tool.type === 'eraser' ? 'destination-out' : 'source-over'
          newCtx.fill()

          ctx = newCtx
          canvas = newCanvas
          rect = newRect
          activeSide = newSide
          lastPointRef.current = entryCoords
          lastMidRef.current = entryCoords
          preSmoothRef.current = { ...entryCoords }

          // 5. Continue drawing to the current event position (start new batch on new canvas)
          const raw = toCanvasCoords(ce.clientX, ce.clientY, newRect, newCanvas)
          preSmoothRef.current = {
            x: preSmoothRef.current.x * (1 - PRE_SMOOTH_ALPHA) + raw.x * PRE_SMOOTH_ALPHA,
            y: preSmoothRef.current.y * (1 - PRE_SMOOTH_ALPHA) + raw.y * PRE_SMOOTH_ALPHA,
          }
          const continueMid = { x: (lastPointRef.current.x + preSmoothRef.current.x) / 2, y: (lastPointRef.current.y + preSmoothRef.current.y) / 2 }
          ctx.beginPath()
          ctx.moveTo(lastMidRef.current.x, lastMidRef.current.y)
          ctx.quadraticCurveTo(lastPointRef.current.x, lastPointRef.current.y, continueMid.x, continueMid.y)
          batchHasSegments = true
          lastPointRef.current = preSmoothRef.current
          lastMidRef.current = continueMid
          wasOutsideRef.current = false

        } else if (!ceTarget || ceTarget.kind !== 'page') {
          // ── Pointer left the active canvas — clip at exit edge on first departure ──
          if (!wasOutsideRef.current) {
            flushBatch()
            const exitScreen = findRectEntryPoint(lastScreenPosRef.current, currScreen, rect)
            const exitCoords = toCanvasCoords(exitScreen.x, exitScreen.y, rect, canvas)
            applyToolToCtx(ctx, smoothedPressureRef.current)
            ctx.beginPath()
            ctx.moveTo(lastMidRef.current.x, lastMidRef.current.y)
            ctx.quadraticCurveTo(lastPointRef.current.x, lastPointRef.current.y, exitCoords.x, exitCoords.y)
            ctx.stroke()
            lastPointRef.current = exitCoords
            lastMidRef.current = exitCoords
            wasOutsideRef.current = true
          }

        } else {
          // ── Same canvas as before — normal drawing (batched) ───────────
          if (wasOutsideRef.current) {
            // Re-entering the same canvas: reset path from new entry edge
            flushBatch()
            const entryScreen = findRectEntryPoint(lastScreenPosRef.current, currScreen, rect)
            const entryCoords = toCanvasCoords(entryScreen.x, entryScreen.y, rect, canvas)
            lastPointRef.current = entryCoords
            lastMidRef.current = entryCoords
            preSmoothRef.current = { ...entryCoords }
            wasOutsideRef.current = false
            ctx.beginPath()
            ctx.moveTo(lastMidRef.current.x, lastMidRef.current.y)
          }
          const raw = toCanvasCoords(ce.clientX, ce.clientY, rect, canvas)
          // EMA pre-smooth: blend raw coords toward previous smoothed position.
          // Turns sparse 60 Hz iPad samples into smooth curves (not polygons).
          preSmoothRef.current = {
            x: preSmoothRef.current.x * (1 - PRE_SMOOTH_ALPHA) + raw.x * PRE_SMOOTH_ALPHA,
            y: preSmoothRef.current.y * (1 - PRE_SMOOTH_ALPHA) + raw.y * PRE_SMOOTH_ALPHA,
          }
          const pt = preSmoothRef.current
          if (firstMoveRef.current) {
            // Skip the degenerate opening segment (control pt = start pt → straight line).
            firstMoveRef.current = false
            lastPointRef.current = pt
          } else {
            const mid = { x: (lastPointRef.current.x + pt.x) / 2, y: (lastPointRef.current.y + pt.y) / 2 }
            // Accumulate into the open batch path — no stroke() here
            ctx.quadraticCurveTo(lastPointRef.current.x, lastPointRef.current.y, mid.x, mid.y)
            batchHasSegments = true
            lastPointRef.current = pt
            lastMidRef.current = mid
          }
        }

        lastScreenPosRef.current = currScreen
      }

      // Flush any remaining batch segments with a single stroke call
      flushBatch()

      // Commit local canvas state back to refs for the next move/up event
      activeCtxRef.current = ctx
      activeCanvasRef.current = canvas
      activeRectRef.current = rect
      activeTargetRef.current = { kind: 'page', side: activeSide }
    },
    [applyToolToCtx, leftCanvasRef, rightCanvasRef, onBeforeStroke, tool]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      pendingPointerRef.current = false
      if (!isDrawingRef.current) return

      // Draw final segment from the last midpoint to the exact pointer position
      // (skip if pointer ended outside the canvas — nothing to snap to)
      if (!firstMoveRef.current && activeCtxRef.current && activeRectRef.current && activeCanvasRef.current && !wasOutsideRef.current) {
        const final = toCanvasCoords(e.clientX, e.clientY, activeRectRef.current, activeCanvasRef.current)
        const ctx = activeCtxRef.current
        // Use final pen pressure (smoothed) so lifting gently produces a thin endpoint
        const rawPressure = getPressure(e)
        smoothedPressureRef.current = smoothedPressureRef.current * (1 - PRESSURE_ALPHA) + rawPressure * PRESSURE_ALPHA
        applyToolToCtx(ctx, smoothedPressureRef.current)
        ctx.beginPath()
        ctx.moveTo(lastMidRef.current.x, lastMidRef.current.y)
        ctx.quadraticCurveTo(lastPointRef.current.x, lastPointRef.current.y, final.x, final.y)
        ctx.stroke()
      }

      isDrawingRef.current = false
      if (activeTargetRef.current) onStrokeEnd(activeTargetRef.current)
      activeCtxRef.current = null
      activeTargetRef.current = null
      activeRectRef.current = null
      activeCanvasRef.current = null
      overlayRef.current?.releasePointerCapture(e.pointerId)
    },
    [onStrokeEnd, overlayRef, applyToolToCtx]
  )

  // Cancel an in-progress stroke (e.g. when a second finger touches down mid-draw)
  const cancelStroke = useCallback(() => {
    pendingPointerRef.current = false
    lastOutsidePosRef.current = null
    wasOutsideRef.current = false
    firstMoveRef.current = false
    if (!isDrawingRef.current) return
    isDrawingRef.current = false
    activeCtxRef.current = null
    activeTargetRef.current = null
    activeRectRef.current = null
    activeCanvasRef.current = null
    onCancelStroke?.()
  }, [onCancelStroke])

  return { handlePointerDown, handlePointerMove, handlePointerUp, cancelStroke, PAGE_WIDTH, PAGE_HEIGHT }
}

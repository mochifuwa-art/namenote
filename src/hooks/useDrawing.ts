import { useRef, useCallback } from 'react'
import type { DrawingTool, DrawTarget } from '../types'

const PAGE_WIDTH = 560
const PAGE_HEIGHT = 800

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
  let tMin = Infinity

  const tryEdge = (t: number, coord: number, lo: number, hi: number) => {
    if (t >= 0 && t <= 1 && coord >= lo && coord <= hi) {
      tMin = Math.min(tMin, t)
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

  if (tMin === Infinity) return curr
  return { x: prev.x + tMin * dx, y: prev.y + tMin * dy }
}

// ── String Filter (Lazy Brush) ──────────────────────────────────────────────
// The virtual "string" connects the raw pointer to the draw cursor.
// The cursor only moves when the raw pointer pulls it beyond `stringLength` px.
// This absorbs small tremors with minimal latency: large intentional movements
// respond immediately, only the leading edge of the string adds lag.
//
// strength (0–100) → stringLength (0–60 canvas-px, quadratic for natural feel)
class StringStabilizer {
  private ox: number
  private oy: number
  private readonly len: number   // string length in canvas pixels

  constructor(startX: number, startY: number, stringLength: number) {
    this.ox = startX
    this.oy = startY
    this.len = stringLength
  }

  process(x: number, y: number): { x: number; y: number } {
    if (this.len === 0) return { x, y }
    const dx = x - this.ox
    const dy = y - this.oy
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > this.len) {
      const ratio = (dist - this.len) / dist
      this.ox += dx * ratio
      this.oy += dy * ratio
    }
    return { x: this.ox, y: this.oy }
  }

  // Snap cursor to raw pointer on pen-up so endpoints are accurate
  finish(x: number, y: number): { x: number; y: number } {
    this.ox = x
    this.oy = y
    return { x, y }
  }
}

function strengthToStringLength(strength: number): number {
  // Quadratic: 0→0, 50→15, 100→60 (canvas pixels at 1:1 zoom)
  const t = strength / 100
  return t * t * 60
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
  stabilizationStrength: number  // 0 = off, 1–100 = string length
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
  stabilizationStrength,
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
  const activeTargetRef = useRef<DrawTarget | null>(null)
  const activeCtxRef = useRef<CanvasRenderingContext2D | null>(null)
  const activeRectRef = useRef<DOMRect | null>(null)
  const activeCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const stabilizerRef = useRef<StringStabilizer | null>(null)

  const applyToolToCtx = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      ctx.globalCompositeOperation = tool.type === 'eraser' ? 'destination-out' : 'source-over'
      ctx.strokeStyle = tool.color
      ctx.lineWidth = tool.size
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
    leftRect: DOMRect | null,
    rightRect: DOMRect | null,
  ) => {
    if (target.kind !== 'page') return
    const canvas = target.side === 'left' ? leftCanvasRef.current : rightCanvasRef.current
    const rect = target.side === 'left' ? leftRect : rightRect
    if (!canvas || !rect) return

    onBeforeStroke?.(target)

    const ctx = canvas.getContext('2d')!
    applyToolToCtx(ctx)

    const coords = toCanvasCoords(clientX, clientY, rect, canvas)

    // Draw initial dot at entry point
    ctx.beginPath()
    ctx.arc(coords.x, coords.y, tool.size / 2, 0, Math.PI * 2)
    ctx.fillStyle = tool.type === 'eraser' ? 'rgba(0,0,0,1)' : tool.color
    ctx.globalCompositeOperation = tool.type === 'eraser' ? 'destination-out' : 'source-over'
    ctx.fill()

    const strLen = strengthToStringLength(stabilizationStrength)
    stabilizerRef.current = strLen > 0 ? new StringStabilizer(coords.x, coords.y, strLen) : null

    isDrawingRef.current = true
    pendingPointerRef.current = false
    lastPointRef.current = coords
    activeTargetRef.current = target
    activeCtxRef.current = ctx
    activeRectRef.current = rect
    activeCanvasRef.current = canvas

    overlayRef.current?.setPointerCapture(pointerId)
  }, [leftCanvasRef, rightCanvasRef, overlayRef, onBeforeStroke, applyToolToCtx, tool, stabilizationStrength])

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

      startStroke(e.clientX, e.clientY, e.pointerId, target, leftRect, rightRect)
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
          startStroke(entry.x, entry.y, e.pointerId, target, leftRect, rightRect)
        } else {
          // Still outside — update the last known outside position for the
          // next sample's entry-point calculation.
          lastOutsidePosRef.current = { x: e.clientX, y: e.clientY }
        }
        return
      }

      if (!isDrawingRef.current || !activeCtxRef.current || !activeCanvasRef.current) return

      const ctx = activeCtxRef.current
      const canvas = activeCanvasRef.current
      const rect = activeRectRef.current!

      // Use coalesced events for smoother high-frequency input (pen tablets 200Hz+)
      const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]

      applyToolToCtx(ctx)

      for (const ce of events) {
        const raw = toCanvasCoords(ce.clientX, ce.clientY, rect, canvas)
        const pt = stabilizerRef.current ? stabilizerRef.current.process(raw.x, raw.y) : raw

        ctx.beginPath()
        ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y)
        ctx.lineTo(pt.x, pt.y)
        ctx.stroke()
        lastPointRef.current = pt
      }
    },
    [applyToolToCtx]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      pendingPointerRef.current = false
      if (!isDrawingRef.current) return

      // Snap to exact pointer position so endpoint is accurate
      if (stabilizerRef.current && activeCtxRef.current && activeRectRef.current && activeCanvasRef.current) {
        const raw = toCanvasCoords(e.clientX, e.clientY, activeRectRef.current, activeCanvasRef.current)
        const final = stabilizerRef.current.finish(raw.x, raw.y)
        const ctx = activeCtxRef.current
        applyToolToCtx(ctx)
        ctx.beginPath()
        ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y)
        ctx.lineTo(final.x, final.y)
        ctx.stroke()
      }
      stabilizerRef.current = null

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
    if (!isDrawingRef.current) return
    isDrawingRef.current = false
    stabilizerRef.current = null
    activeCtxRef.current = null
    activeTargetRef.current = null
    activeRectRef.current = null
    activeCanvasRef.current = null
    onCancelStroke?.()
  }, [onCancelStroke])

  return { handlePointerDown, handlePointerMove, handlePointerUp, cancelStroke, PAGE_WIDTH, PAGE_HEIGHT }
}

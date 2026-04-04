import { useRef, useCallback } from 'react'
import { StabilizedPointer, oneEuroFilter } from '@stroke-stabilizer/core'
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

interface UseDrawingOptions {
  tool: DrawingTool
  leftCanvasRef: React.RefObject<HTMLCanvasElement | null>
  rightCanvasRef: React.RefObject<HTMLCanvasElement | null>
  overlayRef: React.RefObject<HTMLDivElement | null>
  onBeforeStroke?: (target: DrawTarget) => void
  onStrokeEnd: (target: DrawTarget) => void
  onCancelStroke?: () => void
  enabled: boolean  // false when lasso tool is active
  stabilizationEnabled: boolean
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
  stabilizationEnabled,
}: UseDrawingOptions) {
  const isDrawingRef = useRef(false)
  const lastPointRef = useRef({ x: 0, y: 0 })
  const activeTargetRef = useRef<DrawTarget | null>(null)
  const activeCtxRef = useRef<CanvasRenderingContext2D | null>(null)
  const activeRectRef = useRef<DOMRect | null>(null)
  const activeCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const stabilizerRef = useRef<StabilizedPointer | null>(null)

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

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return
      // Ignore palm touches when a pen/stylus is active
      if (e.pointerType === 'touch' && e.isPrimary === false) return

      const leftRect = leftCanvasRef.current?.getBoundingClientRect() ?? null
      const rightRect = rightCanvasRef.current?.getBoundingClientRect() ?? null
      const target = getDrawTarget(e.clientX, e.clientY, leftRect, rightRect)
      if (!target) return

      if (target.kind !== 'page') return
      const canvas = target.side === 'left' ? leftCanvasRef.current : rightCanvasRef.current
      const rect = target.side === 'left' ? leftRect : rightRect

      if (!canvas || !rect) return

      onBeforeStroke?.(target)

      const ctx = canvas.getContext('2d')!
      applyToolToCtx(ctx)

      const coords = toCanvasCoords(e.clientX, e.clientY, rect, canvas)

      ctx.beginPath()
      ctx.moveTo(coords.x, coords.y)
      // Draw a dot for single tap
      ctx.arc(coords.x, coords.y, tool.size / 2, 0, Math.PI * 2)
      ctx.fillStyle = tool.type === 'eraser' ? 'rgba(0,0,0,1)' : tool.color
      ctx.globalCompositeOperation = tool.type === 'eraser' ? 'destination-out' : 'source-over'
      ctx.fill()

      // Initialize stabilizer for this stroke
      if (stabilizationEnabled) {
        stabilizerRef.current = new StabilizedPointer().addFilter(
          oneEuroFilter({ minCutoff: 1.0, beta: 0.007 })
        )
        // Feed the initial point to warm up the filter
        stabilizerRef.current.process({
          x: coords.x,
          y: coords.y,
          pressure: e.pressure,
          timestamp: e.timeStamp,
        })
      } else {
        stabilizerRef.current = null
      }

      isDrawingRef.current = true
      lastPointRef.current = coords
      activeTargetRef.current = target
      activeCtxRef.current = ctx
      activeRectRef.current = rect
      activeCanvasRef.current = canvas

      overlayRef.current?.setPointerCapture(e.pointerId)
    },
    [enabled, tool, leftCanvasRef, rightCanvasRef, overlayRef, onBeforeStroke, applyToolToCtx, stabilizationEnabled]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDrawingRef.current || !activeCtxRef.current || !activeCanvasRef.current) return
      if (e.pointerType === 'touch' && e.isPrimary === false) return

      const ctx = activeCtxRef.current
      const canvas = activeCanvasRef.current
      const rect = activeRectRef.current!

      // Use coalesced events for smoother input capture
      const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]

      applyToolToCtx(ctx)

      for (const ce of events) {
        const coords = toCanvasCoords(ce.clientX, ce.clientY, rect, canvas)

        if (stabilizationEnabled && stabilizerRef.current) {
          const result = stabilizerRef.current.process({
            x: coords.x,
            y: coords.y,
            pressure: ce.pressure,
            timestamp: ce.timeStamp,
          })
          if (result) {
            ctx.beginPath()
            ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y)
            ctx.lineTo(result.x, result.y)
            ctx.stroke()
            lastPointRef.current = { x: result.x, y: result.y }
          }
        } else {
          ctx.beginPath()
          ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y)
          ctx.lineTo(coords.x, coords.y)
          ctx.stroke()
          lastPointRef.current = coords
        }
      }
    },
    [applyToolToCtx, stabilizationEnabled]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDrawingRef.current) return

      // Flush any remaining stabilized points for endpoint correction
      if (stabilizationEnabled && stabilizerRef.current && activeCtxRef.current) {
        const finalPoints = stabilizerRef.current.finish()
        if (finalPoints.length > 0) {
          const ctx = activeCtxRef.current
          applyToolToCtx(ctx)
          // Draw a line to the final corrected endpoint
          const last = finalPoints[finalPoints.length - 1]
          ctx.beginPath()
          ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y)
          ctx.lineTo(last.x, last.y)
          ctx.stroke()
        }
        stabilizerRef.current = null
      }

      isDrawingRef.current = false
      if (activeTargetRef.current) {
        onStrokeEnd(activeTargetRef.current)
      }
      activeCtxRef.current = null
      activeTargetRef.current = null
      activeRectRef.current = null
      activeCanvasRef.current = null
      overlayRef.current?.releasePointerCapture(e.pointerId)
    },
    [onStrokeEnd, overlayRef, stabilizationEnabled, applyToolToCtx]
  )

  // Cancel an in-progress stroke (e.g. when a second finger touches down mid-draw)
  const cancelStroke = useCallback(() => {
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

import { useRef, useCallback } from 'react'
import type { DrawingTool, DrawTarget } from '../types'

const PAGE_WIDTH = 560
const PAGE_HEIGHT = 800

function getDrawTarget(
  clientX: number,
  clientY: number,
  leftRect: DOMRect | null,
  rightRect: DOMRect | null
): DrawTarget {
  if (leftRect && clientX >= leftRect.left && clientX <= leftRect.right &&
      clientY >= leftRect.top && clientY <= leftRect.bottom) {
    return { kind: 'page', side: 'left' }
  }
  if (rightRect && clientX >= rightRect.left && clientX <= rightRect.right &&
      clientY >= rightRect.top && clientY <= rightRect.bottom) {
    return { kind: 'page', side: 'right' }
  }
  return { kind: 'desk' }
}

function toCanvasCoords(clientX: number, clientY: number, rect: DOMRect, canvas: HTMLCanvasElement) {
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height),
  }
}

interface UseDrawingOptions {
  tool: DrawingTool
  deskCanvasRef: React.RefObject<HTMLCanvasElement | null>
  leftCanvasRef: React.RefObject<HTMLCanvasElement | null>
  rightCanvasRef: React.RefObject<HTMLCanvasElement | null>
  overlayRef: React.RefObject<HTMLDivElement | null>
  onStrokeEnd: (target: DrawTarget) => void
  enabled: boolean  // false when lasso tool is active
}

export function useDrawing({
  tool,
  deskCanvasRef,
  leftCanvasRef,
  rightCanvasRef,
  overlayRef,
  onStrokeEnd,
  enabled,
}: UseDrawingOptions) {
  const isDrawingRef = useRef(false)
  const lastPointRef = useRef({ x: 0, y: 0 })
  const activeTargetRef = useRef<DrawTarget | null>(null)
  const activeCtxRef = useRef<CanvasRenderingContext2D | null>(null)
  const activeRectRef = useRef<DOMRect | null>(null)
  const activeCanvasRef = useRef<HTMLCanvasElement | null>(null)

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

      let canvas: HTMLCanvasElement | null = null
      let rect: DOMRect | null = null

      if (target.kind === 'desk') {
        canvas = deskCanvasRef.current
        if (canvas) {
          rect = new DOMRect(0, 0, window.innerWidth, window.innerHeight)
        }
      } else if (target.kind === 'page') {
        canvas = target.side === 'left' ? leftCanvasRef.current : rightCanvasRef.current
        rect = target.side === 'left' ? leftRect : rightRect
      }

      if (!canvas || !rect) return

      const ctx = canvas.getContext('2d')!
      applyToolToCtx(ctx)

      const coords = target.kind === 'desk'
        ? { x: e.clientX, y: e.clientY }
        : toCanvasCoords(e.clientX, e.clientY, rect, canvas)

      ctx.beginPath()
      ctx.moveTo(coords.x, coords.y)
      // Draw a dot for single tap
      ctx.arc(coords.x, coords.y, tool.size / 2, 0, Math.PI * 2)
      ctx.fillStyle = tool.type === 'eraser' ? 'rgba(0,0,0,1)' : tool.color
      ctx.globalCompositeOperation = tool.type === 'eraser' ? 'destination-out' : 'source-over'
      ctx.fill()

      isDrawingRef.current = true
      lastPointRef.current = coords
      activeTargetRef.current = target
      activeCtxRef.current = ctx
      activeRectRef.current = rect
      activeCanvasRef.current = canvas

      overlayRef.current?.setPointerCapture(e.pointerId)
    },
    [enabled, tool, deskCanvasRef, leftCanvasRef, rightCanvasRef, overlayRef, applyToolToCtx]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDrawingRef.current || !activeCtxRef.current || !activeCanvasRef.current) return
      if (e.pointerType === 'touch' && e.isPrimary === false) return

      const ctx = activeCtxRef.current
      const canvas = activeCanvasRef.current
      const target = activeTargetRef.current!
      const rect = activeRectRef.current!

      const coords = target.kind === 'desk'
        ? { x: e.clientX, y: e.clientY }
        : toCanvasCoords(e.clientX, e.clientY, rect, canvas)

      applyToolToCtx(ctx)
      ctx.beginPath()
      ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y)
      ctx.lineTo(coords.x, coords.y)
      ctx.stroke()

      lastPointRef.current = coords
    },
    [applyToolToCtx]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDrawingRef.current) return
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
    [onStrokeEnd, overlayRef]
  )

  return { handlePointerDown, handlePointerMove, handlePointerUp, PAGE_WIDTH, PAGE_HEIGHT }
}

import { forwardRef, useRef, useCallback, useEffect } from 'react'
import type { DrawingTool } from '../types'
import '../styles/MemoSidebar.css'

const MEMO_CANVAS_WIDTH = 260
const MEMO_CANVAS_HEIGHT = 4000

interface MemoSidebarProps {
  open: boolean
  onToggle: () => void
  tool: DrawingTool
}

const MemoSidebar = forwardRef<HTMLCanvasElement, MemoSidebarProps>(
  ({ open, onToggle, tool }, canvasRef) => {
    const scrollRef = useRef<HTMLDivElement>(null)
    const isDrawingRef = useRef(false)
    const lastPtRef = useRef({ x: 0, y: 0 })
    const activeCtxRef = useRef<CanvasRenderingContext2D | null>(null)

    // Initialize canvas size on mount
    useEffect(() => {
      const canvas = (canvasRef as React.RefObject<HTMLCanvasElement>).current
      if (!canvas) return
      canvas.width = MEMO_CANVAS_WIDTH
      canvas.height = MEMO_CANVAS_HEIGHT
    }, [canvasRef])

    const getCanvasCoords = useCallback((clientX: number, clientY: number) => {
      const scroll = scrollRef.current
      if (!scroll) return { x: clientX, y: clientY }
      const rect = scroll.getBoundingClientRect()
      return {
        x: clientX - rect.left,
        y: clientY - rect.top + scroll.scrollTop,
      }
    }, [])

    const applyTool = useCallback((ctx: CanvasRenderingContext2D) => {
      ctx.globalCompositeOperation = tool.type === 'eraser' ? 'destination-out' : 'source-over'
      ctx.strokeStyle = tool.color
      ctx.lineWidth = tool.size
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
    }, [tool])

    const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.pointerType === 'touch' && !e.isPrimary) return
      e.currentTarget.setPointerCapture(e.pointerId)

      const canvas = (canvasRef as React.RefObject<HTMLCanvasElement>).current
      if (!canvas) return
      const ctx = canvas.getContext('2d')!
      applyTool(ctx)

      const pt = getCanvasCoords(e.clientX, e.clientY)
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, tool.size / 2, 0, Math.PI * 2)
      ctx.fillStyle = tool.type === 'eraser' ? 'rgba(0,0,0,1)' : tool.color
      ctx.globalCompositeOperation = tool.type === 'eraser' ? 'destination-out' : 'source-over'
      ctx.fill()

      isDrawingRef.current = true
      lastPtRef.current = pt
      activeCtxRef.current = ctx
    }, [canvasRef, applyTool, getCanvasCoords, tool])

    const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current || !activeCtxRef.current) return
      if (e.pointerType === 'touch' && !e.isPrimary) return

      const pt = getCanvasCoords(e.clientX, e.clientY)
      const ctx = activeCtxRef.current
      applyTool(ctx)
      ctx.beginPath()
      ctx.moveTo(lastPtRef.current.x, lastPtRef.current.y)
      ctx.lineTo(pt.x, pt.y)
      ctx.stroke()
      lastPtRef.current = pt
    }, [applyTool, getCanvasCoords])

    const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) return
      isDrawingRef.current = false
      activeCtxRef.current = null
      e.currentTarget.releasePointerCapture(e.pointerId)
    }, [])

    return (
      <div className="memo-sidebar">
        <div className={`memo-sidebar__panel${open ? '' : ' memo-sidebar__panel--collapsed'}`}>
          <div className="memo-sidebar__header">メモ</div>
          <div className="memo-sidebar__scroll" ref={scrollRef}>
            <div className="memo-sidebar__canvas-wrap">
              <canvas
                ref={canvasRef}
                className="memo-sidebar__canvas"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              />
            </div>
          </div>
        </div>
        <button
          className={`memo-sidebar__toggle${open ? '' : ' memo-sidebar__toggle--collapsed'}`}
          onClick={onToggle}
          title={open ? 'メモを閉じる' : 'メモを開く'}
        >
          {open ? '◀' : '▶'}
        </button>
      </div>
    )
  }
)

MemoSidebar.displayName = 'MemoSidebar'
export default MemoSidebar

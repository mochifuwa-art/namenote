import { forwardRef, useRef, useCallback, useEffect } from 'react'
import type { DrawingTool, TextObject, TextWritingMode, InputMode, DrawTarget } from '../types'
import TextLayer from './TextLayer'
import '../styles/MemoSidebar.css'

const MEMO_CANVAS_WIDTH = 260
const MEMO_CANVAS_HEIGHT = 4000
const PRESSURE_ALPHA = 0.3

interface MemoSidebarProps {
  open: boolean
  onToggle: () => void
  tool: DrawingTool
  inputMode: InputMode
  // Text layer props
  textObjects: TextObject[]
  isTextActive: boolean
  textColor: string
  textFontSize: number
  textWritingMode: TextWritingMode
  draggingTextId?: string
  onAddText: (obj: TextObject) => void
  onUpdateText: (id: string, updates: Partial<Pick<TextObject, 'x' | 'y' | 'text'>>) => void
  onEditRequest: (id: string, screenX: number, screenY: number) => void
  onBeginCrossAreaDrag?: (obj: TextObject, pointerId: number, clientX: number, clientY: number, grabOffsetX: number, grabOffsetY: number) => void
  onBeforeStroke?: (target: DrawTarget) => void
}

const MemoSidebar = forwardRef<HTMLCanvasElement, MemoSidebarProps>(
  (
    {
      open,
      onToggle,
      tool,
      inputMode,
      textObjects,
      isTextActive,
      textColor,
      textFontSize,
      textWritingMode,
      draggingTextId,
      onAddText,
      onUpdateText,
      onEditRequest,
      onBeginCrossAreaDrag,
      onBeforeStroke,
    },
    canvasRef,
  ) => {
    const scrollRef = useRef<HTMLDivElement>(null)
    const isDrawingRef = useRef(false)
    const lastPtRef = useRef({ x: 0, y: 0 })
    const lastMidRef = useRef({ x: 0, y: 0 })
    const smoothedPressureRef = useRef(1.0)
    const activeCtxRef = useRef<CanvasRenderingContext2D | null>(null)
    // Touch-scroll tracking (AUTO/PAN mode, touch only)
    const isTouchScrollingRef = useRef(false)
    const touchScrollLastYRef = useRef(0)

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

    const applyTool = useCallback(
      (ctx: CanvasRenderingContext2D, pressure: number) => {
        ctx.globalCompositeOperation =
          tool.type === 'eraser' ? 'destination-out' : 'source-over'
        ctx.strokeStyle = tool.color
        ctx.lineWidth = tool.size * pressure
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
      },
      [tool],
    )

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (isTextActive) return
        if (e.pointerType === 'touch' && !e.isPrimary) return

        // In AUTO/PAN mode, touch → manual scroll; pen/mouse → draw
        if (e.pointerType === 'touch' && (inputMode === 'auto' || inputMode === 'pan')) {
          isTouchScrollingRef.current = true
          touchScrollLastYRef.current = e.clientY
          e.currentTarget.setPointerCapture(e.pointerId)
          return
        }

        e.currentTarget.setPointerCapture(e.pointerId)

        const canvas = (canvasRef as React.RefObject<HTMLCanvasElement>).current
        if (!canvas) return
        const ctx = canvas.getContext('2d', { desynchronized: true })
        if (!ctx) return

        onBeforeStroke?.({ kind: 'memo' })

        const pt = getCanvasCoords(e.clientX, e.clientY)
        const pressure = e.pointerType === 'pen' ? Math.max(0.1, e.pressure) : 1.0
        smoothedPressureRef.current = pressure

        // Draw initial dot
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, (tool.size / 2) * pressure, 0, Math.PI * 2)
        ctx.fillStyle =
          tool.type === 'eraser' ? 'rgba(0,0,0,1)' : tool.color
        ctx.globalCompositeOperation =
          tool.type === 'eraser' ? 'destination-out' : 'source-over'
        ctx.fill()

        isDrawingRef.current = true
        lastPtRef.current = pt
        lastMidRef.current = pt
        activeCtxRef.current = ctx
      },
      [canvasRef, applyTool, getCanvasCoords, tool, isTextActive, inputMode, onBeforeStroke],
    )

    const handlePointerMove = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (e.pointerType === 'touch' && !e.isPrimary) return

        if (isTouchScrollingRef.current) {
          const dy = touchScrollLastYRef.current - e.clientY
          touchScrollLastYRef.current = e.clientY
          if (scrollRef.current) scrollRef.current.scrollTop += dy
          return
        }

        if (!isDrawingRef.current || !activeCtxRef.current) return

        const pt = getCanvasCoords(e.clientX, e.clientY)
        const ctx = activeCtxRef.current
        const pressure = e.pointerType === 'pen' ? Math.max(0.1, e.pressure) : 1.0
        smoothedPressureRef.current =
          smoothedPressureRef.current * (1 - PRESSURE_ALPHA) + pressure * PRESSURE_ALPHA
        applyTool(ctx, smoothedPressureRef.current)

        const mid = {
          x: (lastPtRef.current.x + pt.x) / 2,
          y: (lastPtRef.current.y + pt.y) / 2,
        }
        ctx.beginPath()
        ctx.moveTo(lastMidRef.current.x, lastMidRef.current.y)
        ctx.quadraticCurveTo(lastPtRef.current.x, lastPtRef.current.y, mid.x, mid.y)
        ctx.stroke()
        lastPtRef.current = pt
        lastMidRef.current = mid
      },
      [applyTool, getCanvasCoords],
    )

    const handlePointerUp = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (isTouchScrollingRef.current) {
          isTouchScrollingRef.current = false
          e.currentTarget.releasePointerCapture(e.pointerId)
          return
        }
        if (!isDrawingRef.current) return

        // Draw final segment to pointer-up position
        if (activeCtxRef.current) {
          const pt = getCanvasCoords(e.clientX, e.clientY)
          const ctx = activeCtxRef.current
          const pressure = e.pointerType === 'pen' ? Math.max(0.1, e.pressure) : 1.0
          smoothedPressureRef.current =
            smoothedPressureRef.current * (1 - PRESSURE_ALPHA) + pressure * PRESSURE_ALPHA
          applyTool(ctx, smoothedPressureRef.current)
          ctx.beginPath()
          ctx.moveTo(lastMidRef.current.x, lastMidRef.current.y)
          ctx.quadraticCurveTo(lastPtRef.current.x, lastPtRef.current.y, pt.x, pt.y)
          ctx.stroke()
        }

        isDrawingRef.current = false
        activeCtxRef.current = null
        e.currentTarget.releasePointerCapture(e.pointerId)
      },
      [applyTool, getCanvasCoords],
    )

    return (
      <div className="memo-sidebar">
        <div
          className={`memo-sidebar__panel${open ? '' : ' memo-sidebar__panel--collapsed'}`}
        >
          <div className="memo-sidebar__header">メモ</div>
          <div className="memo-sidebar__scroll" ref={scrollRef}>
            <div className="memo-sidebar__canvas-wrap">
              <canvas
                ref={canvasRef}
                className="memo-sidebar__canvas"
                style={{ touchAction: 'none', backgroundColor: '#fffef8' }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              />
              <TextLayer
                objects={textObjects}
                isActive={isTextActive}
                canvasWidth={MEMO_CANVAS_WIDTH}
                canvasHeight={MEMO_CANVAS_HEIGHT}
                spread={0}
                side="memo"
                color={textColor}
                fontSize={textFontSize}
                writingMode={textWritingMode}
                draggingId={draggingTextId}
                onAdd={onAddText}
                onUpdate={onUpdateText}
                onEditRequest={onEditRequest}
                onBeginCrossAreaDrag={onBeginCrossAreaDrag}
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
  },
)

MemoSidebar.displayName = 'MemoSidebar'
export default MemoSidebar

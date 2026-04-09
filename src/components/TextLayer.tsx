import { useRef, useCallback } from 'react'
import type { TextObject, TextWritingMode } from '../types'
import '../styles/TextLayer.css'

interface TextLayerProps {
  objects: TextObject[]
  isActive: boolean
  canvasWidth: number
  canvasHeight: number
  spread: number
  side: 'left' | 'right' | 'memo'
  color: string
  fontSize: number
  writingMode: TextWritingMode
  /** ID of text object currently being dragged cross-area (hide it here, show ghost in App) */
  draggingId?: string
  onAdd: (obj: TextObject) => void
  onUpdate: (id: string, updates: Partial<Pick<TextObject, 'x' | 'y' | 'text'>>) => void
  /** Called when user taps on empty area or existing text object — opens the portal editor */
  onEditRequest: (id: string, screenX: number, screenY: number) => void
  /** Called when a drag gesture leaves this layer's bounds — App takes over the drag */
  onBeginCrossAreaDrag?: (obj: TextObject, pointerId: number, clientX: number, clientY: number, grabOffsetX: number, grabOffsetY: number) => void
}

export default function TextLayer({
  objects,
  isActive,
  canvasWidth,
  canvasHeight,
  spread,
  side,
  color,
  fontSize,
  writingMode,
  draggingId,
  onAdd,
  onUpdate,
  onEditRequest,
  onBeginCrossAreaDrag,
}: TextLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null)

  const clientToCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const rect = layerRef.current!.getBoundingClientRect()
      const x = (clientX - rect.left) * (canvasWidth / rect.width)
      const y = (clientY - rect.top) * (canvasHeight / rect.height)
      return { x, y }
    },
    [canvasWidth, canvasHeight],
  )

  // Tap on empty layer area → create new text object then open editor
  const handleLayerPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isActive) return
      if (e.target !== e.currentTarget) return // hit an existing text item

      const { x, y } = clientToCanvas(e.clientX, e.clientY)
      const id = crypto.randomUUID()
      onAdd({ id, x, y, text: '', fontSize, color, writingMode, spread, side })
      onEditRequest(id, e.clientX, e.clientY)
      e.stopPropagation()
    },
    [isActive, clientToCanvas, fontSize, color, writingMode, spread, side, onAdd, onEditRequest],
  )

  return (
    <div
      ref={layerRef}
      className={`text-layer${isActive ? ' text-layer--active' : ''}${draggingId ? ' text-layer--dragging' : ''}`}
      onPointerDown={handleLayerPointerDown}
    >
      {objects.map(obj => (
        <TextItem
          key={obj.id}
          obj={obj}
          isActive={isActive}
          canvasWidth={canvasWidth}
          hidden={obj.id === draggingId}
          onMove={(x, y) => onUpdate(obj.id, { x, y })}
          onEditRequest={(sx, sy) => onEditRequest(obj.id, sx, sy)}
          onBeginCrossAreaDrag={onBeginCrossAreaDrag}
        />
      ))}
    </div>
  )
}

// ── TextItem ───────────────────────────────────────────────────────────────

interface TextItemProps {
  obj: TextObject
  isActive: boolean
  canvasWidth: number
  hidden?: boolean
  onMove: (x: number, y: number) => void
  onEditRequest: (screenX: number, screenY: number) => void
  onBeginCrossAreaDrag?: (obj: TextObject, pointerId: number, clientX: number, clientY: number, grabOffsetX: number, grabOffsetY: number) => void
}

function TextItem({ obj, isActive, canvasWidth, hidden, onMove, onEditRequest, onBeginCrossAreaDrag }: TextItemProps) {
  const elemRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    startPx: number
    startPy: number
    origX: number
    origY: number
    grabOffsetX: number  // pointer offset from text box top-left, in screen px
    grabOffsetY: number
    scale: number
    moved: boolean
    pointerId: number
  } | null>(null)

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isActive) return
    e.stopPropagation()

    const layer = (e.currentTarget as HTMLElement).closest('.text-layer') as HTMLElement
    const rect = layer.getBoundingClientRect()
    const scale = rect.width / canvasWidth
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = {
      startPx: e.clientX,
      startPy: e.clientY,
      origX: obj.x,
      origY: obj.y,
      grabOffsetX: e.clientX - (rect.left + obj.x * scale),
      grabOffsetY: e.clientY - (rect.top  + obj.y * scale),
      scale,
      moved: false,
      pointerId: e.pointerId,
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    const dx = (e.clientX - dragRef.current.startPx) / dragRef.current.scale
    const dy = (e.clientY - dragRef.current.startPy) / dragRef.current.scale
    if (Math.abs(dx) + Math.abs(dy) > 3) {
      dragRef.current.moved = true

      // Detect if pointer left the layer bounds → switch to cross-area drag
      if (onBeginCrossAreaDrag) {
        const layer = (e.currentTarget as HTMLElement).closest('.text-layer') as HTMLElement
        const layerRect = layer.getBoundingClientRect()
        const outside =
          e.clientX < layerRect.left - 10 || e.clientX > layerRect.right + 10 ||
          e.clientY < layerRect.top - 10 || e.clientY > layerRect.bottom + 10
        if (outside) {
          const { pointerId: pid, grabOffsetX, grabOffsetY } = dragRef.current
          dragRef.current = null
          ;(e.currentTarget as HTMLElement).releasePointerCapture(pid)
          onBeginCrossAreaDrag(obj, pid, e.clientX, e.clientY, grabOffsetX, grabOffsetY)
          return
        }
      }

      onMove(dragRef.current.origX + dx, dragRef.current.origY + dy)
    }
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    const wasMoved = dragRef.current.moved
    dragRef.current = null
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    if (!wasMoved) onEditRequest(e.clientX, e.clientY)
  }

  if (!obj.text.trim()) return null

  return (
    <div
      ref={elemRef}
      className={`text-item${isActive ? ' text-item--active' : ''}`}
      style={{
        position: 'absolute',
        left: obj.x,
        top: obj.y,
        writingMode: obj.writingMode as 'horizontal-tb' | 'vertical-rl',
        fontSize: obj.fontSize,
        color: obj.color,
        lineHeight: 1.5,
        fontFamily:
          '"Hiragino Mincho ProN", "游明朝", YuMincho, "ヒラギノ明朝 ProN", serif',
        whiteSpace: 'pre',
        zIndex: 5,
        pointerEvents: isActive ? 'all' : 'none',
        userSelect: 'none',
        touchAction: isActive ? 'none' : 'auto',
        cursor: isActive ? 'move' : 'default',
        opacity: hidden ? 0 : 1,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {obj.text}
    </div>
  )
}

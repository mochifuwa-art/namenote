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
  onAdd: (obj: TextObject) => void
  onUpdate: (id: string, updates: Partial<Pick<TextObject, 'x' | 'y' | 'text'>>) => void
  /** Called when user taps on empty area or existing text object — opens the portal editor */
  onEditRequest: (id: string, screenX: number, screenY: number) => void
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
  onAdd,
  onUpdate,
  onEditRequest,
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
      className={`text-layer${isActive ? ' text-layer--active' : ''}`}
      onPointerDown={handleLayerPointerDown}
    >
      {objects.map(obj => (
        <TextItem
          key={obj.id}
          obj={obj}
          isActive={isActive}
          canvasWidth={canvasWidth}
          onMove={(x, y) => onUpdate(obj.id, { x, y })}
          onEditRequest={(sx, sy) => onEditRequest(obj.id, sx, sy)}
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
  onMove: (x: number, y: number) => void
  onEditRequest: (screenX: number, screenY: number) => void
}

function TextItem({ obj, isActive, canvasWidth, onMove, onEditRequest }: TextItemProps) {
  const dragRef = useRef<{
    startPx: number
    startPy: number
    origX: number
    origY: number
    scale: number
    moved: boolean
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
      scale,
      moved: false,
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    const dx = (e.clientX - dragRef.current.startPx) / dragRef.current.scale
    const dy = (e.clientY - dragRef.current.startPy) / dragRef.current.scale
    if (Math.abs(dx) + Math.abs(dy) > 3) {
      dragRef.current.moved = true
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
        cursor: isActive ? 'move' : 'default',
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

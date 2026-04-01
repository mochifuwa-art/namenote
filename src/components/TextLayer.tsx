import { useState, useRef, useEffect, useCallback } from 'react'
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
  onDelete: (id: string) => void
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
  onDelete,
}: TextLayerProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
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

  // Click on empty layer area → create new text object
  const handleLayerPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isActive) return
      if (e.target !== e.currentTarget) return // clicked on an existing text item

      const { x, y } = clientToCanvas(e.clientX, e.clientY)
      const id = crypto.randomUUID()
      onAdd({ id, x, y, text: '', fontSize, color, writingMode, spread, side })
      setEditingId(id)
      e.stopPropagation()
    },
    [isActive, clientToCanvas, fontSize, color, writingMode, spread, side, onAdd],
  )

  const handleEditRequest = useCallback((id: string) => setEditingId(id), [])

  const handleBlur = useCallback(
    (id: string, text: string) => {
      if (!text.trim()) onDelete(id)
      setEditingId(null)
    },
    [onDelete],
  )

  // Escape to commit current edit
  useEffect(() => {
    if (!editingId) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditingId(null)
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editingId])

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
          isEditing={editingId === obj.id}
          isActive={isActive}
          canvasWidth={canvasWidth}
          onTextChange={text => onUpdate(obj.id, { text })}
          onBlur={text => handleBlur(obj.id, text)}
          onDelete={() => onDelete(obj.id)}
          onEditRequest={() => handleEditRequest(obj.id)}
          onMove={(x, y) => onUpdate(obj.id, { x, y })}
        />
      ))}
    </div>
  )
}

// ── TextItem ───────────────────────────────────────────────────────────────

interface TextItemProps {
  obj: TextObject
  isEditing: boolean
  isActive: boolean
  canvasWidth: number
  onTextChange: (text: string) => void
  onBlur: (text: string) => void
  onDelete: () => void
  onEditRequest: () => void
  onMove: (x: number, y: number) => void
}

function TextItem({
  obj,
  isEditing,
  isActive,
  canvasWidth,
  onTextChange,
  onBlur,
  onDelete,
  onEditRequest,
  onMove,
}: TextItemProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dragRef = useRef<{
    startPx: number
    startPy: number
    origX: number
    origY: number
    scale: number
    moved: boolean
  } | null>(null)

  // Auto-focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      const len = textareaRef.current.value.length
      textareaRef.current.setSelectionRange(len, len)
    }
  }, [isEditing])

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isActive || isEditing) return
    e.stopPropagation()

    // Compute CSS→canvas scale from parent text-layer element
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
    if (!wasMoved) onEditRequest()
  }

  const textStyle: React.CSSProperties = {
    writingMode: obj.writingMode as 'horizontal-tb' | 'vertical-rl',
    fontSize: obj.fontSize,
    color: obj.color,
    lineHeight: 1.5,
    fontFamily:
      '"Hiragino Mincho ProN", "游明朝", YuMincho, "ヒラギノ明朝 ProN", serif',
  }

  if (isEditing) {
    return (
      <div
        className="text-item__edit-wrap"
        style={{ left: obj.x, top: obj.y }}
      >
        <button
          className="text-item__delete"
          onPointerDown={e => { e.preventDefault(); e.stopPropagation() }}
          onClick={onDelete}
          title="テキストを削除"
        >
          ✕
        </button>
        <textarea
          ref={textareaRef}
          value={obj.text}
          onChange={e => onTextChange(e.target.value)}
          onBlur={e => onBlur(e.target.value)}
          className="text-item__editor"
          style={textStyle}
          onPointerDown={e => e.stopPropagation()}
          onKeyDown={e => {
            if (e.key === 'Escape') e.currentTarget.blur()
          }}
        />
      </div>
    )
  }

  if (!obj.text.trim()) return null

  return (
    <div
      className={`text-item${isActive ? ' text-item--active' : ''}`}
      style={{
        position: 'absolute',
        left: obj.x,
        top: obj.y,
        ...textStyle,
        whiteSpace: 'pre',
        zIndex: 5,
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

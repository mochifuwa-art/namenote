import { useRef, useEffect, useCallback } from 'react'
import type { TextWritingMode } from '../types'
import '../styles/TextEditor.css'

const TEXT_FONT_SIZES = [10, 14, 18, 24, 32, 48]

interface TextEditorProps {
  id: string
  initialText: string
  fontSize: number
  writingMode: TextWritingMode
  color: string
  screenX: number
  screenY: number
  onUpdate: (id: string, updates: { text?: string; fontSize?: number; writingMode?: TextWritingMode }) => void
  onDelete: (id: string) => void
  onClose: () => void
}

export default function TextEditor({
  id,
  initialText,
  fontSize,
  writingMode,
  color,
  screenX,
  screenY,
  onUpdate,
  onDelete,
  onClose,
}: TextEditorProps) {
  const textRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const ta = textRef.current
    if (!ta) return
    ta.focus()
    ta.selectionStart = ta.selectionEnd = ta.value.length
  }, [])

  const handleClose = useCallback(() => {
    const text = textRef.current?.value ?? initialText
    if (!text.trim()) onDelete(id)
    onClose()
  }, [id, initialText, onDelete, onClose])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      handleClose()
    }
    e.stopPropagation()
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdate(id, { text: e.target.value })
  }

  // Clamp position to keep editor within viewport
  const PANEL_W = 250
  const PANEL_H = 190
  const x = Math.min(screenX, window.innerWidth - PANEL_W - 8)
  const y = Math.max(8, Math.min(screenY, window.innerHeight - PANEL_H - 8))

  return (
    <>
      <div className="text-editor-backdrop" onPointerDown={handleClose} />
      <div
        className="text-editor"
        style={{ left: x, top: y }}
        onPointerDown={e => e.stopPropagation()}
      >
        <div className="text-editor-toolbar">
          <div className="text-editor-sizes">
            {TEXT_FONT_SIZES.map(s => (
              <button
                key={s}
                className={`text-editor-size-btn${fontSize === s ? ' active' : ''}`}
                onPointerDown={e => e.preventDefault()}
                onClick={() => onUpdate(id, { fontSize: s })}
                title={`${s}px`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="text-editor-sep" />
          <button
            className={`text-editor-mode-btn${writingMode === 'horizontal-tb' ? ' active' : ''}`}
            onPointerDown={e => e.preventDefault()}
            onClick={() => onUpdate(id, { writingMode: 'horizontal-tb' })}
            title="横書き"
          >横</button>
          <button
            className={`text-editor-mode-btn${writingMode === 'vertical-rl' ? ' active' : ''}`}
            onPointerDown={e => e.preventDefault()}
            onClick={() => onUpdate(id, { writingMode: 'vertical-rl' })}
            title="縦書き"
          >縦</button>
          <div className="text-editor-sep" />
          <button
            className="text-editor-delete-btn"
            onPointerDown={e => e.preventDefault()}
            onClick={() => { onDelete(id); onClose() }}
            title="テキストを削除"
          >✕</button>
        </div>
        <textarea
          ref={textRef}
          className="text-editor-textarea"
          defaultValue={initialText}
          autoFocus
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          style={{
            writingMode: writingMode as 'horizontal-tb' | 'vertical-rl',
            fontSize,
            color,
            fontFamily: '"Hiragino Mincho ProN", "游明朝", YuMincho, "ヒラギノ明朝 ProN", serif',
          }}
          placeholder="テキストを入力..."
        />
      </div>
    </>
  )
}

import { useState, useRef } from 'react'
import type { DrawingTool, SaveStatus } from '../types'
import { type ToolType } from '../types'
import '../styles/Toolbar.css'

const PRESET_COLORS = [
  '#1a1a1a', '#444444', '#888888', '#cccccc', '#ffffff',
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6',
]

const BRUSH_SIZES = [1, 2, 4, 6, 10, 16, 24]

interface ToolbarProps {
  tool: DrawingTool
  onToolChange: (t: DrawingTool) => void
  currentSpread: number
  totalSpreads: number
  onPrevSpread: () => void
  onNextSpread: () => void
  onAddSpread: () => void
  saveStatus: SaveStatus
  onSave: () => void
  onExportSpreadJpg: () => void
  onExportAllPdf: () => void
  onSaveProjectFile: () => void
  onLoadProjectFile: (file: File) => void
  selectionActive: boolean
  onCut: () => void
  onCopy: () => void
  onPaste: () => void
  onDeleteSelection: () => void
  hasClipboard: boolean
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

export default function Toolbar({
  tool,
  onToolChange,
  currentSpread,
  totalSpreads,
  onPrevSpread,
  onNextSpread,
  onAddSpread,
  saveStatus,
  onSave,
  onExportSpreadJpg,
  onExportAllPdf,
  onSaveProjectFile,
  onLoadProjectFile,
  selectionActive,
  onCut,
  onCopy,
  onPaste,
  onDeleteSelection,
  hasClipboard,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: ToolbarProps) {
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [colorPopupLeft, setColorPopupLeft] = useState(12)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const colorGroupRef = useRef<HTMLDivElement>(null)

  const setToolType = (type: ToolType) => onToolChange({ ...tool, type })
  const setColor = (color: string) => { onToolChange({ ...tool, type: 'pen', color }); setShowColorPicker(false) }
  const setSize = (size: number) => onToolChange({ ...tool, size })

  const saveIndicator = saveStatus === 'saved' ? '●' : saveStatus === 'saving' ? '◌' : '●'
  const saveColor = saveStatus === 'saved' ? '#888' : saveStatus === 'saving' ? '#f39c12' : '#e74c3c'

  return (
    <div
      className="toolbar"
      onPointerDown={e => e.stopPropagation()}
    >
      {/* Undo / Redo */}
      <div className="toolbar-group">
        <button className="tool-btn" onClick={onUndo} disabled={!canUndo} title="元に戻す (Ctrl+Z)">↩</button>
        <button className="tool-btn" onClick={onRedo} disabled={!canRedo} title="やり直す (Ctrl+Shift+Z)">↪</button>
      </div>

      <div className="toolbar-sep" />

      {/* Tool buttons */}
      <div className="toolbar-group">
        <button
          className={`tool-btn ${tool.type === 'pen' ? 'active' : ''}`}
          onClick={() => setToolType('pen')}
          title="ペン (P)"
        >
          ✏️
        </button>
        <button
          className={`tool-btn ${tool.type === 'eraser' ? 'active' : ''}`}
          onClick={() => setToolType('eraser')}
          title="消しゴム (E)"
        >
          🧹
        </button>
        <button
          className={`tool-btn ${tool.type === 'lasso' ? 'active' : ''}`}
          onClick={() => setToolType('lasso')}
          title="なげなわ選択 (L)"
        >
          🔲
        </button>
      </div>

      <div className="toolbar-sep" />

      {/* Color */}
      <div className="toolbar-group" ref={colorGroupRef}>
        <button
          className="color-btn"
          style={{ background: tool.color, outline: showColorPicker ? '2px solid #fff' : 'none' }}
          onClick={() => {
            const left = colorGroupRef.current?.getBoundingClientRect().left ?? 12
            setColorPopupLeft(left)
            setShowColorPicker(v => !v)
            setShowExportMenu(false)
          }}
          title="色"
        />
        {showColorPicker && (
          <div className="color-popup" style={{ left: colorPopupLeft }}>
            <div className="color-grid">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  className="color-swatch"
                  style={{ background: c, outline: c === tool.color ? '2px solid #60a5fa' : 'none' }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
            <input
              type="color"
              value={tool.color}
              onChange={e => onToolChange({ ...tool, color: e.target.value, type: 'pen' })}
              style={{ width: '100%', marginTop: 6, cursor: 'pointer' }}
            />
          </div>
        )}
      </div>

      {/* Size */}
      <div className="toolbar-group size-group">
        {BRUSH_SIZES.map(s => (
          <button
            key={s}
            className={`size-btn ${tool.size === s ? 'active' : ''}`}
            onClick={() => setSize(s)}
            title={`${s}px`}
          >
            <span style={{ width: Math.min(s, 14), height: Math.min(s, 14), borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
          </button>
        ))}
      </div>

      <div className="toolbar-sep" />

      {/* Selection actions (visible when lasso is active) */}
      {tool.type === 'lasso' && (
        <>
          <div className="toolbar-group">
            <button className="tool-btn" onClick={onCut} disabled={!selectionActive} title="切り取り (Ctrl+X)">✂️</button>
            <button className="tool-btn" onClick={onCopy} disabled={!selectionActive} title="コピー (Ctrl+C)">📋</button>
            <button className="tool-btn" onClick={onPaste} disabled={!hasClipboard} title="貼り付け (Ctrl+V)">📌</button>
            <button className="tool-btn" onClick={onDeleteSelection} disabled={!selectionActive} title="削除 (Del)">🗑️</button>
          </div>
          <div className="toolbar-sep" />
        </>
      )}

      {/* Page navigation — 右綴じ: 前へ=▶(右方向/表紙側)、次へ=◀(左方向/奥側) */}
      <div className="toolbar-group">
        <button className="nav-btn" onClick={onNextSpread} disabled={currentSpread === totalSpreads - 1} title="次のページ（左方向）">◀</button>
        <span className="spread-label">{currentSpread + 1} / {totalSpreads}</span>
        <button className="nav-btn" onClick={onPrevSpread} disabled={currentSpread === 0} title="前のページ（右方向）">▶</button>
        <button className="nav-btn add-btn" onClick={onAddSpread} title="スプレッド追加">＋</button>
      </div>

      <div className="toolbar-sep" />

      {/* Save */}
      <div className="toolbar-group">
        <button className="tool-btn save-btn" onClick={onSave} title="プロジェクトをファイルに保存">
          <span style={{ color: saveColor, marginRight: 4 }}>{saveIndicator}</span>保存
        </button>
      </div>

      {/* Export */}
      <div className="toolbar-group" style={{ position: 'relative' }}>
        <button
          className="tool-btn"
          onClick={() => { setShowExportMenu(v => !v); setShowColorPicker(false) }}
          title="書き出し"
        >
          書き出し ▲
        </button>
        {showExportMenu && (
          <div className="export-menu">
            <button onClick={() => { onExportSpreadJpg(); setShowExportMenu(false) }}>このスプレッドをJPG</button>
            <button onClick={() => { onExportAllPdf(); setShowExportMenu(false) }}>全ページをPDF</button>
            <div className="export-sep" />
            <button onClick={() => { onSaveProjectFile(); setShowExportMenu(false) }}>プロジェクト保存 (.namenote)</button>
            <button onClick={() => { fileInputRef.current?.click(); setShowExportMenu(false) }}>プロジェクトを開く…</button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".namenote,application/json"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) onLoadProjectFile(file)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}

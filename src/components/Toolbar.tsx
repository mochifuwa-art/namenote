import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { DrawingTool, SaveStatus, TextWritingMode } from '../types'
import { type ToolType } from '../types'
import '../styles/Toolbar.css'

const PRESET_COLORS = [
  '#1a1a1a', '#444444', '#888888', '#cccccc', '#ffffff',
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6',
]

const BRUSH_SIZES = [1, 2, 4, 6, 10, 16, 24]
const TEXT_FONT_SIZES = [10, 14, 18, 24, 32, 48]

interface ToolbarProps {
  tool: DrawingTool
  onToolChange: (t: DrawingTool) => void
  onPrevSpread: () => void
  onNextSpread: () => void
  onAddSpread: () => void
  saveStatus: SaveStatus
  onSave: () => void
  onExportSpreadJpg: () => void
  onExportAllPdf: () => void
  onSaveProjectFile: () => void
  onLoadProjectFile: (file: File) => void
  onImportPdf: (file: File) => void
  onResetNotebook: () => void
  navLabel: string
  prevDisabled: boolean
  nextDisabled: boolean
  selectionActive: boolean
  onCut: () => void
  onCopy: () => void
  onMove: () => void
  onPaste: () => void
  onDeleteSelection: () => void
  hasClipboard: boolean
  isPasting: boolean
  onConfirmPaste: () => void
  onCancelPaste: () => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onOpenOverview: () => void
  // Text tool props
  writingMode: TextWritingMode
  onWritingModeChange: (mode: TextWritingMode) => void
  textFontSize: number
  onTextFontSizeChange: (size: number) => void
}

export default function Toolbar({
  tool,
  onToolChange,
  onPrevSpread,
  onNextSpread,
  onAddSpread,
  saveStatus,
  onSave,
  onExportSpreadJpg,
  onExportAllPdf,
  onSaveProjectFile,
  onLoadProjectFile,
  onImportPdf,
  onResetNotebook,
  navLabel,
  prevDisabled,
  nextDisabled,
  selectionActive,
  onCut,
  onCopy,
  onMove,
  onPaste,
  onDeleteSelection,
  hasClipboard,
  isPasting,
  onConfirmPaste,
  onCancelPaste,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenOverview,
  writingMode,
  onWritingModeChange,
  textFontSize,
  onTextFontSizeChange,
}: ToolbarProps) {
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [colorPopupLeft, setColorPopupLeft] = useState(12)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const colorGroupRef = useRef<HTMLDivElement>(null)

  const setToolType = (type: ToolType) => onToolChange({ ...tool, type })
  const setColor = (color: string) => {
    // Keep current tool type when picking color (don't switch text→pen)
    onToolChange({ ...tool, color: color, type: tool.type === 'text' ? 'text' : 'pen' })
    setShowColorPicker(false)
  }
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
        <button className="tool-btn tool-btn--labeled" onClick={onUndo} disabled={!canUndo}>
          ↩<span className="tool-label">戻す</span>
        </button>
        <button className="tool-btn tool-btn--labeled" onClick={onRedo} disabled={!canRedo}>
          ↪<span className="tool-label">やり直</span>
        </button>
      </div>

      <div className="toolbar-sep" />

      {/* Tool buttons */}
      <div className="toolbar-group">
        <button
          className={`tool-btn tool-btn--labeled ${tool.type === 'pen' ? 'active' : ''}`}
          onClick={() => setToolType('pen')}
        >
          ✏️<span className="tool-label">ペン</span>
        </button>
        <button
          className={`tool-btn tool-btn--labeled ${tool.type === 'eraser' ? 'active' : ''}`}
          onClick={() => setToolType('eraser')}
        >
          🧹<span className="tool-label">消しゴム</span>
        </button>
        <button
          className={`tool-btn tool-btn--labeled ${tool.type === 'lasso' ? 'active' : ''}`}
          onClick={() => setToolType('lasso')}
        >
          🔲<span className="tool-label">選択</span>
        </button>
        <button
          className={`tool-btn tool-btn--labeled ${tool.type === 'text' ? 'active' : ''}`}
          onClick={() => setToolType('text')}
        >
          Ａ<span className="tool-label">テキスト</span>
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
        {showColorPicker && createPortal(
          <>
            <div className="popup-backdrop" onClick={() => setShowColorPicker(false)} />
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
                onChange={e => onToolChange({ ...tool, color: e.target.value, type: tool.type === 'text' ? 'text' : 'pen' })}
                style={{ width: '100%', marginTop: 6, cursor: 'pointer' }}
              />
            </div>
          </>,
          document.body,
        )}
      </div>

      {/* Size / Font size — text tool shows font sizes, others show brush sizes */}
      {tool.type === 'text' ? (
        <>
          <div className="toolbar-group size-group">
            {TEXT_FONT_SIZES.map(s => (
              <button
                key={s}
                className={`size-btn ${textFontSize === s ? 'active' : ''}`}
                onClick={() => onTextFontSizeChange(s)}
                title={`${s}pt`}
                style={{ fontSize: 11, minWidth: 26 }}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="toolbar-sep" />
          {/* Writing mode toggle */}
          <div className="toolbar-group">
            <button
              className={`tool-btn ${writingMode === 'horizontal-tb' ? 'active' : ''}`}
              onClick={() => onWritingModeChange('horizontal-tb')}
              title="横書き"
            >
              横書き
            </button>
            <button
              className={`tool-btn ${writingMode === 'vertical-rl' ? 'active' : ''}`}
              onClick={() => onWritingModeChange('vertical-rl')}
              title="縦書き"
            >
              縦書き
            </button>
          </div>
        </>
      ) : (
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
      )}

      <div className="toolbar-sep" />

      {/* ペースト確定/キャンセル */}
      {isPasting && (
        <>
          <div className="toolbar-sep" />
          <div className="toolbar-group">
            <button
              className="tool-btn"
              onClick={onConfirmPaste}
              style={{ background: 'rgba(59,130,246,0.85)', color: '#fff', fontWeight: 700, padding: '0 14px', fontSize: 13 }}
              title="ペーストを確定"
            >確定</button>
            <button
              className="tool-btn"
              onClick={onCancelPaste}
              style={{ color: 'rgba(248,113,113,0.9)', fontSize: 13 }}
              title="ペーストをキャンセル"
            >✕ キャンセル</button>
          </div>
          <div className="toolbar-sep" />
        </>
      )}

      {/* Selection actions */}
      {tool.type === 'lasso' && !isPasting && (
        <>
          <div className="toolbar-group">
            <button className="tool-btn" onClick={onCut} disabled={!selectionActive} title="切り取り">✂️</button>
            <button className="tool-btn" onClick={onCopy} disabled={!selectionActive} title="コピー">📋</button>
            <button className="tool-btn" onClick={onMove} disabled={!selectionActive} title="移動" style={{ fontSize: 11 }}>移動</button>
            <button className="tool-btn" onClick={onPaste} disabled={!hasClipboard} title="貼り付け">📌</button>
            <button className="tool-btn" onClick={onDeleteSelection} disabled={!selectionActive} title="削除">🗑️</button>
          </div>
          <div className="toolbar-sep" />
        </>
      )}

      {/* Page navigation */}
      <div className="toolbar-group">
        <button className="nav-btn" onClick={onNextSpread} disabled={nextDisabled} title="次のページ">◀</button>
        <span className="spread-label">{navLabel}</span>
        <button className="nav-btn" onClick={onPrevSpread} disabled={prevDisabled} title="前のページ">▶</button>
        <button className="nav-btn add-btn" onClick={onAddSpread} title="スプレッド追加">＋</button>
        <button className="tool-btn tool-btn--labeled" onClick={onOpenOverview}>
          ☰<span className="tool-label">一覧</span>
        </button>
      </div>

      <div className="toolbar-sep" />

      {/* Save */}
      <div className="toolbar-group">
        <button className="tool-btn save-btn" onClick={onSave} title="プロジェクトをファイルに保存">
          <span style={{ color: saveColor, marginRight: 4 }}>{saveIndicator}</span>保存
        </button>
      </div>

      {/* File menu */}
      <div className="toolbar-group">
        <button
          className="tool-btn"
          onClick={() => { setShowExportMenu(v => !v); setShowColorPicker(false) }}
          title="ファイル"
        >
          ファイル ▲
        </button>
        {showExportMenu && createPortal(
          <>
            <div className="popup-backdrop" onClick={() => setShowExportMenu(false)} />
            <div className="export-menu">
              <button onClick={() => { onExportSpreadJpg(); setShowExportMenu(false) }}>このスプレッドをJPG</button>
              <button onClick={() => { onExportAllPdf(); setShowExportMenu(false) }}>全ページをPDF</button>
              <div className="export-sep" />
              <button onClick={() => { onSaveProjectFile(); setShowExportMenu(false) }}>プロジェクト保存 (.namenote)</button>
              <button onClick={() => { fileInputRef.current?.click(); setShowExportMenu(false) }}>プロジェクトを開く…</button>
              <div className="export-sep" />
              <button onClick={() => { pdfInputRef.current?.click(); setShowExportMenu(false) }}>PDFを読み込む…</button>
              <div className="export-sep" />
              <button
                onClick={() => { setShowExportMenu(false); onResetNotebook() }}
                style={{ color: '#f87171' }}
              >ノートを初期化…</button>
            </div>
          </>,
          document.body,
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
        <input
          ref={pdfInputRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) onImportPdf(file)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}

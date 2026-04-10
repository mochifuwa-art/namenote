import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { DrawingTool, SaveStatus, TextWritingMode, InputMode } from '../types'
import { type ToolType } from '../types'
import '../styles/Toolbar.css'

// On iOS/Android (Capacitor WebView) the Files app may not recognize the
// custom .namenote extension, so show all files and validate after selection.
const isNative = !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
  .Capacitor?.isNativePlatform?.()

const PRESET_COLORS = [
  '#1a1a1a', '#444444', '#888888', '#cccccc', '#ffffff',
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6',
]

const TEXT_FONT_SIZES = [10, 14, 18, 24, 32, 48]

// ── SVG icons ─────────────────────────────────────────────────────────────
const IconPen = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 1.5l2.5 2.5-8 8L3 13l.5-2.5 7.5-9z"/>
    <path d="M9.5 3l2.5 2.5"/>
  </svg>
)

const IconEraser = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11.5 4L8 7.5l-4 4H8l5.5-5.5L11.5 4z"/>
    <path d="M2 13h11"/>
    <path d="M4 11.5L2 13"/>
  </svg>
)

const IconLasso = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 1.5">
    <rect x="2.5" y="2.5" width="10" height="10" rx="2"/>
  </svg>
)

const IconText = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
    <path d="M3 3h9v2H9v7H6V5H3V3z"/>
  </svg>
)

const IconUndo = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6H9.5a3 3 0 010 6H6"/>
    <path d="M4 6L2 4M4 6L2 8"/>
  </svg>
)

const IconRedo = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 6H5.5a3 3 0 000 6H9"/>
    <path d="M11 6l2-2M11 6l2 2"/>
  </svg>
)

const IconOverview = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
    <rect x="1.5" y="1.5" width="4.5" height="4.5" rx="1"/>
    <rect x="8" y="1.5" width="4.5" height="4.5" rx="1"/>
    <rect x="1.5" y="8" width="4.5" height="4.5" rx="1"/>
    <rect x="8" y="8" width="4.5" height="4.5" rx="1"/>
  </svg>
)

const IconAuto = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round">
    <circle cx="6.5" cy="6.5" r="4.5"/>
    <path d="M6.5 4v2.5l1.5 1.5"/>
  </svg>
)

const IconDraw = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 1.5l2 2-6 6L3 11l1.5-2.5 5-7z"/>
  </svg>
)

const IconPan = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6.5 1.5v10M1.5 6.5h10"/>
    <path d="M4 4l-2.5 2.5L4 9"/>
    <path d="M9 4l2.5 2.5L9 9"/>
    <path d="M4 4l2.5-2.5L9 4"/>
    <path d="M4 9l2.5 2.5L9 9"/>
  </svg>
)

const IconFile = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2H3.5A1.5 1.5 0 002 3.5v7A1.5 1.5 0 003.5 12h7A1.5 1.5 0 0012 10.5V6L8 2z"/>
    <path d="M8 2v4h4"/>
  </svg>
)

// ── Props ──────────────────────────────────────────────────────────────────
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
  writingMode: TextWritingMode
  onWritingModeChange: (mode: TextWritingMode) => void
  textFontSize: number
  onTextFontSizeChange: (size: number) => void
  stabilizationStrength: number
  onStabilizationStrengthChange: (v: number) => void
  inputMode: InputMode
  onInputModeChange: (mode: InputMode) => void
  bindingDirection: 'right' | 'left'
  onToggleBinding: () => void
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
  stabilizationStrength,
  onStabilizationStrengthChange,
  inputMode,
  onInputModeChange,
  bindingDirection,
  onToggleBinding,
}: ToolbarProps) {
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [colorPopupLeft, setColorPopupLeft] = useState(12)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const colorGroupRef = useRef<HTMLDivElement>(null)

  const setToolType = (type: ToolType) => onToolChange({ ...tool, type })
  const setColor = (color: string) => {
    onToolChange({ ...tool, color, type: tool.type === 'text' ? 'text' : 'pen' })
    setShowColorPicker(false)
  }
  const setSize = (size: number) => onToolChange({ ...tool, size })

  const saveDotColor = saveStatus === 'saved' ? '#6b7280' : saveStatus === 'saving' ? '#f59e0b' : '#ef4444'

  const MODE_CONFIG: { id: InputMode; label: string; icon: React.ReactNode; title: string }[] = [
    { id: 'auto', label: 'AUTO', icon: <IconAuto />, title: '自動（ペン=描画 / 指=パン）' },
    { id: 'draw', label: 'DRAW', icon: <IconDraw />, title: 'すべての入力で描画' },
    { id: 'pan',  label: 'PAN',  icon: <IconPan />,  title: 'すべての入力でパン' },
  ]

  return (
    <div className="toolbar" onPointerDown={e => e.stopPropagation()}>

      {/* ── Undo / Redo ─────────────────────────────────────── */}
      <div className="toolbar-pod">
        <button className="tool-btn" onClick={onUndo} disabled={!canUndo} title="取り消し (Ctrl+Z)">
          <IconUndo />
        </button>
        <button className="tool-btn" onClick={onRedo} disabled={!canRedo} title="やり直し (Ctrl+Y)">
          <IconRedo />
        </button>
      </div>

      <div className="toolbar-sep" />

      {/* ── Input mode segmented control ────────────────────── */}
      <div className="seg-ctrl">
        {MODE_CONFIG.map(m => (
          <button
            key={m.id}
            className={`seg-btn ${inputMode === m.id ? 'active' : ''}`}
            onClick={() => onInputModeChange(m.id)}
            title={m.title}
          >
            {m.icon}
            {m.label}
          </button>
        ))}
      </div>

      <div className="toolbar-sep" />

      {/* ── Drawing tools ───────────────────────────────────── */}
      <div className="toolbar-pod">
        <button
          className={`tool-btn tool-btn--labeled ${tool.type === 'pen' ? 'active' : ''}`}
          onClick={() => setToolType('pen')}
          title="ペン"
        >
          <IconPen /><span className="tool-label">ペン</span>
        </button>
        <button
          className={`tool-btn tool-btn--labeled ${tool.type === 'eraser' ? 'active' : ''}`}
          onClick={() => setToolType('eraser')}
          title="消しゴム"
        >
          <IconEraser /><span className="tool-label">消す</span>
        </button>
        <button
          className={`tool-btn tool-btn--labeled ${tool.type === 'lasso' ? 'active' : ''}`}
          onClick={() => setToolType('lasso')}
          title="なげなわ選択"
        >
          <IconLasso /><span className="tool-label">選択</span>
        </button>
        <button
          className={`tool-btn tool-btn--labeled ${tool.type === 'text' ? 'active' : ''}`}
          onClick={() => setToolType('text')}
          title="テキスト"
        >
          <IconText /><span className="tool-label">テキスト</span>
        </button>
      </div>

      <div className="toolbar-sep" />

      {/* ── Color ───────────────────────────────────────────── */}
      <div className="toolbar-pod" ref={colorGroupRef} style={{ padding: '4px 6px' }}>
        <button
          className={`color-btn ${showColorPicker ? 'color-btn--active' : ''}`}
          style={{ background: tool.color }}
          onClick={() => {
            const left = colorGroupRef.current?.getBoundingClientRect().left ?? 12
            setColorPopupLeft(left)
            setShowColorPicker(v => !v)
            setShowExportMenu(false)
          }}
          title="色を選択"
        />
        {showColorPicker && createPortal(
          <>
            <div className="popup-backdrop" onClick={() => setShowColorPicker(false)} />
            <div className="color-popup" style={{ left: colorPopupLeft }}>
              <div className="color-grid">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    className={`color-swatch ${c === tool.color ? 'color-swatch--active' : ''}`}
                    style={{ background: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
              <input
                type="color"
                value={tool.color}
                onChange={e => onToolChange({ ...tool, color: e.target.value, type: tool.type === 'text' ? 'text' : 'pen' })}
                style={{ width: '100%', marginTop: 6, cursor: 'pointer', height: 30, borderRadius: 6, border: 'none' }}
              />
            </div>
          </>,
          document.body,
        )}
      </div>

      {/* ── Size / Font size (contextual) ───────────────────── */}
      {tool.type === 'text' ? (
        <>
          <div className="toolbar-pod" style={{ gap: 2, padding: 3 }}>
            {TEXT_FONT_SIZES.map(s => (
              <button
                key={s}
                className={`size-btn ${textFontSize === s ? 'active' : ''}`}
                onClick={() => onTextFontSizeChange(s)}
                title={`${s}pt`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="toolbar-sep" />
          <div className="toolbar-pod">
            <button
              className={`tool-btn ${writingMode === 'horizontal-tb' ? 'active' : ''}`}
              onClick={() => onWritingModeChange('horizontal-tb')}
              title="横書き"
              style={{ fontSize: 12, padding: '0 10px' }}
            >横書き</button>
            <button
              className={`tool-btn ${writingMode === 'vertical-rl' ? 'active' : ''}`}
              onClick={() => onWritingModeChange('vertical-rl')}
              title="縦書き"
              style={{ fontSize: 12, padding: '0 10px' }}
            >縦書き</button>
          </div>
        </>
      ) : (tool.type === 'pen' || tool.type === 'eraser') ? (
        <div className="toolbar-pod" style={{ padding: '0 10px', gap: 10 }}>
          <input
            type="range"
            className="size-slider"
            min={1} max={30}
            value={tool.size}
            onChange={e => setSize(parseInt(e.target.value))}
            title={`${tool.size}px`}
          />
          <span className="size-label">{tool.size}px</span>
          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
          <label className="stab-label" title="手ブレ補正（0=オフ）">
            <span className="stab-label__text">補正</span>
            <input
              type="range"
              className="stab-slider"
              min={0} max={100} step={1}
              value={stabilizationStrength}
              onChange={e => onStabilizationStrengthChange(Number(e.target.value))}
            />
            <span className="stab-label__val">{stabilizationStrength}</span>
          </label>
        </div>
      ) : null}

      <div className="toolbar-sep" />

      {/* ── Paste confirm / cancel ──────────────────────────── */}
      {isPasting && (
        <>
          <div className="toolbar-pod">
            <button
              className="tool-btn"
              onClick={onConfirmPaste}
              style={{ background: 'rgba(59,130,246,0.8)', color: '#fff', fontWeight: 700, padding: '0 14px', fontSize: 12 }}
              title="ペーストを確定"
            >確定</button>
            <button
              className="tool-btn"
              onClick={onCancelPaste}
              style={{ color: 'rgba(248,113,113,0.9)', fontSize: 12 }}
              title="キャンセル"
            >✕ キャンセル</button>
          </div>
          <div className="toolbar-sep" />
        </>
      )}

      {/* ── Selection actions ──────────────────────────────── */}
      {tool.type === 'lasso' && !isPasting && (
        <>
          <div className="toolbar-pod">
            <button className="tool-btn" onClick={onCut} disabled={!selectionActive} title="切り取り" style={{ fontSize: 15 }}>✂</button>
            <button className="tool-btn" onClick={onCopy} disabled={!selectionActive} title="コピー" style={{ fontSize: 12 }}>コピー</button>
            <button className="tool-btn" onClick={onMove} disabled={!selectionActive} title="移動" style={{ fontSize: 12 }}>移動</button>
            <button className="tool-btn" onClick={onPaste} disabled={!hasClipboard} title="貼り付け" style={{ fontSize: 12 }}>貼付</button>
            <button className="tool-btn" onClick={onDeleteSelection} disabled={!selectionActive} title="削除" style={{ color: 'rgba(248,113,113,0.85)', fontSize: 15 }}>✕</button>
          </div>
          <div className="toolbar-sep" />
        </>
      )}

      {/* ── Page navigation ─────────────────────────────────── */}
      {/* 右綴じ: ◀=次スプレッド（高インデックス）, ▶=前スプレッド（低インデックス） */}
      {/* 左綴じ: ◀=前スプレッド（低インデックス）, ▶=次スプレッド（高インデックス） */}
      <div className="toolbar-pod">
        <button
          className="nav-btn"
          onClick={bindingDirection === 'right' ? onNextSpread : onPrevSpread}
          disabled={bindingDirection === 'right' ? nextDisabled : prevDisabled}
          title={bindingDirection === 'right' ? '次のスプレッド' : '前のスプレッド'}
          style={{ fontSize: 13 }}
        >◀</button>
        <span className="spread-label">{navLabel}</span>
        <button
          className="nav-btn"
          onClick={bindingDirection === 'right' ? onPrevSpread : onNextSpread}
          disabled={bindingDirection === 'right' ? prevDisabled : nextDisabled}
          title={bindingDirection === 'right' ? '前のスプレッド' : '次のスプレッド'}
          style={{ fontSize: 13 }}
        >▶</button>
        <button className="nav-btn add-btn" onClick={onAddSpread} title="スプレッド追加" style={{ fontSize: 17 }}>＋</button>
        <button className="tool-btn" onClick={onOpenOverview} title="ページ一覧">
          <IconOverview />
        </button>
      </div>

      <div className="toolbar-sep" />

      {/* ── Save ────────────────────────────────────────────── */}
      <div className="toolbar-pod" style={{ padding: '0 4px' }}>
        <button className="tool-btn save-btn" onClick={onSave} title="保存">
          <span className="save-dot" style={{ background: saveDotColor }} />
          保存
        </button>
      </div>

      {/* ── File menu ───────────────────────────────────────── */}
      <div className="toolbar-pod" style={{ padding: '0 4px' }}>
        <button
          className="tool-btn"
          onClick={() => { setShowExportMenu(v => !v); setShowColorPicker(false) }}
          title="ファイル"
          style={{ gap: 5, padding: '0 10px', fontSize: 12 }}
        >
          <IconFile />
          ファイル
        </button>
        {showExportMenu && createPortal(
          <>
            <div className="popup-backdrop" onClick={() => setShowExportMenu(false)} />
            <div className="export-menu">
              <button onClick={() => { onExportSpreadJpg(); setShowExportMenu(false) }}>このスプレッドをJPG書き出し</button>
              <button onClick={() => { onExportAllPdf(); setShowExportMenu(false) }}>全ページをPDF書き出し</button>
              <div className="export-sep" />
              <button onClick={() => { onSaveProjectFile(); setShowExportMenu(false) }}>プロジェクト保存 (.namenote)</button>
              <button onClick={() => { fileInputRef.current?.click(); setShowExportMenu(false) }}>プロジェクトを開く…</button>
              <div className="export-sep" />
              <button onClick={() => { pdfInputRef.current?.click(); setShowExportMenu(false) }}>PDFを読み込む…</button>
              <div className="export-sep" />
              <button onClick={() => { onToggleBinding(); setShowExportMenu(false) }}>
                {bindingDirection === 'right' ? '左綴じに切り替え' : '右綴じに切り替え'}
              </button>
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
          accept={isNative ? '*/*' : '.namenote,application/json'}
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0]
            if (!file) return
            if (isNative && !file.name.endsWith('.namenote') && !file.name.endsWith('.json')) {
              alert(`${file.name} は .namenote ファイルではありません`)
              e.target.value = ''
              return
            }
            onLoadProjectFile(file)
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

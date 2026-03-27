import { useState, useRef, useEffect, useCallback } from 'react'
import type { DrawingTool, SaveStatus } from './types'
import { usePageStore } from './hooks/usePageStore'
import { useDrawing } from './hooks/useDrawing'
import { useSelection } from './hooks/useSelection'
import { exportSpreadAsJpg, exportAllAsPdf } from './utils/export'
import { saveProjectFile, loadProjectFile } from './utils/save'
import DeskCanvas from './components/DeskCanvas'
import NotebookSpread from './components/NotebookSpread'
import Toolbar from './components/Toolbar'

const SAVE_DEBOUNCE_MS = 600

export default function App() {
  const [currentSpread, setCurrentSpread] = useState(0)
  const [tool, setTool] = useState<DrawingTool>({ type: 'pen', color: '#1a1a1a', size: 3 })
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [selectionActive, setSelectionActive] = useState(false)
  const [hasClipboard, setHasClipboard] = useState(false)

  const deskCanvasRef = useRef<HTMLCanvasElement>(null)
  const leftCanvasRef = useRef<HTMLCanvasElement>(null)
  const rightCanvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const notebookRef = useRef<HTMLDivElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const pageStore = usePageStore()

  // ── Auto-save logic ──────────────────────────────────────────────
  const markUnsaved = useCallback(() => {
    setSaveStatus('unsaved')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      setSaveStatus('saving')
      pageStore.saveDesk(deskCanvasRef.current)
      pageStore.saveSpread(currentSpread, leftCanvasRef.current, rightCanvasRef.current)
      setSaveStatus('saved')
    }, SAVE_DEBOUNCE_MS)
  }, [currentSpread, pageStore])

  const saveNow = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveStatus('saving')
    pageStore.saveDesk(deskCanvasRef.current)
    pageStore.saveSpread(currentSpread, leftCanvasRef.current, rightCanvasRef.current)
    setTimeout(() => setSaveStatus('saved'), 400)
  }, [currentSpread, pageStore])

  // ── Drawing ──────────────────────────────────────────────────────
  const drawing = useDrawing({
    tool,
    deskCanvasRef,
    leftCanvasRef,
    rightCanvasRef,
    overlayRef,
    onStrokeEnd: markUnsaved,
    enabled: tool.type !== 'lasso',
  })

  // ── Selection ────────────────────────────────────────────────────
  const selection = useSelection({
    overlayCanvasRef,
    overlayDivRef: overlayRef,
    leftCanvasRef,
    rightCanvasRef,
    deskCanvasRef,
    enabled: tool.type === 'lasso',
    onSelectionChange: active => {
      setSelectionActive(active)
    },
  })

  // ── Initial load ─────────────────────────────────────────────────
  useEffect(() => {
    pageStore.loadDesk(deskCanvasRef.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Page navigation ──────────────────────────────────────────────
  const goToSpread = useCallback((next: number) => {
    saveNow()
    setCurrentSpread(next)
  }, [saveNow])

  // Load spread whenever currentSpread changes (fires on mount too, covering spread 0)
  useEffect(() => {
    pageStore.loadSpread(currentSpread, leftCanvasRef.current, rightCanvasRef.current)
  }, [currentSpread]) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePrevSpread = () => { if (currentSpread > 0) goToSpread(currentSpread - 1) }
  const handleNextSpread = () => { if (currentSpread < pageStore.getSpreadCount() - 1) goToSpread(currentSpread + 1) }
  const handleAddSpread = () => {
    saveNow()
    setCurrentSpread(pageStore.getSpreadCount())
  }

  // ── Notebook scale (fits both width and height) ──────────────────
  const computeNotebookScale = useCallback(() => {
    const NOTEBOOK_W = window.innerWidth <= 700 ? 560 : 1128
    const NOTEBOOK_H = 800
    const TOOLBAR_H = 56
    const MARGIN = 40
    const scaleW = (window.innerWidth - MARGIN) / NOTEBOOK_W
    const scaleH = (window.innerHeight - TOOLBAR_H - MARGIN) / NOTEBOOK_H
    const scale = Math.min(1, scaleW, scaleH)
    document.documentElement.style.setProperty('--notebook-scale', String(scale.toFixed(4)))
  }, [])

  // ── Window resize ────────────────────────────────────────────────
  useEffect(() => {
    computeNotebookScale()
    const handleResize = () => {
      const canvas = deskCanvasRef.current
      if (!canvas) return
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      pageStore.loadDesk(canvas)
      // Sync overlay canvas size
      if (overlayCanvasRef.current) {
        overlayCanvasRef.current.width = window.innerWidth
        overlayCanvasRef.current.height = window.innerHeight
      }
      computeNotebookScale()
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [pageStore, computeNotebookScale])

  // Set overlay canvas size on mount
  useEffect(() => {
    if (overlayCanvasRef.current) {
      overlayCanvasRef.current.width = window.innerWidth
      overlayCanvasRef.current.height = window.innerHeight
    }
  }, [])

  // ── Keyboard shortcuts ───────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'p' && !e.ctrlKey && !e.metaKey) setTool(t => ({ ...t, type: 'pen' }))
      if (e.key === 'e' && !e.ctrlKey && !e.metaKey) setTool(t => ({ ...t, type: 'eraser' }))
      if (e.key === 'l' && !e.ctrlKey && !e.metaKey) setTool(t => ({ ...t, type: 'lasso' }))
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveNow() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saveNow])

  // ── Pointer event dispatcher ─────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (tool.type === 'lasso') {
      selection.handlePointerDown(e)
    } else {
      drawing.handlePointerDown(e)
    }
  }, [tool.type, selection, drawing])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (tool.type === 'lasso') {
      selection.handlePointerMove(e)
    } else {
      drawing.handlePointerMove(e)
    }
  }, [tool.type, selection, drawing])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (tool.type === 'lasso') {
      selection.handlePointerUp(e)
    } else {
      drawing.handlePointerUp(e)
    }
  }, [tool.type, selection, drawing])

  // ── Export / Save ────────────────────────────────────────────────
  const handleExportSpreadJpg = () => {
    saveNow()
    exportSpreadAsJpg(leftCanvasRef.current, rightCanvasRef.current, currentSpread)
  }

  const handleExportAllPdf = async () => {
    saveNow()
    await exportAllAsPdf(pageStore.getSpreadCount(), pageStore.getSpreadData)
  }

  const handleSaveProjectFile = () => {
    saveNow()
    saveProjectFile(pageStore.getSpreadCount())
  }

  const handleLoadProjectFile = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const data = await loadProjectFile(file)
      pageStore.loadAllFromProjectData(
        data,
        deskCanvasRef.current,
        leftCanvasRef.current,
        rightCanvasRef.current,
        currentSpread
      )
      setCurrentSpread(0)
      setSaveStatus('saved')
    } catch (err) {
      alert(`ファイルの読み込みに失敗しました: ${(err as Error).message}`)
    }
    e.target.value = ''
  }

  // ── Selection action wrappers ─────────────────────────────────────
  const handleCut = () => {
    selection.cutSelection()
    setHasClipboard(true)
    setSelectionActive(false)
    markUnsaved()
  }
  const handleCopy = () => {
    selection.copySelection()
    setHasClipboard(true)
    setSelectionActive(false)
  }
  const handlePaste = () => {
    if (selection.hasClipboard()) {
      selection.startPaste()
    }
  }
  const handleDeleteSelection = () => {
    selection.deleteSelection()
    setSelectionActive(false)
    markUnsaved()
  }

  const cursor = tool.type === 'eraser' ? 'cell' : tool.type === 'lasso' ? 'crosshair' : 'crosshair'

  return (
    <div className="app-root">
      {/* Layer 0: Desk canvas */}
      <DeskCanvas ref={deskCanvasRef} />

      {/* Layer 1-2: Notebook spread */}
      <NotebookSpread
        ref={notebookRef}
        leftCanvasRef={leftCanvasRef}
        rightCanvasRef={rightCanvasRef}
        currentSpread={currentSpread}
        totalSpreads={pageStore.getSpreadCount()}
      />

      {/* Layer 3: Selection overlay canvas */}
      <canvas
        ref={overlayCanvasRef}
        style={{
          position: 'fixed',
          top: 0, left: 0,
          width: '100vw',
          height: '100dvh',
          zIndex: 50,
          pointerEvents: 'none',
        }}
      />

      {/* Layer 4: Event overlay div */}
      <div
        ref={overlayRef}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          cursor,
          touchAction: 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      {/* Layer 5: Toolbar */}
      <Toolbar
        tool={tool}
        onToolChange={t => { setTool(t); if (t.type !== 'lasso') selection.clearSelection() }}
        currentSpread={currentSpread}
        totalSpreads={pageStore.getSpreadCount()}
        onPrevSpread={handlePrevSpread}
        onNextSpread={handleNextSpread}
        onAddSpread={handleAddSpread}
        saveStatus={saveStatus}
        onSave={saveNow}
        onExportSpreadJpg={handleExportSpreadJpg}
        onExportAllPdf={handleExportAllPdf}
        onSaveProjectFile={handleSaveProjectFile}
        onLoadProjectFile={handleLoadProjectFile}
        selectionActive={selectionActive}
        onCut={handleCut}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onDeleteSelection={handleDeleteSelection}
        hasClipboard={hasClipboard}
      />

      {/* Hidden file input for project loading */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".namenote,application/json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  )
}

import { useState, useRef, useEffect, useCallback } from 'react'
import type { DrawingTool, SaveStatus } from './types'
import { usePageStore } from './hooks/usePageStore'
import { useDrawing } from './hooks/useDrawing'
import { useSelection } from './hooks/useSelection'
import { useHistory } from './hooks/useHistory'
import { exportSpreadAsJpg, exportAllAsPdf } from './utils/export'
import { saveProjectFile, loadProjectFile } from './utils/save'
import { importPdfPages } from './utils/pdfImport'
import { PAGE_WIDTH, PAGE_HEIGHT } from './components/PageCanvas'
import DeskCanvas from './components/DeskCanvas'
import NotebookSpread from './components/NotebookSpread'
import Toolbar from './components/Toolbar'
import Toast from './components/Toast'
import PageOverviewPanel from './components/PageOverviewPanel'

const SAVE_DEBOUNCE_MS = 600

export default function App() {
  const [currentSpread, setCurrentSpread] = useState(0)
  const [tool, setTool] = useState<DrawingTool>({ type: 'pen', color: '#1a1a1a', size: 3 })
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [selectionActive, setSelectionActive] = useState(false)
  const [hasClipboard, setHasClipboard] = useState(false)
  const [showOverview, setShowOverview] = useState(false)
  // Separate state for spread count so mutations (insert/reorder) trigger re-renders
  const [totalSpreads, setTotalSpreads] = useState(() =>
    parseInt(localStorage.getItem('namenote_spread_count') ?? '1', 10) || 1
  )

  const deskCanvasRef = useRef<HTMLCanvasElement>(null)
  const leftCanvasRef = useRef<HTMLCanvasElement>(null)
  const rightCanvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const notebookRef = useRef<HTMLDivElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Toast notification ───────────────────────────────────────────
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [toastKey, setToastKey] = useState(0)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg)
    setToastKey(k => k + 1)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 3000)
  }, [])

  const pageStore = usePageStore()
  const history = useHistory(deskCanvasRef, leftCanvasRef, rightCanvasRef)

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
    onBeforeStroke: history.push,
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
    onBeforeEdit: history.push,
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
    history.clearPageHistory()
    setCurrentSpread(next)
  }, [saveNow, history])

  // Load spread whenever currentSpread changes (fires on mount too, covering spread 0)
  useEffect(() => {
    pageStore.loadSpread(currentSpread, leftCanvasRef.current, rightCanvasRef.current)
  }, [currentSpread]) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePrevSpread = () => { if (currentSpread > 0) goToSpread(currentSpread - 1) }
  const handleNextSpread = () => { if (currentSpread < totalSpreads - 1) goToSpread(currentSpread + 1) }
  const handleAddSpread = () => {
    saveNow()
    const next = pageStore.getSpreadCount()
    setTotalSpreads(next + 1)
    setCurrentSpread(next)
  }

  // ── Overview: reorder ────────────────────────────────────────────
  const handleReorder = useCallback((from: number, to: number) => {
    saveNow()
    pageStore.reorderSpreads(from, to)
    // Adjust currentSpread if its position in the array changed
    let next = currentSpread
    if (from === currentSpread) {
      next = to
    } else if (from < currentSpread && to >= currentSpread) {
      next = currentSpread - 1
    } else if (from > currentSpread && to <= currentSpread) {
      next = currentSpread + 1
    }
    if (next !== currentSpread) {
      setCurrentSpread(next)
    } else {
      // Canvas data may have shifted under us; reload
      pageStore.loadSpread(currentSpread, leftCanvasRef.current, rightCanvasRef.current)
    }
  }, [saveNow, pageStore, currentSpread])

  // ── Overview: insert blank spread ────────────────────────────────
  const handleInsertAt = useCallback((at: number) => {
    saveNow()
    pageStore.insertSpreadAt(at)
    setTotalSpreads(t => t + 1)
    if (at <= currentSpread) {
      setCurrentSpread(currentSpread + 1)
    }
  }, [saveNow, pageStore, currentSpread])

  // ── Notebook scale (fits both width and height) ──────────────────
  const computeNotebookScale = useCallback(() => {
    const NOTEBOOK_W = window.innerWidth <= 700 ? 560 : 1128
    const NOTEBOOK_H = 800
    const TOOLBAR_H = 64
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
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); history.undo(); markUnsaved() }
      if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key === 'z' || e.key === 'y')) { e.preventDefault(); history.redo(); markUnsaved() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saveNow, history, markUnsaved])

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
    try {
      const rightPageNum = currentSpread * 2 + 1
      const filename = exportSpreadAsJpg(leftCanvasRef.current, rightCanvasRef.current, rightPageNum)
      showToast(`書き出しました：${filename}`)
    } catch (e) {
      showToast('書き出しに失敗しました')
      console.error(e)
    }
  }

  const handleExportAllPdf = () => {
    saveNow()
    try {
      const filename = exportAllAsPdf(pageStore.getSpreadCount(), pageStore.getSpreadData)
      showToast(`PDF を書き出しました：${filename}`)
    } catch (e) {
      showToast('PDF の書き出しに失敗しました')
      console.error(e)
    }
  }

  // "保存" button: save to localStorage (auto-save) AND download a project file
  const handleSaveButton = useCallback(async () => {
    saveNow()
    try {
      const filename = await saveProjectFile(pageStore.getSpreadCount())
      showToast(`保存しました：${filename}`)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') showToast('保存に失敗しました')
    }
  }, [saveNow, pageStore, showToast])

  const handleSaveProjectFile = handleSaveButton  // export menu alias

  const handleLoadProjectFile = async (file: File) => {
    try {
      const data = await loadProjectFile(file)
      pageStore.loadAllFromProjectData(
        data,
        deskCanvasRef.current,
        leftCanvasRef.current,
        rightCanvasRef.current,
        0
      )
      const loadedCount = parseInt((data as Record<string, string>)['namenote_spread_count'] ?? '1', 10) || 1
      setTotalSpreads(loadedCount)
      setCurrentSpread(0)
      setSaveStatus('saved')
      showToast(`読み込みました：${file.name}`)
    } catch (err) {
      showToast(`読み込み失敗：${(err as Error).message}`)
    }
  }

  // ── PDF import ───────────────────────────────────────────────────
  const handleImportPdf = useCallback(async (file: File) => {
    showToast('PDF読み込み中…')
    try {
      const pages = await importPdfPages(
        file,
        PAGE_WIDTH,
        PAGE_HEIGHT,
        (current, total) => showToast(`PDF読み込み中… ${current}/${total}ページ`)
      )
      saveNow()
      // 右綴じマッピング: PDF p1→スプレッド0右, p2→スプレッド0左, p3→スプレッド1右…
      const spreadsNeeded = Math.ceil(pages.length / 2)
      for (let i = 0; i < pages.length; i++) {
        const spreadIndex = Math.floor(i / 2)
        const side = i % 2 === 0 ? 'R' : 'L'
        localStorage.setItem(`namenote_page_${spreadIndex}_${side}`, pages[i])
      }
      pageStore.setSpreadCount(spreadsNeeded)
      setTotalSpreads(spreadsNeeded)
      setCurrentSpread(0)
      pageStore.loadSpread(0, leftCanvasRef.current, rightCanvasRef.current)
      showToast(`PDF読み込み完了：${pages.length}ページ`)
    } catch (e) {
      showToast('PDF読み込みに失敗しました')
      console.error(e)
    }
  }, [saveNow, pageStore, showToast])

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
        totalSpreads={totalSpreads}
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
        totalSpreads={totalSpreads}
        onPrevSpread={handlePrevSpread}
        onNextSpread={handleNextSpread}
        onAddSpread={handleAddSpread}
        saveStatus={saveStatus}
        onSave={handleSaveButton}
        onExportSpreadJpg={handleExportSpreadJpg}
        onExportAllPdf={handleExportAllPdf}
        onSaveProjectFile={handleSaveProjectFile}
        onLoadProjectFile={handleLoadProjectFile}
        onImportPdf={handleImportPdf}
        selectionActive={selectionActive}
        onCut={handleCut}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onDeleteSelection={handleDeleteSelection}
        hasClipboard={hasClipboard}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={() => { history.undo(); markUnsaved() }}
        onRedo={() => { history.redo(); markUnsaved() }}
        onOpenOverview={() => { saveNow(); setShowOverview(true) }}
      />

      {/* Page overview panel */}
      <PageOverviewPanel
        isOpen={showOverview}
        onClose={() => setShowOverview(false)}
        spreadCount={totalSpreads}
        currentSpread={currentSpread}
        onNavigate={idx => { goToSpread(idx) }}
        onReorder={handleReorder}
        onInsertAt={handleInsertAt}
        getThumbnail={pageStore.getThumbnail}
      />

      {/* Toast notification */}
      <Toast key={toastKey} message={toastMsg} />
    </div>
  )
}

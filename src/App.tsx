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
import MemoSidebar from './components/MemoSidebar'
import NotebookSpread from './components/NotebookSpread'
import Toolbar from './components/Toolbar'
import Toast from './components/Toast'
import PageOverviewPanel from './components/PageOverviewPanel'

const SAVE_DEBOUNCE_MS = 600
const SIDEBAR_W = 260

export default function App() {
  const [currentSpread, setCurrentSpread] = useState(0)
  const [tool, setTool] = useState<DrawingTool>({ type: 'pen', color: '#1a1a1a', size: 3 })
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [selectionActive, setSelectionActive] = useState(false)
  const [hasClipboard, setHasClipboard] = useState(false)
  const [isPasting, setIsPasting] = useState(false)
  const [showOverview, setShowOverview] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [notebookZoom, setNotebookZoom] = useState(1)
  const [totalSpreads, setTotalSpreads] = useState(() =>
    parseInt(localStorage.getItem('namenote_spread_count') ?? '1', 10) || 1
  )
  // スマホ単ページモード: 'R'=右ページ(奇数), 'L'=左ページ(偶数)
  const [mobileSide, setMobileSide] = useState<'R' | 'L'>('R')

  const memoCanvasRef = useRef<HTMLCanvasElement>(null)
  const leftCanvasRef = useRef<HTMLCanvasElement>(null)
  const rightCanvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const notebookRef = useRef<HTMLDivElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Pinch-to-zoom tracking
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinchInitDistRef = useRef(0)
  const pinchInitZoomRef = useRef(1)

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
  const history = useHistory(leftCanvasRef, rightCanvasRef)

  // ── Auto-save logic ──────────────────────────────────────────────
  const markUnsaved = useCallback(() => {
    setSaveStatus('unsaved')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      setSaveStatus('saving')
      pageStore.saveMemo(memoCanvasRef.current)
      pageStore.saveSpread(currentSpread, leftCanvasRef.current, rightCanvasRef.current)
      setSaveStatus('saved')
    }, SAVE_DEBOUNCE_MS)
  }, [currentSpread, pageStore])

  const saveNow = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveStatus('saving')
    pageStore.saveMemo(memoCanvasRef.current)
    pageStore.saveSpread(currentSpread, leftCanvasRef.current, rightCanvasRef.current)
    setTimeout(() => setSaveStatus('saved'), 400)
  }, [currentSpread, pageStore])

  // ── Drawing ──────────────────────────────────────────────────────
  const drawing = useDrawing({
    tool,
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
    enabled: tool.type === 'lasso',
    onBeforeEdit: history.push,
    onSelectionChange: active => {
      setSelectionActive(active)
    },
    onPasteChange: setIsPasting,
  })

  // ── Initial load ─────────────────────────────────────────────────
  useEffect(() => {
    pageStore.loadMemo(memoCanvasRef.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sidebar width CSS var + notebook scale ────────────────────────
  const computeNotebookScale = useCallback((open: boolean) => {
    const sidebarW = open ? SIDEBAR_W : 0
    const isMobileWidth = window.innerWidth <= 700
    const NOTEBOOK_W = isMobileWidth ? 560 : 1128
    const NOTEBOOK_H = 800
    const TOOLBAR_H = 64
    const MARGIN = 40
    const availableW = window.innerWidth - sidebarW - MARGIN
    const availableH = window.innerHeight - TOOLBAR_H - MARGIN
    const scale = Math.min(1, availableW / NOTEBOOK_W, availableH / NOTEBOOK_H)
    document.documentElement.style.setProperty('--notebook-scale', String(scale.toFixed(4)))
    document.documentElement.style.setProperty('--memo-sidebar-w', `${sidebarW}px`)
  }, [])

  useEffect(() => {
    computeNotebookScale(sidebarOpen)
  }, [sidebarOpen, computeNotebookScale])

  // ── Page navigation ──────────────────────────────────────────────
  const isMobile = () => window.innerWidth <= 700

  const goToSpread = useCallback((next: number, side: 'R' | 'L' = 'R') => {
    saveNow()
    history.clearPageHistory()
    setCurrentSpread(next)
    setMobileSide(side)
  }, [saveNow, history])

  // Load spread whenever currentSpread changes (fires on mount too, covering spread 0)
  useEffect(() => {
    pageStore.loadSpread(currentSpread, leftCanvasRef.current, rightCanvasRef.current)
  }, [currentSpread]) // eslint-disable-line react-hooks/exhaustive-deps

  // スマホ: 1ページずつ、デスクトップ: 1スプレッドずつ
  const handlePrevPage = () => {
    if (isMobile()) {
      if (mobileSide === 'L') {
        setMobileSide('R')
      } else if (currentSpread > 0) {
        goToSpread(currentSpread - 1, 'L')
      }
    } else {
      if (currentSpread > 0) goToSpread(currentSpread - 1)
    }
  }
  const handleNextPage = () => {
    if (isMobile()) {
      if (mobileSide === 'R') {
        setMobileSide('L')
      } else if (currentSpread < totalSpreads - 1) {
        goToSpread(currentSpread + 1, 'R')
      }
    } else {
      if (currentSpread < totalSpreads - 1) goToSpread(currentSpread + 1)
    }
  }

  const prevDisabled = isMobile()
    ? currentSpread === 0 && mobileSide === 'R'
    : currentSpread === 0
  const nextDisabled = isMobile()
    ? currentSpread === totalSpreads - 1 && mobileSide === 'L'
    : currentSpread === totalSpreads - 1

  const navLabel = isMobile()
    ? `p.${currentSpread * 2 + (mobileSide === 'R' ? 1 : 2)} / ${totalSpreads * 2}`
    : `${currentSpread + 1} / ${totalSpreads}`

  const handleAddSpread = () => {
    saveNow()
    const next = pageStore.getSpreadCount()
    setTotalSpreads(next + 1)
    setCurrentSpread(next)
    setMobileSide('R')
  }

  // ── Overview: reorder ────────────────────────────────────────────
  const handleReorder = useCallback((from: number, to: number) => {
    saveNow()
    pageStore.reorderSpreads(from, to)
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
      pageStore.loadSpread(currentSpread, leftCanvasRef.current, rightCanvasRef.current)
    }
  }, [saveNow, pageStore, currentSpread])

  // ── Overview: delete spread ──────────────────────────────────────
  const handleDeleteSpread = useCallback((at: number) => {
    if (totalSpreads <= 1) return
    saveNow()
    pageStore.deleteSpreadAt(at)
    const newTotal = totalSpreads - 1
    setTotalSpreads(newTotal)
    if (at < currentSpread) {
      setCurrentSpread(currentSpread - 1)
    } else if (at === currentSpread) {
      const newCurrent = Math.min(currentSpread, newTotal - 1)
      setCurrentSpread(newCurrent)
      setMobileSide('R')
      pageStore.loadSpread(newCurrent, leftCanvasRef.current, rightCanvasRef.current)
    }
  }, [saveNow, pageStore, currentSpread, totalSpreads])

  // ── Overview: insert blank spread ────────────────────────────────
  const handleInsertAt = useCallback((at: number) => {
    saveNow()
    pageStore.insertSpreadAt(at)
    setTotalSpreads(t => t + 1)
    if (at <= currentSpread) {
      setCurrentSpread(currentSpread + 1)
    }
  }, [saveNow, pageStore, currentSpread])

  // ── Window resize ────────────────────────────────────────────────
  useEffect(() => {
    computeNotebookScale(sidebarOpen)
    const handleResize = () => {
      if (overlayCanvasRef.current) {
        overlayCanvasRef.current.width = window.innerWidth
        overlayCanvasRef.current.height = window.innerHeight
      }
      computeNotebookScale(sidebarOpen)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [sidebarOpen, computeNotebookScale]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Pointer event dispatcher (overlay div) ───────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Track all pointers for pinch detection
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (activePointersRef.current.size === 2) {
      // Two fingers: start pinch
      const pts = Array.from(activePointersRef.current.values())
      const dx = pts[1].x - pts[0].x
      const dy = pts[1].y - pts[0].y
      pinchInitDistRef.current = Math.sqrt(dx * dx + dy * dy) || 1
      pinchInitZoomRef.current = notebookZoom
      return
    }

    if (tool.type === 'lasso' || selection.isPasting()) {
      selection.handlePointerDown(e)
    } else {
      drawing.handlePointerDown(e)
    }
  }, [tool.type, selection, drawing, notebookZoom])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (activePointersRef.current.size === 2) {
      // Pinch zoom
      const pts = Array.from(activePointersRef.current.values())
      const dx = pts[1].x - pts[0].x
      const dy = pts[1].y - pts[0].y
      const newDist = Math.sqrt(dx * dx + dy * dy) || 1
      const newZoom = Math.max(0.3, Math.min(3, pinchInitZoomRef.current * newDist / pinchInitDistRef.current))
      setNotebookZoom(newZoom)
      return
    }

    if (tool.type === 'lasso' || selection.isPasting()) {
      selection.handlePointerMove(e)
    } else {
      drawing.handlePointerMove(e)
    }
  }, [tool.type, selection, drawing])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    activePointersRef.current.delete(e.pointerId)

    if (tool.type === 'lasso' || selection.isPasting()) {
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

  const handleSaveButton = useCallback(async () => {
    saveNow()
    try {
      const filename = await saveProjectFile(pageStore.getSpreadCount())
      showToast(`保存しました：${filename}`)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') showToast('保存に失敗しました')
    }
  }, [saveNow, pageStore, showToast])

  const handleSaveProjectFile = handleSaveButton

  const handleLoadProjectFile = async (file: File) => {
    try {
      const data = await loadProjectFile(file)
      pageStore.loadAllFromProjectData(
        data,
        memoCanvasRef.current,
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
        (current: number, total: number) => showToast(`PDF読み込み中… ${current}/${total}ページ`)
      )
      saveNow()
      const spreadsNeeded = Math.ceil((pages.length + 1) / 2)

      const oldCount = pageStore.getSpreadCount()
      for (let i = 0; i < oldCount; i++) {
        localStorage.removeItem(`namenote_page_${i}_L`)
        localStorage.removeItem(`namenote_page_${i}_R`)
      }

      for (let i = 0; i < pages.length; i++) {
        let spreadIndex: number, side: 'L' | 'R'
        if (i === 0) {
          spreadIndex = 0; side = 'L'
        } else {
          spreadIndex = Math.ceil(i / 2)
          side = i % 2 === 1 ? 'R' : 'L'
        }
        localStorage.setItem(`namenote_page_${spreadIndex}_${side}`, pages[i])
      }
      pageStore.setSpreadCount(spreadsNeeded)
      setTotalSpreads(spreadsNeeded)
      setCurrentSpread(0)
      pageStore.loadSpread(0, leftCanvasRef.current, rightCanvasRef.current)
      showToast(`PDF読み込み完了：${pages.length}ページ（${spreadsNeeded}スプレッド）`)
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
  const handleMove = () => {
    selection.startMove()
    setHasClipboard(true)
    setSelectionActive(false)
    markUnsaved()
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
  const handleConfirmPaste = () => {
    selection.commitPaste()
    markUnsaved()
  }
  const handleCancelPaste = () => {
    selection.cancelPaste()
  }

  const handleResetNotebook = useCallback(() => {
    if (!window.confirm('ノートのすべてのデータを削除して初期化します。この操作は元に戻せません。\n続けますか？')) return
    const keys = Object.keys(localStorage).filter(k => k.startsWith('namenote'))
    keys.forEach(k => localStorage.removeItem(k))
    pageStore.setSpreadCount(1)
    const clear = (c: HTMLCanvasElement | null) => { if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height) }
    clear(memoCanvasRef.current)
    clear(leftCanvasRef.current)
    clear(rightCanvasRef.current)
    setCurrentSpread(0)
    setTotalSpreads(1)
    setMobileSide('R')
    setSaveStatus('saved')
    showToast('ノートを初期化しました')
  }, [pageStore, showToast])

  const cursor = tool.type === 'eraser' ? 'cell' : 'crosshair'

  // Sidebar width for layout calculations
  const sidebarW = sidebarOpen ? SIDEBAR_W : 0

  return (
    <div className="app-root">
      {/* Memo sidebar (left edge, z-index 200, captures its own pointer events) */}
      <MemoSidebar
        ref={memoCanvasRef}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(o => !o)}
        tool={tool}
      />

      {/* Notebook spread (centered in remaining space via CSS vars) */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          left: sidebarW,
          pointerEvents: 'none',
          zIndex: 1,
          transformOrigin: 'center center',
          transform: notebookZoom !== 1 ? `scale(${notebookZoom})` : undefined,
        }}
      >
        <NotebookSpread
          ref={notebookRef}
          leftCanvasRef={leftCanvasRef}
          rightCanvasRef={rightCanvasRef}
          currentSpread={currentSpread}
          totalSpreads={totalSpreads}
          mobileSide={mobileSide}
        />
      </div>

      {/* Selection overlay canvas (full viewport, pointer-events none) */}
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

      {/* Event overlay div (starts after sidebar) */}
      <div
        ref={overlayRef}
        style={{
          position: 'fixed',
          top: 0,
          left: sidebarW,
          right: 0,
          bottom: 0,
          zIndex: 100,
          cursor,
          touchAction: 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      {/* Toolbar */}
      <Toolbar
        tool={tool}
        onToolChange={t => { setTool(t); if (t.type !== 'lasso') selection.clearSelection() }}
        navLabel={navLabel}
        prevDisabled={prevDisabled}
        nextDisabled={nextDisabled}
        onPrevSpread={handlePrevPage}
        onNextSpread={handleNextPage}
        onAddSpread={handleAddSpread}
        saveStatus={saveStatus}
        onSave={handleSaveButton}
        onExportSpreadJpg={handleExportSpreadJpg}
        onExportAllPdf={handleExportAllPdf}
        onSaveProjectFile={handleSaveProjectFile}
        onLoadProjectFile={handleLoadProjectFile}
        onImportPdf={handleImportPdf}
        onResetNotebook={handleResetNotebook}
        isPasting={isPasting}
        onConfirmPaste={handleConfirmPaste}
        onCancelPaste={handleCancelPaste}
        selectionActive={selectionActive}
        onCut={handleCut}
        onCopy={handleCopy}
        onMove={handleMove}
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
        onDeleteSpread={handleDeleteSpread}
        getThumbnail={pageStore.getThumbnail}
      />

      {/* Toast notification */}
      <Toast key={toastKey} message={toastMsg} />
    </div>
  )
}

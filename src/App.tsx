import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { DrawingTool, SaveStatus, TextObject, TextWritingMode, InputMode } from './types'
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
import TextEditor from './components/TextEditor'

const SAVE_DEBOUNCE_MS = 600
const SIDEBAR_W = 260

// Determine what action the current pointer event should trigger.
// Priority: 2+ touch fingers → gesture (handled by global handler)
//           tool overrides (lasso/text always draw)
//           inputMode + pointerType for pen/eraser
function resolvePointerAction(
  pointerType: string,
  touchPointerCount: number,
  inputMode: import('./types').InputMode,
  toolType: import('./types').ToolType,
): 'draw' | 'pan' | 'gesture' {
  if (touchPointerCount >= 2) return 'gesture'
  // lasso and text tools always route to their own handlers
  if (toolType === 'lasso' || toolType === 'text') return 'draw'
  switch (inputMode) {
    case 'pan': return 'pan'
    case 'draw': return 'draw'
    case 'auto':
    default:
      return pointerType === 'touch' ? 'pan' : 'draw'
  }
}

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
  const [notebookPan, setNotebookPan] = useState({ x: 0, y: 0 })
  const [totalSpreads, setTotalSpreads] = useState(() =>
    parseInt(localStorage.getItem('namenote_spread_count') ?? '1', 10) || 1,
  )
  const [mobileSide, setMobileSide] = useState<'R' | 'L'>('R')
  const [stabilizationStrength, setStabilizationStrength] = useState(30)
  const [inputMode, setInputMode] = useState<InputMode>('auto')
  const inputModeRef = useRef<InputMode>('auto')

  // ── Text tool state ───────────────────────────────────────────
  const [textObjects, setTextObjects] = useState<TextObject[]>(() => {
    try { return JSON.parse(localStorage.getItem('namenote_text') ?? '[]') }
    catch { return [] }
  })
  const [writingMode, setWritingMode] = useState<TextWritingMode>('horizontal-tb')
  const [textFontSize, setTextFontSize] = useState(18)
  const [textEditorState, setTextEditorState] = useState<{ id: string; screenX: number; screenY: number } | null>(null)
  const [crossAreaDrag, setCrossAreaDrag] = useState<{ obj: TextObject; clientX: number; clientY: number } | null>(null)

  // Stable ref to always-current textObjects for history callbacks
  const textObjectsRef = useRef<TextObject[]>([])
  useEffect(() => { textObjectsRef.current = textObjects }, [textObjects])

  const openTextEditor = useCallback((id: string, screenX: number, screenY: number) => {
    setTextEditorState({ id, screenX, screenY })
  }, [])

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
  const pinchInitMidRef = useRef({ x: 0, y: 0 })
  const pinchInitPanRef = useRef({ x: 0, y: 0 })
  const notebookZoomRef = useRef(1)
  const notebookPanRef = useRef({ x: 0, y: 0 })
  const sidebarWRef = useRef(0)
  const sidebarOpenRef = useRef(sidebarOpen)

  // Single-pointer pan tracking
  const isPanningRef = useRef(false)
  const panLastPtRef = useRef({ x: 0, y: 0 })

  // Stable ref to drawing.cancelStroke for use in global capture handler
  const cancelStrokeRef = useRef<() => void>(() => {})

  // ── Toast ────────────────────────────────────────────────────
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

  // ── Auto-save ────────────────────────────────────────────────
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

  const history = useHistory(
    leftCanvasRef,
    rightCanvasRef,
    memoCanvasRef,
    () => textObjectsRef.current,
    (snapshot) => {
      setTextObjects(snapshot)
      localStorage.setItem('namenote_text', JSON.stringify(snapshot))
      markUnsaved()
    },
  )

  // ── Text object handlers ──────────────────────────────────────
  const addTextObject = useCallback(
    (obj: TextObject) => {
      history.pushText()
      setTextObjects(prev => {
        const next = [...prev, obj]
        localStorage.setItem('namenote_text', JSON.stringify(next))
        return next
      })
      markUnsaved()
    },
    [markUnsaved, history],
  )

  // Accepts any partial TextObject fields (including side/spread for cross-area move)
  const updateTextObject = useCallback(
    (id: string, updates: Partial<Omit<TextObject, 'id'>>) => {
      setTextObjects(prev => {
        const next = prev.map(o => (o.id === id ? { ...o, ...updates } : o))
        localStorage.setItem('namenote_text', JSON.stringify(next))
        return next
      })
      markUnsaved()
    },
    [markUnsaved],
  )

  const deleteTextObject = useCallback(
    (id: string) => {
      history.pushText()
      setTextObjects(prev => {
        const next = prev.filter(o => o.id !== id)
        localStorage.setItem('namenote_text', JSON.stringify(next))
        return next
      })
      markUnsaved()
    },
    [markUnsaved, history],
  )

  // ── Drawing ──────────────────────────────────────────────────
  const drawing = useDrawing({
    tool,
    leftCanvasRef,
    rightCanvasRef,
    overlayRef,
    onBeforeStroke: history.push,
    onStrokeEnd: markUnsaved,
    onCancelStroke: history.undo,
    enabled: tool.type !== 'lasso' && tool.type !== 'text',
    stabilizationStrength,
  })
  // Keep cancelStrokeRef in sync so the global capture handler can call it
  useEffect(() => { cancelStrokeRef.current = drawing.cancelStroke }, [drawing.cancelStroke])

  // ── Selection ────────────────────────────────────────────────
  const selection = useSelection({
    overlayCanvasRef,
    overlayDivRef: overlayRef,
    leftCanvasRef,
    rightCanvasRef,
    memoCanvasRef,
    enabled: tool.type === 'lasso',
    onBeforeEdit: history.push,
    onSelectionChange: active => setSelectionActive(active),
    onPasteChange: setIsPasting,
  })

  // ── Initial load ─────────────────────────────────────────────
  useEffect(() => {
    pageStore.loadMemo(memoCanvasRef.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sidebar width CSS var + notebook scale ────────────────────
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

  // ── Page navigation ──────────────────────────────────────────
  const isMobile = () => window.innerWidth <= 700

  const goToSpread = useCallback(
    (next: number, side: 'R' | 'L' = 'R') => {
      saveNow()
      history.switchSpread(currentSpread, next)
      setCurrentSpread(next)
      setMobileSide(side)
      setNotebookZoom(1)
      setNotebookPan({ x: 0, y: 0 })
      // Re-sync scale after navigation: Android browser chrome can change viewport height
      // mid-navigation, so recompute after the browser has settled.
      requestAnimationFrame(() => computeNotebookScale(sidebarOpen))
    },
    [saveNow, history, currentSpread, computeNotebookScale, sidebarOpen],
  )

  useEffect(() => {
    pageStore.loadSpread(currentSpread, leftCanvasRef.current, rightCanvasRef.current)
  }, [currentSpread]) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePrevPage = () => {
    if (isMobile()) {
      if (mobileSide === 'L') setMobileSide('R')
      else if (currentSpread > 0) goToSpread(currentSpread - 1, 'L')
    } else {
      if (currentSpread > 0) goToSpread(currentSpread - 1)
    }
  }
  const handleNextPage = () => {
    if (isMobile()) {
      if (mobileSide === 'R') setMobileSide('L')
      else if (currentSpread < totalSpreads - 1) goToSpread(currentSpread + 1, 'R')
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

  // ── Individual page operations (overview panel) ───────────────
  const handleReorderPages = useCallback(
    (fromFlat: number, toFlat: number) => {
      if (fromFlat === toFlat) return
      saveNow()
      // Build old→new flat index mapping
      const total = totalSpreads * 2
      const arr = Array.from({ length: total }, (_, i) => i)
      const [moved] = arr.splice(fromFlat, 1)
      arr.splice(toFlat, 0, moved)
      // arr[newFlat] = oldFlat  →  build reverse: oldFlat → newFlat
      const oldToNew = new Map(arr.map((oldFlat, newFlat) => [oldFlat, newFlat]))
      setTextObjects(prev => {
        const next = prev.map(o => {
          if (o.side === 'memo') return o
          const oldFlat = o.spread * 2 + (o.side === 'right' ? 0 : 1)
          const newFlat = oldToNew.get(oldFlat)
          if (newFlat === undefined) return o
          return {
            ...o,
            spread: Math.floor(newFlat / 2),
            side: (newFlat % 2 === 0 ? 'right' : 'left') as 'left' | 'right',
          }
        })
        localStorage.setItem('namenote_text', JSON.stringify(next))
        return next
      })
      pageStore.reorderPages(fromFlat, toFlat)
      pageStore.loadSpread(currentSpread, leftCanvasRef.current, rightCanvasRef.current)
    },
    [saveNow, pageStore, currentSpread, totalSpreads],
  )

  const handleDeletePage = useCallback(
    (flatIndex: number) => {
      saveNow()
      setTextObjects(prev => {
        const next = prev
          .filter(o => {
            if (o.side === 'memo') return true
            return o.spread * 2 + (o.side === 'right' ? 0 : 1) !== flatIndex
          })
          .map(o => {
            if (o.side === 'memo') return o
            const flat = o.spread * 2 + (o.side === 'right' ? 0 : 1)
            if (flat > flatIndex) {
              const nf = flat - 1
              return { ...o, spread: Math.floor(nf / 2), side: (nf % 2 === 0 ? 'right' : 'left') as 'left' | 'right' }
            }
            return o
          })
        localStorage.setItem('namenote_text', JSON.stringify(next))
        return next
      })
      const newCount = pageStore.deletePageAt(flatIndex)
      setTotalSpreads(newCount)
      const newSpread = Math.min(currentSpread, newCount - 1)
      setCurrentSpread(newSpread)
      setMobileSide('R')
      pageStore.loadSpread(newSpread, leftCanvasRef.current, rightCanvasRef.current)
    },
    [saveNow, pageStore, currentSpread],
  )

  const handleInsertPage = useCallback(
    (atFlat: number) => {
      saveNow()
      setTextObjects(prev => {
        const next = prev.map(o => {
          if (o.side === 'memo') return o
          const flat = o.spread * 2 + (o.side === 'right' ? 0 : 1)
          if (flat >= atFlat) {
            const nf = flat + 1
            return { ...o, spread: Math.floor(nf / 2), side: (nf % 2 === 0 ? 'right' : 'left') as 'left' | 'right' }
          }
          return o
        })
        localStorage.setItem('namenote_text', JSON.stringify(next))
        return next
      })
      const newCount = pageStore.insertPageAt(atFlat)
      setTotalSpreads(newCount)
      // If inserted before current spread's first page, shift current spread
      if (atFlat <= currentSpread * 2) setCurrentSpread(currentSpread + 1)
    },
    [saveNow, pageStore, currentSpread],
  )

  // ── Window resize ────────────────────────────────────────────
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
    // visualViewport fires after Android browser chrome (address bar) finishes adjusting,
    // giving more stable dimensions than window.resize alone
    window.visualViewport?.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.visualViewport?.removeEventListener('resize', handleResize)
    }
  }, [sidebarOpen, computeNotebookScale]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (overlayCanvasRef.current) {
      overlayCanvasRef.current.width = window.innerWidth
      overlayCanvasRef.current.height = window.innerHeight
    }
  }, [])

  // ── Cross-area text drag ──────────────────────────────────────
  const handleBeginCrossAreaDrag = useCallback(
    (obj: TextObject, pointerId: number, clientX: number, clientY: number) => {
      setCrossAreaDrag({ obj, clientX, clientY })

      const onMove = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return
        setCrossAreaDrag(prev => prev ? { ...prev, clientX: e.clientX, clientY: e.clientY } : null)
      }

      const onUp = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        setCrossAreaDrag(null)

        // Determine target area and convert coordinates
        const memoRect = memoCanvasRef.current?.getBoundingClientRect()
        const leftRect = leftCanvasRef.current?.getBoundingClientRect()
        const rightRect = rightCanvasRef.current?.getBoundingClientRect()

        let newSide: 'left' | 'right' | 'memo' | null = null
        let newSpread = currentSpread
        let newX = 0, newY = 0

        const inRect = (r: DOMRect) =>
          e.clientX >= r.left && e.clientX <= r.right &&
          e.clientY >= r.top  && e.clientY <= r.bottom

        if (memoRect && inRect(memoRect)) {
          newSide = 'memo'
          newSpread = 0
          newX = (e.clientX - memoRect.left) * (260 / memoRect.width)
          newY = (e.clientY - memoRect.top)  * (4000 / memoRect.height)
        } else if (leftRect && inRect(leftRect)) {
          newSide = 'left'
          newX = (e.clientX - leftRect.left) * (PAGE_WIDTH / leftRect.width)
          newY = (e.clientY - leftRect.top)  * (PAGE_HEIGHT / leftRect.height)
        } else if (rightRect && inRect(rightRect)) {
          newSide = 'right'
          newX = (e.clientX - rightRect.left) * (PAGE_WIDTH / rightRect.width)
          newY = (e.clientY - rightRect.top)  * (PAGE_HEIGHT / rightRect.height)
        } else {
          return  // dropped outside — keep original position
        }

        history.pushText()
        updateTextObject(obj.id, { side: newSide, spread: newSpread, x: newX, y: newY })
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [currentSpread, memoCanvasRef, leftCanvasRef, rightCanvasRef, history, updateTextObject],
  )

  // ── Keyboard shortcuts ───────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't capture shortcuts while typing in the text editor
      if ((e.target as HTMLElement).closest('.text-editor-textarea')) return

      if (e.key === 'p' && !e.ctrlKey && !e.metaKey) setTool(t => ({ ...t, type: 'pen' }))
      if (e.key === 'e' && !e.ctrlKey && !e.metaKey) setTool(t => ({ ...t, type: 'eraser' }))
      if (e.key === 'l' && !e.ctrlKey && !e.metaKey) setTool(t => ({ ...t, type: 'lasso' }))
      if (e.key === 't' && !e.ctrlKey && !e.metaKey) setTool(t => ({ ...t, type: 'text' }))
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveNow() }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); history.undo(); markUnsaved() }
      if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key === 'z' || e.key === 'y')) { e.preventDefault(); history.redo(); markUnsaved() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saveNow, history, markUnsaved])

  // ── Global pinch-to-zoom (capture phase — fires before any element handler) ──
  // Track ALL pointers across the full screen so pinch works wherever the fingers land.
  useEffect(() => { notebookZoomRef.current = notebookZoom }, [notebookZoom])
  useEffect(() => { notebookPanRef.current = notebookPan }, [notebookPan])
  useEffect(() => { sidebarWRef.current = sidebarOpen ? SIDEBAR_W : 0 }, [sidebarOpen])
  useEffect(() => { sidebarOpenRef.current = sidebarOpen }, [sidebarOpen])
  useEffect(() => { inputModeRef.current = inputMode }, [inputMode])

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return  // ignore synthetic mouse events from Android Chrome
      // Touches starting in the sidebar area are handled by the sidebar, not notebook pinch
      if (sidebarOpenRef.current && e.clientX < sidebarWRef.current) return
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (activePointersRef.current.size === 2) {
        // Cancel any in-progress drawing or single-finger pan before entering gesture mode
        cancelStrokeRef.current()
        isPanningRef.current = false
        const pts = Array.from(activePointersRef.current.values())
        const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y
        pinchInitDistRef.current = Math.sqrt(dx * dx + dy * dy) || 1
        pinchInitZoomRef.current = notebookZoomRef.current
        pinchInitMidRef.current = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
        pinchInitPanRef.current = { ...notebookPanRef.current }
      }
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      if (!activePointersRef.current.has(e.pointerId)) return  // not a tracked touch
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (activePointersRef.current.size === 2) {
        const pts = Array.from(activePointersRef.current.values())
        const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y
        const currDist = Math.sqrt(dx * dx + dy * dy) || 1
        const newZoom = Math.max(0.3, Math.min(3,
          pinchInitZoomRef.current * currDist / pinchInitDistRef.current))

        // Combined pan + zoom:
        // The content that was under the initial midpoint (imx, imy) should now appear
        // under the current midpoint (cmx, cmy). This formula handles both zoom-center
        // correction and finger-movement pan simultaneously.
        //
        // Derivation (transformOrigin: center center, transform: translate(pan) scale(zoom)):
        //   screen_x = A + content_x * zoom + pan.x   where A = sw + (vw-sw)/2
        //   content under initMid: ex = (imx - A - initPan.x) / initZoom
        //   newPan.x s.t. screen_x of ex = cmx:
        //     newPan.x = (cmx - A) + ratio * (A - imx + initPan.x)
        const sw = sidebarWRef.current
        const A = sw + (window.innerWidth - sw) / 2   // notebook center X on screen
        const B = window.innerHeight / 2              // notebook center Y on screen
        const cmx = (pts[0].x + pts[1].x) / 2        // current midpoint
        const cmy = (pts[0].y + pts[1].y) / 2
        const { x: imx, y: imy } = pinchInitMidRef.current
        const initPan = pinchInitPanRef.current
        const ratio = newZoom / pinchInitZoomRef.current
        setNotebookZoom(newZoom)
        setNotebookPan({
          x: (cmx - A) + ratio * (A - imx + initPan.x),
          y: (cmy - B) + ratio * (B - imy + initPan.y),
        })
      }
    }
    const onUp = (e: PointerEvent) => activePointersRef.current.delete(e.pointerId)
    window.addEventListener('pointerdown', onDown, { capture: true })
    window.addEventListener('pointermove', onMove, { capture: true })
    window.addEventListener('pointerup', onUp, { capture: true })
    window.addEventListener('pointercancel', onUp, { capture: true })
    return () => {
      window.removeEventListener('pointerdown', onDown, { capture: true })
      window.removeEventListener('pointermove', onMove, { capture: true })
      window.removeEventListener('pointerup', onUp, { capture: true })
      window.removeEventListener('pointercancel', onUp, { capture: true })
    }
  }, []) // refs only — no re-registration needed

  // ── Pointer event dispatcher (overlay div) ───────────────────
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const action = resolvePointerAction(
        e.pointerType,
        activePointersRef.current.size,  // global capture handler already updated this
        inputModeRef.current,
        tool.type,
      )
      if (action === 'gesture') return

      if (action === 'pan') {
        isPanningRef.current = true
        panLastPtRef.current = { x: e.clientX, y: e.clientY }
        overlayRef.current?.setPointerCapture(e.pointerId)
        return
      }

      // action === 'draw'
      if (tool.type === 'lasso' || selection.isPasting()) {
        selection.handlePointerDown(e)
      } else {
        drawing.handlePointerDown(e)
      }
    },
    [tool.type, selection, drawing, overlayRef],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      // 2+ touch pointers → gesture mode handled by global capture handler
      if (activePointersRef.current.size >= 2) return

      if (isPanningRef.current) {
        const dx = e.clientX - panLastPtRef.current.x
        const dy = e.clientY - panLastPtRef.current.y
        panLastPtRef.current = { x: e.clientX, y: e.clientY }
        setNotebookPan(prev => ({ x: prev.x + dx, y: prev.y + dy }))
        return
      }

      if (tool.type === 'lasso' || selection.isPasting()) {
        selection.handlePointerMove(e)
      } else {
        drawing.handlePointerMove(e)
      }
    },
    [tool.type, selection, drawing],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (isPanningRef.current) {
        isPanningRef.current = false
        overlayRef.current?.releasePointerCapture(e.pointerId)
        return
      }
      if (tool.type === 'lasso' || selection.isPasting()) {
        selection.handlePointerUp(e)
      } else {
        drawing.handlePointerUp(e)
      }
    },
    [tool.type, selection, drawing, overlayRef],
  )

  // ── Export / Save ────────────────────────────────────────────
  const handleExportSpreadJpg = () => {
    saveNow()
    try {
      const rightPageNum = currentSpread * 2 + 1
      const filename = exportSpreadAsJpg(
        leftCanvasRef.current,
        rightCanvasRef.current,
        rightPageNum,
        textObjects,
        currentSpread,
      )
      showToast(`書き出しました：${filename}`)
    } catch (e) {
      showToast('書き出しに失敗しました')
      console.error(e)
    }
  }

  const handleExportAllPdf = () => {
    saveNow()
    try {
      const filename = exportAllAsPdf(
        pageStore.getSpreadCount(),
        pageStore.getSpreadData,
        textObjects,
      )
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
        0,
      )
      const loadedCount =
        parseInt((data as Record<string, string>)['namenote_spread_count'] ?? '1', 10) || 1
      setTotalSpreads(loadedCount)
      setCurrentSpread(0)
      history.clearAllHistory()
      setSaveStatus('saved')
      // Reload text objects from localStorage (updated by loadAllFromProjectData)
      try {
        setTextObjects(JSON.parse(localStorage.getItem('namenote_text') ?? '[]'))
      } catch { setTextObjects([]) }
      showToast(`読み込みました：${file.name}`)
    } catch (err) {
      showToast(`読み込み失敗：${(err as Error).message}`)
    }
  }

  // ── PDF import ───────────────────────────────────────────────
  const handleImportPdf = useCallback(
    async (file: File) => {
      showToast('PDF読み込み中…')
      try {
        const pages = await importPdfPages(
          file,
          PAGE_WIDTH,
          PAGE_HEIGHT,
          (current: number, total: number) =>
            showToast(`PDF読み込み中… ${current}/${total}ページ`),
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
          if (i === 0) { spreadIndex = 0; side = 'L' }
          else { spreadIndex = Math.ceil(i / 2); side = i % 2 === 1 ? 'R' : 'L' }
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
    },
    [saveNow, pageStore, showToast],
  )

  // ── Selection actions ────────────────────────────────────────
  const handleCut = () => { selection.cutSelection(); setHasClipboard(true); setSelectionActive(false); markUnsaved() }
  const handleCopy = () => { selection.copySelection(); setHasClipboard(true); setSelectionActive(false) }
  const handleMove = () => { selection.startMove(); setHasClipboard(true); setSelectionActive(false); markUnsaved() }
  const handlePaste = () => { if (selection.hasClipboard()) selection.startPaste() }
  const handleDeleteSelection = () => { selection.deleteSelection(); setSelectionActive(false); markUnsaved() }
  const handleConfirmPaste = () => { selection.commitPaste(); markUnsaved() }
  const handleCancelPaste = () => { selection.cancelPaste() }

  const handleResetNotebook = useCallback(() => {
    if (!window.confirm('ノートのすべてのデータを削除して初期化します。この操作は元に戻せません。\n続けますか？')) return
    const keys = Object.keys(localStorage).filter(k => k.startsWith('namenote'))
    keys.forEach(k => localStorage.removeItem(k))
    pageStore.setSpreadCount(1)
    const clear = (c: HTMLCanvasElement | null) => {
      if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    }
    clear(memoCanvasRef.current)
    clear(leftCanvasRef.current)
    clear(rightCanvasRef.current)
    setTextObjects([])
    setCurrentSpread(0)
    setTotalSpreads(1)
    setMobileSide('R')
    setSaveStatus('saved')
    showToast('ノートを初期化しました')
  }, [pageStore, showToast])

  const isTextActive = tool.type === 'text'
  const cursor = isTextActive ? 'default' : tool.type === 'eraser' ? 'cell' : 'crosshair'
  const sidebarW = sidebarOpen ? SIDEBAR_W : 0

  const memoTextObjects = textObjects.filter(o => o.side === 'memo')

  return (
    <div className="app-root">
      {/* Memo sidebar */}
      <MemoSidebar
        ref={memoCanvasRef}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(o => !o)}
        tool={tool}
        inputMode={inputMode}
        textObjects={memoTextObjects}
        isTextActive={isTextActive}
        textColor={tool.color}
        textFontSize={textFontSize}
        textWritingMode={writingMode}
        draggingTextId={crossAreaDrag?.obj.id}
        onAddText={addTextObject}
        onUpdateText={updateTextObject}
        onEditRequest={openTextEditor}
        onBeginCrossAreaDrag={handleBeginCrossAreaDrag}
      />

      {/* Notebook spread */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          left: sidebarW,
          pointerEvents: 'none',
          zIndex: 1,
          transformOrigin: 'center center',
          transform: (notebookZoom !== 1 || notebookPan.x !== 0 || notebookPan.y !== 0)
            ? `translate(${notebookPan.x.toFixed(2)}px, ${notebookPan.y.toFixed(2)}px) scale(${notebookZoom})`
            : undefined,
        }}
      >
        <NotebookSpread
          ref={notebookRef}
          leftCanvasRef={leftCanvasRef}
          rightCanvasRef={rightCanvasRef}
          currentSpread={currentSpread}
          totalSpreads={totalSpreads}
          mobileSide={mobileSide}
          textObjects={textObjects}
          isTextActive={isTextActive}
          textColor={tool.color}
          textFontSize={textFontSize}
          textWritingMode={writingMode}
          draggingTextId={crossAreaDrag?.obj.id}
          onAddText={addTextObject}
          onUpdateText={updateTextObject}
          onEditRequest={openTextEditor}
          onBeginCrossAreaDrag={handleBeginCrossAreaDrag}
        />
      </div>

      {/* Selection overlay canvas — raised above memo sidebar (z-index 200) when lasso active */}
      <canvas
        ref={overlayCanvasRef}
        style={{
          position: 'fixed',
          top: 0, left: 0,
          width: '100vw',
          height: '100dvh',
          zIndex: tool.type === 'lasso' ? 201 : 50,
          pointerEvents: 'none',
        }}
      />

      {/* Event overlay div — covers memo area when lasso active; pointer-events:none for text tool */}
      <div
        ref={overlayRef}
        style={{
          position: 'fixed',
          top: 0,
          left: tool.type === 'lasso' ? 0 : sidebarW,
          right: 0,
          bottom: tool.type === 'lasso' ? '64px' : 0,
          zIndex: tool.type === 'lasso' ? 202 : 100,
          cursor,
          touchAction: 'none',
          pointerEvents: isTextActive ? 'none' : 'auto',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onContextMenu={e => e.preventDefault()}
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
        writingMode={writingMode}
        onWritingModeChange={setWritingMode}
        textFontSize={textFontSize}
        onTextFontSizeChange={setTextFontSize}
        stabilizationStrength={stabilizationStrength}
        onStabilizationStrengthChange={setStabilizationStrength}
        inputMode={inputMode}
        onInputModeChange={setInputMode}
      />

      {/* Page overview panel */}
      <PageOverviewPanel
        isOpen={showOverview}
        onClose={() => setShowOverview(false)}
        totalPages={totalSpreads * 2}
        currentSpread={currentSpread}
        onNavigate={idx => { goToSpread(idx); setShowOverview(false) }}
        onReorderPages={handleReorderPages}
        onInsertPage={handleInsertPage}
        onDeletePage={handleDeletePage}
        getThumbnail={pageStore.getThumbnail}
      />

      {/* Cross-area drag ghost */}
      {crossAreaDrag && (
        <div
          style={{
            position: 'fixed',
            left: crossAreaDrag.clientX + 4,
            top: crossAreaDrag.clientY + 4,
            zIndex: 3000,
            pointerEvents: 'none',
            writingMode: crossAreaDrag.obj.writingMode as 'horizontal-tb' | 'vertical-rl',
            fontSize: crossAreaDrag.obj.fontSize,
            color: crossAreaDrag.obj.color,
            fontFamily: '"Hiragino Mincho ProN", "游明朝", YuMincho, serif',
            whiteSpace: 'pre',
            opacity: 0.75,
            background: 'rgba(255,254,248,0.6)',
            padding: '2px 4px',
            borderRadius: '3px',
            border: '1.5px dashed rgba(59,130,246,0.7)',
            lineHeight: 1.5,
          }}
        >
          {crossAreaDrag.obj.text}
        </div>
      )}

      {/* Text editor portal */}
      {textEditorState && (() => {
        const obj = textObjects.find(o => o.id === textEditorState.id)
        if (!obj) return null
        return createPortal(
          <TextEditor
            id={textEditorState.id}
            initialText={obj.text}
            fontSize={obj.fontSize}
            writingMode={obj.writingMode}
            color={obj.color}
            screenX={textEditorState.screenX}
            screenY={textEditorState.screenY}
            onUpdate={updateTextObject}
            onDelete={deleteTextObject}
            onClose={() => setTextEditorState(null)}
          />,
          document.body,
        )
      })()}

      {/* Toast */}
      <Toast key={toastKey} message={toastMsg} />
    </div>
  )
}

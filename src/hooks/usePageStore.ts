import { useCallback, useRef } from 'react'

const DESK_KEY = 'namenote_desk'
const SPREAD_COUNT_KEY = 'namenote_spread_count'

function pageKey(spreadIndex: number, side: 'L' | 'R') {
  return `namenote_page_${spreadIndex}_${side}`
}

function saveCanvas(canvas: HTMLCanvasElement, key: string) {
  try {
    const data = canvas.toDataURL('image/png')
    localStorage.setItem(key, data)
  } catch {
    // Quota exceeded — ignore
  }
}

/** Save the desk canvas as transparent PNG (ink only, no brown background). */
function saveDeskCanvas(canvas: HTMLCanvasElement) {
  try {
    const data = canvas.toDataURL('image/png')
    localStorage.setItem(DESK_KEY, data)
  } catch {
    // Quota exceeded — ignore
  }
}

function loadCanvasFromData(canvas: HTMLCanvasElement, data: string | null) {
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (!data) return  // 透明のまま。CSS backgroundColor が視覚的な背景色を担当
  const img = new Image()
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0)
  }
  img.src = data
}

export function usePageStore() {
  const spreadCountRef = useRef<number>(
    parseInt(localStorage.getItem(SPREAD_COUNT_KEY) ?? '1', 10) || 1
  )

  const getSpreadCount = useCallback(() => spreadCountRef.current, [])

  const setSpreadCount = useCallback((n: number) => {
    spreadCountRef.current = n
    localStorage.setItem(SPREAD_COUNT_KEY, String(n))
  }, [])

  const ensureSpread = useCallback((spreadIndex: number) => {
    if (spreadIndex + 1 > spreadCountRef.current) {
      setSpreadCount(spreadIndex + 1)
    }
  }, [setSpreadCount])

  const saveSpread = useCallback(
    (spreadIndex: number, leftCanvas: HTMLCanvasElement | null, rightCanvas: HTMLCanvasElement | null) => {
      if (leftCanvas) saveCanvas(leftCanvas, pageKey(spreadIndex, 'L'))
      if (rightCanvas) saveCanvas(rightCanvas, pageKey(spreadIndex, 'R'))
    },
    []
  )

  const loadSpread = useCallback(
    (spreadIndex: number, leftCanvas: HTMLCanvasElement | null, rightCanvas: HTMLCanvasElement | null) => {
      ensureSpread(spreadIndex)
      if (leftCanvas) loadCanvasFromData(leftCanvas, localStorage.getItem(pageKey(spreadIndex, 'L')))
      if (rightCanvas) loadCanvasFromData(rightCanvas, localStorage.getItem(pageKey(spreadIndex, 'R')))
    },
    [ensureSpread]
  )

  const saveDesk = useCallback((deskCanvas: HTMLCanvasElement | null) => {
    if (deskCanvas) saveDeskCanvas(deskCanvas)
  }, [])

  const loadDesk = useCallback((deskCanvas: HTMLCanvasElement | null) => {
    if (!deskCanvas) return
    const ctx = deskCanvas.getContext('2d')!
    ctx.clearRect(0, 0, deskCanvas.width, deskCanvas.height)
    const data = localStorage.getItem(DESK_KEY)
    if (!data) return
    const img = new Image()
    img.onload = () => {
      ctx.clearRect(0, 0, deskCanvas.width, deskCanvas.height)
      ctx.drawImage(img, 0, 0)
    }
    img.src = data
  }, [])

  /** Returns raw base64 data for export/save-as-file use */
  const getSpreadData = useCallback((spreadIndex: number) => ({
    leftData: localStorage.getItem(pageKey(spreadIndex, 'L')),
    rightData: localStorage.getItem(pageKey(spreadIndex, 'R')),
  }), [])

  const getDeskData = useCallback(() => localStorage.getItem(DESK_KEY), [])

  const getThumbnail = useCallback((spreadIndex: number, side: 'L' | 'R'): string | null => {
    return localStorage.getItem(pageKey(spreadIndex, side))
  }, [])

  /**
   * Reorder: move spread at `from` to index `to` in the final array.
   * Both indices are 0-based. The spread count doesn't change.
   */
  const reorderSpreads = useCallback((from: number, to: number) => {
    if (from === to) return
    const count = spreadCountRef.current
    const spreads: Array<{ L: string | null; R: string | null }> = []
    for (let i = 0; i < count; i++) {
      spreads.push({
        L: localStorage.getItem(pageKey(i, 'L')),
        R: localStorage.getItem(pageKey(i, 'R')),
      })
    }
    const [moved] = spreads.splice(from, 1)
    spreads.splice(to, 0, moved)
    for (let i = 0; i < spreads.length; i++) {
      const s = spreads[i]
      if (s.L) localStorage.setItem(pageKey(i, 'L'), s.L)
      else localStorage.removeItem(pageKey(i, 'L'))
      if (s.R) localStorage.setItem(pageKey(i, 'R'), s.R)
      else localStorage.removeItem(pageKey(i, 'R'))
    }
  }, [])

  /**
   * Insert a blank spread at `at` (0-based).
   * Shifts all spreads from `at` onward one position to the right.
   */
  const insertSpreadAt = useCallback((at: number) => {
    const count = spreadCountRef.current
    for (let i = count - 1; i >= at; i--) {
      const L = localStorage.getItem(pageKey(i, 'L'))
      const R = localStorage.getItem(pageKey(i, 'R'))
      if (L) localStorage.setItem(pageKey(i + 1, 'L'), L)
      else localStorage.removeItem(pageKey(i + 1, 'L'))
      if (R) localStorage.setItem(pageKey(i + 1, 'R'), R)
      else localStorage.removeItem(pageKey(i + 1, 'R'))
    }
    localStorage.removeItem(pageKey(at, 'L'))
    localStorage.removeItem(pageKey(at, 'R'))
    setSpreadCount(count + 1)
  }, [setSpreadCount])

  const loadAllFromProjectData = useCallback(
    (
      projectData: Record<string, string>,
      deskCanvas: HTMLCanvasElement | null,
      leftCanvas: HTMLCanvasElement | null,
      rightCanvas: HTMLCanvasElement | null,
      currentSpread: number
    ) => {
      // If the project file has no desk data, clear the stale localStorage key
      if (!projectData[DESK_KEY]) localStorage.removeItem(DESK_KEY)
      // Write all to localStorage
      Object.entries(projectData).forEach(([key, value]) => {
        localStorage.setItem(key, value)
      })
      const count = parseInt(projectData[SPREAD_COUNT_KEY] ?? '1', 10) || 1
      spreadCountRef.current = count
      // Reload visible canvases
      loadDesk(deskCanvas)
      loadSpread(currentSpread, leftCanvas, rightCanvas)
    },
    [loadDesk, loadSpread]
  )

  return {
    getSpreadCount,
    setSpreadCount,
    saveSpread,
    loadSpread,
    saveDesk,
    loadDesk,
    getSpreadData,
    getDeskData,
    getThumbnail,
    reorderSpreads,
    insertSpreadAt,
    loadAllFromProjectData,
  }
}


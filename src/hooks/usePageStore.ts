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

function loadCanvasFromData(canvas: HTMLCanvasElement, data: string | null) {
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (!data) {
    ctx.fillStyle = '#fffef8'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    return
  }
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

  const ensureSpread = useCallback((spreadIndex: number) => {
    if (spreadIndex + 1 > spreadCountRef.current) {
      spreadCountRef.current = spreadIndex + 1
      localStorage.setItem(SPREAD_COUNT_KEY, String(spreadCountRef.current))
    }
  }, [])

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
    if (deskCanvas) saveCanvas(deskCanvas, DESK_KEY)
  }, [])

  const loadDesk = useCallback((deskCanvas: HTMLCanvasElement | null) => {
    if (!deskCanvas) return
    const data = localStorage.getItem(DESK_KEY)
    if (!data) return
    const img = new Image()
    img.onload = () => {
      const ctx = deskCanvas.getContext('2d')!
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

  const loadAllFromProjectData = useCallback(
    (
      projectData: Record<string, string>,
      deskCanvas: HTMLCanvasElement | null,
      leftCanvas: HTMLCanvasElement | null,
      rightCanvas: HTMLCanvasElement | null,
      currentSpread: number
    ) => {
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
    saveSpread,
    loadSpread,
    saveDesk,
    loadDesk,
    getSpreadData,
    getDeskData,
    loadAllFromProjectData,
  }
}

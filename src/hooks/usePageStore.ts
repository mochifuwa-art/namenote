import { useCallback, useRef } from 'react'

const MEMO_KEY = 'namenote_memo'
const SPREAD_COUNT_KEY = 'namenote_spread_count'

function pageKey(spreadIndex: number, side: 'L' | 'R') {
  return `namenote_page_${spreadIndex}_${side}`
}

function trySetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    // Quota exceeded or other storage error — ignore
    return false
  }
}

function saveCanvas(canvas: HTMLCanvasElement, key: string) {
  try {
    const data = canvas.toDataURL('image/png')
    localStorage.setItem(key, data)
  } catch {
    // Quota exceeded — ignore
  }
}

function migrateOpaqueBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]] as const
  const allCream = corners.every(([x, y]) => {
    const p = ctx.getImageData(x, y, 1, 1).data
    return p[0] >= 240 && p[1] >= 240 && p[2] >= 220 && p[3] > 200
  })
  if (!allCream) return
  const imageData = ctx.getImageData(0, 0, w, h)
  const d = imageData.data
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] >= 240 && d[i + 1] >= 240 && d[i + 2] >= 220 && d[i + 3] > 200) d[i + 3] = 0
  }
  ctx.putImageData(imageData, 0, 0)
}

function loadCanvasFromData(canvas: HTMLCanvasElement, data: string | null): () => void {
  // desynchronized: true reduces compositor latency for drawing (must be set on first getContext call)
  const ctx = canvas.getContext('2d', { desynchronized: true })
  if (!ctx) return () => {}
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (!data) return () => {}
  let cancelled = false
  const img = new Image()
  img.onload = () => {
    if (cancelled) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0)
    migrateOpaqueBackground(ctx, canvas.width, canvas.height)
  }
  img.src = data
  return () => { cancelled = true }
}

export function usePageStore() {
  const spreadCountRef = useRef<number>(
    parseInt(localStorage.getItem(SPREAD_COUNT_KEY) ?? '1', 10) || 1
  )

  const getSpreadCount = useCallback(() => spreadCountRef.current, [])

  const setSpreadCount = useCallback((n: number) => {
    spreadCountRef.current = n
    trySetItem(SPREAD_COUNT_KEY, String(n))
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

  const saveMemo = useCallback((memoCanvas: HTMLCanvasElement | null) => {
    if (memoCanvas) saveCanvas(memoCanvas, MEMO_KEY)
  }, [])

  const loadMemo = useCallback((memoCanvas: HTMLCanvasElement | null) => {
    if (!memoCanvas) return
    loadCanvasFromData(memoCanvas, localStorage.getItem(MEMO_KEY))
  }, [])

  const getSpreadData = useCallback((spreadIndex: number) => ({
    leftData: localStorage.getItem(pageKey(spreadIndex, 'L')),
    rightData: localStorage.getItem(pageKey(spreadIndex, 'R')),
  }), [])

  const getThumbnail = useCallback((spreadIndex: number, side: 'L' | 'R'): string | null => {
    return localStorage.getItem(pageKey(spreadIndex, side))
  }, [])

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
      if (s.L) trySetItem(pageKey(i, 'L'), s.L)
      else localStorage.removeItem(pageKey(i, 'L'))
      if (s.R) trySetItem(pageKey(i, 'R'), s.R)
      else localStorage.removeItem(pageKey(i, 'R'))
    }
  }, [])

  const deleteSpreadAt = useCallback((at: number) => {
    const count = spreadCountRef.current
    if (count <= 1) return
    for (let i = at; i < count - 1; i++) {
      const L = localStorage.getItem(pageKey(i + 1, 'L'))
      const R = localStorage.getItem(pageKey(i + 1, 'R'))
      if (L) trySetItem(pageKey(i, 'L'), L)
      else localStorage.removeItem(pageKey(i, 'L'))
      if (R) trySetItem(pageKey(i, 'R'), R)
      else localStorage.removeItem(pageKey(i, 'R'))
    }
    localStorage.removeItem(pageKey(count - 1, 'L'))
    localStorage.removeItem(pageKey(count - 1, 'R'))
    setSpreadCount(count - 1)
  }, [setSpreadCount])

  // ── Individual-page operations (flat index: 0=spread0R, 1=spread0L, 2=spread1R, …) ──

  const reorderPages = useCallback((fromFlat: number, toFlat: number) => {
    if (fromFlat === toFlat) return
    const count = spreadCountRef.current
    const totalPages = count * 2
    const pages: (string | null)[] = []
    for (let i = 0; i < totalPages; i++) {
      const s = Math.floor(i / 2)
      const side: 'L' | 'R' = i % 2 === 0 ? 'R' : 'L'
      pages.push(localStorage.getItem(pageKey(s, side)))
    }
    const [moved] = pages.splice(fromFlat, 1)
    pages.splice(toFlat, 0, moved)
    for (let i = 0; i < pages.length; i++) {
      const s = Math.floor(i / 2)
      const side: 'L' | 'R' = i % 2 === 0 ? 'R' : 'L'
      const k = pageKey(s, side)
      if (pages[i]) trySetItem(k, pages[i]!)
      else localStorage.removeItem(k)
    }
  }, [])

  /** Remove the page at flatIndex, shift subsequent pages left. Returns new spread count. */
  const deletePageAt = useCallback((flatIndex: number): number => {
    const count = spreadCountRef.current
    const totalPages = count * 2
    const pages: (string | null)[] = []
    for (let i = 0; i < totalPages; i++) {
      const s = Math.floor(i / 2)
      const side: 'L' | 'R' = i % 2 === 0 ? 'R' : 'L'
      pages.push(localStorage.getItem(pageKey(s, side)))
    }
    pages.splice(flatIndex, 1)
    // Write back; last slot will be gone (last spread may become half-empty)
    const newCount = Math.max(1, Math.ceil(pages.length / 2))
    const newTotalSlots = newCount * 2
    for (let i = 0; i < newTotalSlots; i++) {
      const s = Math.floor(i / 2)
      const side: 'L' | 'R' = i % 2 === 0 ? 'R' : 'L'
      const k = pageKey(s, side)
      const data = pages[i] ?? null
      if (data) trySetItem(k, data)
      else localStorage.removeItem(k)
    }
    setSpreadCount(newCount)
    return newCount
  }, [setSpreadCount])

  /** Insert a blank page before flatIndex, shift subsequent pages right. Returns new spread count. */
  const insertPageAt = useCallback((flatIndex: number): number => {
    const count = spreadCountRef.current
    const totalPages = count * 2
    const pages: (string | null)[] = []
    for (let i = 0; i < totalPages; i++) {
      const s = Math.floor(i / 2)
      const side: 'L' | 'R' = i % 2 === 0 ? 'R' : 'L'
      pages.push(localStorage.getItem(pageKey(s, side)))
    }
    pages.splice(flatIndex, 0, null)
    const newCount = Math.ceil(pages.length / 2)
    const newTotalSlots = newCount * 2
    // Pad to even length
    while (pages.length < newTotalSlots) pages.push(null)
    for (let i = 0; i < newTotalSlots; i++) {
      const s = Math.floor(i / 2)
      const side: 'L' | 'R' = i % 2 === 0 ? 'R' : 'L'
      const k = pageKey(s, side)
      if (pages[i]) trySetItem(k, pages[i]!)
      else localStorage.removeItem(k)
    }
    setSpreadCount(newCount)
    return newCount
  }, [setSpreadCount])

  const insertSpreadAt = useCallback((at: number) => {
    const count = spreadCountRef.current
    for (let i = count - 1; i >= at; i--) {
      const L = localStorage.getItem(pageKey(i, 'L'))
      const R = localStorage.getItem(pageKey(i, 'R'))
      if (L) trySetItem(pageKey(i + 1, 'L'), L)
      else localStorage.removeItem(pageKey(i + 1, 'L'))
      if (R) trySetItem(pageKey(i + 1, 'R'), R)
      else localStorage.removeItem(pageKey(i + 1, 'R'))
    }
    localStorage.removeItem(pageKey(at, 'L'))
    localStorage.removeItem(pageKey(at, 'R'))
    setSpreadCount(count + 1)
  }, [setSpreadCount])

  const loadAllFromProjectData = useCallback(
    (
      projectData: Record<string, string>,
      memoCanvas: HTMLCanvasElement | null,
      leftCanvas: HTMLCanvasElement | null,
      rightCanvas: HTMLCanvasElement | null,
      currentSpread: number
    ) => {
      Object.entries(projectData).forEach(([key, value]) => {
        trySetItem(key, value)
      })
      const count = parseInt(projectData[SPREAD_COUNT_KEY] ?? '1', 10) || 1
      spreadCountRef.current = count
      loadMemo(memoCanvas)
      loadSpread(currentSpread, leftCanvas, rightCanvas)
    },
    [loadMemo, loadSpread]
  )

  return {
    getSpreadCount,
    setSpreadCount,
    saveSpread,
    loadSpread,
    saveMemo,
    loadMemo,
    getSpreadData,
    getThumbnail,
    reorderSpreads,
    insertSpreadAt,
    deleteSpreadAt,
    reorderPages,
    deletePageAt,
    insertPageAt,
    loadAllFromProjectData,
  }
}

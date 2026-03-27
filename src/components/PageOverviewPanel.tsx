import { useState, useRef, useEffect } from 'react'
import '../styles/PageOverview.css'

interface Props {
  isOpen: boolean
  onClose: () => void
  spreadCount: number
  currentSpread: number
  onNavigate: (index: number) => void
  onReorder: (from: number, to: number) => void
  onInsertAt: (at: number) => void
  getThumbnail: (index: number, side: 'L' | 'R') => string | null
}

export default function PageOverviewPanel({
  isOpen,
  onClose,
  spreadCount,
  currentSpread,
  onNavigate,
  onReorder,
  onInsertAt,
  getThumbnail,
}: Props) {
  const [dragging, setDragging] = useState<number | null>(null)
  const [dropPos, setDropPos] = useState<number | null>(null)
  // Bump to force thumbnail re-read after mutations
  const [version, setVersion] = useState(0)

  const gridRef = useRef<HTMLDivElement>(null)
  const cardElsRef = useRef<Map<number, HTMLDivElement>>(new Map())
  const dragStateRef = useRef<{
    index: number
    startX: number
    startY: number
    active: boolean
  }>({ index: -1, startX: 0, startY: 0, active: false })

  // ── Compute which insert-zone the pointer is closest to ───────────
  const getDropPos = (clientX: number, clientY: number): number => {
    const map = cardElsRef.current
    for (let i = 0; i < spreadCount; i++) {
      const el = map.get(i)
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (clientY < rect.top) return i                              // above this card's row
      if (clientY <= rect.bottom) {
        // RTL display: right of card center → insert before (zone i), left → after (zone i+1)
        return clientX >= rect.left + rect.width / 2 ? i : i + 1
      }
    }
    return spreadCount
  }

  // ── Pointer handlers on the grid container ────────────────────────
  const handleGridPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('[data-insert-btn]')) return  // let insert buttons handle themselves
    const cardEl = target.closest('[data-card-idx]') as HTMLElement | null
    if (!cardEl) return
    const idx = parseInt(cardEl.dataset.cardIdx!)
    dragStateRef.current = { index: idx, startX: e.clientX, startY: e.clientY, active: false }
    gridRef.current?.setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  const handleGridPointerMove = (e: React.PointerEvent) => {
    const ds = dragStateRef.current
    if (ds.index === -1) return
    const dx = e.clientX - ds.startX
    const dy = e.clientY - ds.startY
    if (!ds.active && dx * dx + dy * dy < 64) return  // 8px threshold
    if (!ds.active) {
      ds.active = true
      setDragging(ds.index)
    }
    setDropPos(getDropPos(e.clientX, e.clientY))
  }

  const handleGridPointerUp = (e: React.PointerEvent) => {
    gridRef.current?.releasePointerCapture(e.pointerId)
    const ds = dragStateRef.current
    const wasActive = ds.active
    const from = ds.index
    const pos = dropPos
    dragStateRef.current = { index: -1, startX: 0, startY: 0, active: false }
    setDragging(null)
    setDropPos(null)

    if (!wasActive && from !== -1) {
      // Tap → navigate
      onNavigate(from)
      onClose()
      return
    }

    if (wasActive && from !== -1 && pos !== null) {
      // Drop → reorder
      // `pos` is the insert-zone index (0..spreadCount).
      // Convert to the final array index for reorderSpreads:
      const to = pos > from ? pos - 1 : pos
      if (from !== to) {
        onReorder(from, to)
        setVersion(v => v + 1)
      }
    }
  }

  // ── Keyboard close ────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  // ── Build grid items ──────────────────────────────────────────────
  const items: React.ReactNode[] = []

  const insertZone = (pos: number) => (
    <div
      key={`ins-${pos}`}
      data-insert-btn="true"
      className={`ov-insert${dropPos === pos && dragging !== null ? ' drop-here' : ''}`}
      onClick={e => {
        e.stopPropagation()
        onInsertAt(pos)
        setVersion(v => v + 1)
      }}
    >
      <span className="ov-insert-icon">＋</span>
    </div>
  )

  items.push(insertZone(0))

  for (let i = 0; i < spreadCount; i++) {
    const rightThumb = getThumbnail(i, 'R')
    const leftThumb  = getThumbnail(i, 'L')
    // version is referenced so thumbnails re-read after mutations
    void version

    items.push(
      <div
        key={`card-${i}`}
        data-card-idx={String(i)}
        ref={el => {
          if (el) cardElsRef.current.set(i, el)
          else cardElsRef.current.delete(i)
        }}
        className={[
          'ov-card',
          i === currentSpread ? 'ov-card--current' : '',
          dragging === i ? 'ov-card--dragging' : '',
        ].filter(Boolean).join(' ')}
      >
        {/* Drag handle (top-right corner) */}
        <div className="ov-drag-handle" title="ドラッグして並べ替え">⠿</div>

        {/* Page thumbnails: left page on left, right page on right (matches open-book layout) */}
        <div className="ov-pages">
          {/* Left page (even) */}
          <div className="ov-page">
            <div className="ov-thumb">
              {leftThumb
                ? <img src={leftThumb} alt="" draggable={false} />
                : <div className="ov-thumb-blank" />
              }
            </div>
            <span className="ov-page-num">p.{i * 2 + 2}</span>
          </div>
          {/* Right page (odd) */}
          <div className="ov-page">
            <div className="ov-thumb">
              {rightThumb
                ? <img src={rightThumb} alt="" draggable={false} />
                : <div className="ov-thumb-blank" />
              }
            </div>
            <span className="ov-page-num">p.{i * 2 + 1}</span>
          </div>
        </div>

        <div className="ov-card-footer">
          {i === currentSpread && <span className="ov-current-badge">表示中</span>}
          <span className="ov-spread-label">スプレッド {i + 1}</span>
        </div>
      </div>
    )

    items.push(insertZone(i + 1))
  }

  return (
    <div className="ov-backdrop" onClick={onClose}>
      <div className="ov-panel" onClick={e => e.stopPropagation()}>
        <div className="ov-header">
          <span className="ov-title">ページ一覧 ({spreadCount} スプレッド)</span>
          <button className="ov-close-btn" onClick={onClose}>✕ 閉じる</button>
        </div>

        <div
          className="ov-grid"
          ref={gridRef}
          onPointerDown={handleGridPointerDown}
          onPointerMove={handleGridPointerMove}
          onPointerUp={handleGridPointerUp}
          onPointerCancel={handleGridPointerUp}
        >
          {items}
        </div>
      </div>
    </div>
  )
}

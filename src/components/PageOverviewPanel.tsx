import { useState, useRef, useEffect } from 'react'
import '../styles/PageOverview.css'

// flat index: 0 = first page (p.1), 1 = second page (p.2), etc.
const flatToSpread = (i: number) => Math.floor(i / 2)

interface Props {
  isOpen: boolean
  onClose: () => void
  totalPages: number   // spreadCount * 2
  currentSpread: number
  onNavigate: (spreadIndex: number) => void
  onReorderPages: (fromFlat: number, toFlat: number) => void
  onInsertPage: (atFlat: number) => void
  onDeletePage: (flatIndex: number) => void
  getThumbnail: (spreadIndex: number, side: 'L' | 'R') => string | null
  bindingDirection: 'right' | 'left'
}

export default function PageOverviewPanel({
  isOpen,
  onClose,
  totalPages,
  currentSpread,
  onNavigate,
  onReorderPages,
  onInsertPage,
  onDeletePage,
  getThumbnail,
  bindingDirection,
}: Props) {
  // flat index 0 = p.1 (firstSide), 1 = p.2 (lastSide), etc.
  // 右綴じ: flat0=R(p.1), flat1=L(p.2)  左綴じ: flat0=L(p.1), flat1=R(p.2)
  const flatToSide = (i: number): 'L' | 'R' =>
    bindingDirection === 'right'
      ? (i % 2 === 0 ? 'R' : 'L')
      : (i % 2 === 0 ? 'L' : 'R')
  const [dragging, setDragging] = useState<number | null>(null)
  const [dropPos, setDropPos] = useState<number | null>(null)
  const [version, setVersion] = useState(0)

  const gridRef = useRef<HTMLDivElement>(null)
  const cardElsRef = useRef<Map<number, HTMLDivElement>>(new Map())
  const dragStateRef = useRef<{
    index: number
    startX: number
    startY: number
    active: boolean
  }>({ index: -1, startX: 0, startY: 0, active: false })

  const getDropPos = (clientX: number, clientY: number): number => {
    const map = cardElsRef.current

    // First pass: find the card the pointer is directly over (both x and y match)
    for (let i = 0; i < totalPages; i++) {
      const el = map.get(i)
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (
        clientY >= rect.top && clientY <= rect.bottom &&
        clientX >= rect.left && clientX <= rect.right
      ) {
        // RTL layout: right half → insert before (position i), left half → insert after (position i+1)
        return clientX >= rect.left + rect.width / 2 ? i : i + 1
      }
    }

    // Second pass: pointer is in a gap/insert-zone. Use row-based fallback.
    for (let i = 0; i < totalPages; i++) {
      const el = map.get(i)
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (clientY < rect.top) return i
      if (clientY <= rect.bottom) {
        return clientX >= rect.left + rect.width / 2 ? i : i + 1
      }
    }
    return totalPages
  }

  const handleGridPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('[data-insert-btn]')) return
    if (target.closest('[data-delete-btn]')) return
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
    if (!ds.active && dx * dx + dy * dy < 64) return
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
      onNavigate(flatToSpread(from))
      onClose()
      return
    }

    if (wasActive && from !== -1 && pos !== null) {
      const to = pos > from ? pos - 1 : pos
      if (from !== to) {
        onReorderPages(from, to)
        setVersion(v => v + 1)
      }
    }
  }

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  void version

  const items: React.ReactNode[] = []

  const insertZone = (pos: number) => (
    <div
      key={`ins-${pos}`}
      data-insert-btn="true"
      className={`ov-insert${dropPos === pos && dragging !== null ? ' drop-here' : ''}`}
      onClick={e => {
        e.stopPropagation()
        onInsertPage(pos)
        setVersion(v => v + 1)
      }}
    >
      <span className="ov-insert-icon">＋</span>
    </div>
  )

  items.push(insertZone(0))

  for (let i = 0; i < totalPages; i++) {
    const spread = flatToSpread(i)
    const side = flatToSide(i)
    const thumb = getThumbnail(spread, side)
    const isCurrent = spread === currentSpread

    items.push(
      <div
        key={`card-${i}`}
        data-card-idx={String(i)}
        ref={el => {
          if (el) cardElsRef.current.set(i, el)
          else cardElsRef.current.delete(i)
        }}
        className={[
          'ov-card ov-card--page',
          isCurrent ? 'ov-card--current' : '',
          dragging === i ? 'ov-card--dragging' : '',
        ].filter(Boolean).join(' ')}
      >
        <div className="ov-drag-handle" title="ドラッグして並べ替え">⠿</div>

        {totalPages > 2 && (
          <button
            data-delete-btn="true"
            className="ov-delete-btn"
            title="このページを削除"
            onClick={e => {
              e.stopPropagation()
              if (window.confirm(`p.${i + 1} を削除しますか？\nこの操作は元に戻せません。`)) {
                onDeletePage(i)
                setVersion(v => v + 1)
              }
            }}
          >✕</button>
        )}

        <div className="ov-page ov-page--single">
          <div className="ov-thumb">
            {thumb
              ? <img src={thumb} alt="" draggable={false} />
              : <div className="ov-thumb-blank" />
            }
          </div>
        </div>

        <div className="ov-card-footer">
          {isCurrent && <span className="ov-current-badge">表示中</span>}
          <span className="ov-spread-label">p.{i + 1}</span>
        </div>
      </div>
    )

    items.push(insertZone(i + 1))
  }

  return (
    <div className="ov-backdrop" onClick={onClose}>
      <div className="ov-panel" onClick={e => e.stopPropagation()}>
        <div className="ov-header">
          <span className="ov-title">ページ一覧 ({totalPages} ページ)</span>
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

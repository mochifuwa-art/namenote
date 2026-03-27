import { useRef, useCallback, useEffect } from 'react'
import type { DrawTarget, SelectionClipboard } from '../types'

interface Point { x: number; y: number }

function toCanvasCoords(clientX: number, clientY: number, rect: DOMRect, canvas: HTMLCanvasElement): Point {
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height),
  }
}

function getBoundingBox(pts: Point[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY }
}

interface UseSelectionOptions {
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>
  overlayDivRef: React.RefObject<HTMLDivElement | null>
  leftCanvasRef: React.RefObject<HTMLCanvasElement | null>
  rightCanvasRef: React.RefObject<HTMLCanvasElement | null>
  deskCanvasRef: React.RefObject<HTMLCanvasElement | null>
  enabled: boolean
  onBeforeEdit?: (target: DrawTarget) => void
  onSelectionChange: (hasSelection: boolean) => void
}

type Phase = 'idle' | 'drawing-lasso' | 'selected' | 'moving' | 'pasting'

export function useSelection({
  overlayCanvasRef,
  overlayDivRef,
  leftCanvasRef,
  rightCanvasRef,
  deskCanvasRef,
  enabled,
  onBeforeEdit,
  onSelectionChange,
}: UseSelectionOptions) {
  const phaseRef = useRef<Phase>('idle')
  const lassoPointsRef = useRef<Point[]>([])
  const selectionTargetRef = useRef<DrawTarget | null>(null)
  const selectionTargetRectRef = useRef<DOMRect | null>(null)
  const clipboardRef = useRef<SelectionClipboard | null>(null)
  const pasteCanvasCoordRef = useRef<Point>({ x: 0, y: 0 })
  const pasteTargetRef = useRef<DrawTarget | null>(null)
  const pasteTargetRectRef = useRef<DOMRect | null>(null)
  const moveStartRef = useRef<Point>({ x: 0, y: 0 })
  const marchingOffsetRef = useRef(0)
  const animFrameRef = useRef<number>(0)

  const getDrawTarget = useCallback((clientX: number, clientY: number): { target: DrawTarget; rect: DOMRect | null; canvas: HTMLCanvasElement | null } => {
    const leftRect = leftCanvasRef.current?.getBoundingClientRect() ?? null
    const rightRect = rightCanvasRef.current?.getBoundingClientRect() ?? null
    if (leftRect && clientX >= leftRect.left && clientX <= leftRect.right && clientY >= leftRect.top && clientY <= leftRect.bottom) {
      return { target: { kind: 'page', side: 'left' }, rect: leftRect, canvas: leftCanvasRef.current }
    }
    if (rightRect && clientX >= rightRect.left && clientX <= rightRect.right && clientY >= rightRect.top && clientY <= rightRect.bottom) {
      return { target: { kind: 'page', side: 'right' }, rect: rightRect, canvas: rightCanvasRef.current }
    }
    const deskRect = new DOMRect(0, 0, window.innerWidth, window.innerHeight)
    return { target: { kind: 'desk' }, rect: deskRect, canvas: deskCanvasRef.current }
  }, [leftCanvasRef, rightCanvasRef, deskCanvasRef])

  const getTargetCanvas = useCallback((target: DrawTarget): HTMLCanvasElement | null => {
    if (target.kind === 'desk') return deskCanvasRef.current
    return target.side === 'left' ? leftCanvasRef.current : rightCanvasRef.current
  }, [deskCanvasRef, leftCanvasRef, rightCanvasRef])

  // Draw marching ants overlay
  const drawOverlay = useCallback(() => {
    const oc = overlayCanvasRef.current
    if (!oc) return
    const ctx = oc.getContext('2d')!
    ctx.clearRect(0, 0, oc.width, oc.height)

    const phase = phaseRef.current
    const pts = lassoPointsRef.current

    if (phase === 'drawing-lasso' && pts.length > 1 && selectionTargetRef.current) {
      const rect = selectionTargetRectRef.current!
      const canvas = getTargetCanvas(selectionTargetRef.current)
      if (!canvas) return
      // Convert canvas coords back to overlay coords for drawing
      const scaleX = rect.width / canvas.width
      const scaleY = rect.height / canvas.height
      ctx.beginPath()
      ctx.setLineDash([5, 5])
      ctx.strokeStyle = 'rgba(60,120,255,0.9)'
      ctx.lineWidth = 1.5
      const first = pts[0]
      const ox = selectionTargetRef.current.kind === 'desk' ? 0 : rect.left
      const oy = selectionTargetRef.current.kind === 'desk' ? 0 : rect.top
      ctx.moveTo(first.x * scaleX + ox, first.y * scaleY + oy)
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x * scaleX + ox, pts[i].y * scaleY + oy)
      }
      ctx.stroke()
    }

    if ((phase === 'selected' || phase === 'moving') && pts.length > 1 && selectionTargetRef.current) {
      const rect = selectionTargetRectRef.current!
      const canvas = getTargetCanvas(selectionTargetRef.current)
      if (!canvas) return
      const scaleX = rect.width / canvas.width
      const scaleY = rect.height / canvas.height
      ctx.beginPath()
      ctx.setLineDash([6, 3])
      ctx.lineDashOffset = -marchingOffsetRef.current
      ctx.strokeStyle = 'rgba(60,120,255,1)'
      ctx.lineWidth = 1.5
      const ox = selectionTargetRef.current.kind === 'desk' ? 0 : rect.left
      const oy = selectionTargetRef.current.kind === 'desk' ? 0 : rect.top
      ctx.moveTo(pts[0].x * scaleX + ox, pts[0].y * scaleY + oy)
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x * scaleX + ox, pts[i].y * scaleY + oy)
      }
      ctx.closePath()
      ctx.stroke()
    }

    if (phase === 'pasting' && clipboardRef.current && pasteTargetRef.current) {
      const cb = clipboardRef.current
      const rect = pasteTargetRectRef.current!
      const targetCanvas = getTargetCanvas(pasteTargetRef.current)
      if (!targetCanvas) return
      const scaleX = rect.width / targetCanvas.width
      const scaleY = rect.height / targetCanvas.height
      const ox = pasteTargetRef.current.kind === 'desk' ? 0 : rect.left
      const oy = pasteTargetRef.current.kind === 'desk' ? 0 : rect.top
      const sx = pasteCanvasCoordRef.current.x * scaleX + ox - (cb.width * scaleX) / 2
      const sy = pasteCanvasCoordRef.current.y * scaleY + oy - (cb.height * scaleY) / 2
      ctx.globalAlpha = 0.7
      ctx.drawImage(cb.canvas, sx, sy, cb.width * scaleX, cb.height * scaleY)
      ctx.globalAlpha = 1
      ctx.setLineDash([6, 3])
      ctx.lineDashOffset = -marchingOffsetRef.current
      ctx.strokeStyle = 'rgba(60,120,255,1)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(sx, sy, cb.width * scaleX, cb.height * scaleY)
    }
  }, [overlayCanvasRef, getTargetCanvas])

  // Marching ants animation
  const startMarchingAnts = useCallback(() => {
    const animate = () => {
      marchingOffsetRef.current = (marchingOffsetRef.current + 0.5) % 9
      drawOverlay()
      animFrameRef.current = requestAnimationFrame(animate)
    }
    animFrameRef.current = requestAnimationFrame(animate)
  }, [drawOverlay])

  const stopMarchingAnts = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current)
    const oc = overlayCanvasRef.current
    if (oc) oc.getContext('2d')!.clearRect(0, 0, oc.width, oc.height)
  }, [overlayCanvasRef])

  const clearSelection = useCallback(() => {
    phaseRef.current = 'idle'
    lassoPointsRef.current = []
    selectionTargetRef.current = null
    selectionTargetRectRef.current = null
    stopMarchingAnts()
    onSelectionChange(false)
  }, [stopMarchingAnts, onSelectionChange])

  // Cut the selection out of the source canvas
  const cutSelection = useCallback(() => {
    if (phaseRef.current !== 'selected') return
    const pts = lassoPointsRef.current
    if (pts.length < 3) return
    const target = selectionTargetRef.current!
    const srcCanvas = getTargetCanvas(target)
    if (!srcCanvas) return
    const bb = getBoundingBox(pts)
    if (bb.w < 1 || bb.h < 1) return

    // Copy bounding box region to temp canvas, masked by lasso
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = Math.ceil(bb.w)
    tempCanvas.height = Math.ceil(bb.h)
    const tctx = tempCanvas.getContext('2d')!

    // Build path in bounding-box-local coords
    tctx.beginPath()
    tctx.moveTo(pts[0].x - bb.minX, pts[0].y - bb.minY)
    for (let i = 1; i < pts.length; i++) tctx.lineTo(pts[i].x - bb.minX, pts[i].y - bb.minY)
    tctx.closePath()
    tctx.clip()
    tctx.drawImage(srcCanvas, bb.minX, bb.minY, bb.w, bb.h, 0, 0, bb.w, bb.h)

    clipboardRef.current = {
      canvas: tempCanvas,
      width: Math.ceil(bb.w),
      height: Math.ceil(bb.h),
      sourceX: bb.minX,
      sourceY: bb.minY,
      path: [...pts],
    }

    // Erase from source
    onBeforeEdit?.(target)
    const sctx = srcCanvas.getContext('2d')!
    sctx.save()
    sctx.globalCompositeOperation = 'destination-out'
    sctx.beginPath()
    sctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) sctx.lineTo(pts[i].x, pts[i].y)
    sctx.closePath()
    sctx.fill()
    sctx.restore()

    clearSelection()
    return clipboardRef.current
  }, [getTargetCanvas, clearSelection])

  const copySelection = useCallback(() => {
    if (phaseRef.current !== 'selected') return
    const pts = lassoPointsRef.current
    if (pts.length < 3) return
    const target = selectionTargetRef.current!
    const srcCanvas = getTargetCanvas(target)
    if (!srcCanvas) return
    const bb = getBoundingBox(pts)
    if (bb.w < 1 || bb.h < 1) return

    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = Math.ceil(bb.w)
    tempCanvas.height = Math.ceil(bb.h)
    const tctx = tempCanvas.getContext('2d')!
    tctx.beginPath()
    tctx.moveTo(pts[0].x - bb.minX, pts[0].y - bb.minY)
    for (let i = 1; i < pts.length; i++) tctx.lineTo(pts[i].x - bb.minX, pts[i].y - bb.minY)
    tctx.closePath()
    tctx.clip()
    tctx.drawImage(srcCanvas, bb.minX, bb.minY, bb.w, bb.h, 0, 0, bb.w, bb.h)

    clipboardRef.current = {
      canvas: tempCanvas,
      width: Math.ceil(bb.w),
      height: Math.ceil(bb.h),
      sourceX: bb.minX,
      sourceY: bb.minY,
      path: [...pts],
    }
    clearSelection()
  }, [getTargetCanvas, clearSelection])

  const deleteSelection = useCallback(() => {
    if (phaseRef.current !== 'selected') return
    const pts = lassoPointsRef.current
    const target = selectionTargetRef.current!
    const srcCanvas = getTargetCanvas(target)
    if (!srcCanvas || pts.length < 3) { clearSelection(); return }
    onBeforeEdit?.(target)
    const sctx = srcCanvas.getContext('2d')!
    sctx.save()
    // Use destination-out to punch transparent holes (same as cut).
    // Page canvases show their CSS backgroundColor (#fffef8) through transparent pixels.
    // Desk canvas shows the body background through transparent pixels.
    sctx.globalCompositeOperation = 'destination-out'
    sctx.fillStyle = 'black'
    sctx.beginPath()
    sctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) sctx.lineTo(pts[i].x, pts[i].y)
    sctx.closePath()
    sctx.fill()
    sctx.restore()
    clearSelection()
  }, [getTargetCanvas, clearSelection])

  const startPaste = useCallback(() => {
    if (!clipboardRef.current) return
    phaseRef.current = 'pasting'
    startMarchingAnts()
  }, [startMarchingAnts])

  const commitPaste = useCallback(() => {
    if (phaseRef.current !== 'pasting' || !clipboardRef.current) return
    const cb = clipboardRef.current
    const target = pasteTargetRef.current
    if (!target) return
    const destCanvas = getTargetCanvas(target)
    if (!destCanvas) return
    onBeforeEdit?.(target)
    const dctx = destCanvas.getContext('2d')!
    const cx = pasteCanvasCoordRef.current.x - cb.width / 2
    const cy = pasteCanvasCoordRef.current.y - cb.height / 2
    dctx.drawImage(cb.canvas, cx, cy)
    clearSelection()
  }, [getTargetCanvas, clearSelection])

  // Pointer handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!enabled) return
    if (e.pointerType === 'touch' && !e.isPrimary) return
    const { target, rect, canvas } = getDrawTarget(e.clientX, e.clientY)
    if (!canvas || !rect) return

    if (phaseRef.current === 'pasting') {
      const coords = target.kind === 'desk' ? { x: e.clientX, y: e.clientY } : toCanvasCoords(e.clientX, e.clientY, rect, canvas)
      pasteCanvasCoordRef.current = coords
      pasteTargetRef.current = target
      pasteTargetRectRef.current = rect
      commitPaste()
      return
    }

    if (phaseRef.current === 'selected') {
      // Check if click is inside selection bounding box → start move
      if (selectionTargetRef.current && target.kind === selectionTargetRef.current.kind) {
        const pts = lassoPointsRef.current
        const bb = getBoundingBox(pts)
        const coords = target.kind === 'desk' ? { x: e.clientX, y: e.clientY } : toCanvasCoords(e.clientX, e.clientY, rect, canvas)
        if (coords.x >= bb.minX && coords.x <= bb.maxX && coords.y >= bb.minY && coords.y <= bb.maxY) {
          phaseRef.current = 'moving'
          moveStartRef.current = coords
          overlayDivRef.current?.setPointerCapture(e.pointerId)
          return
        }
      }
      clearSelection()
    }

    // Start lasso
    phaseRef.current = 'drawing-lasso'
    selectionTargetRef.current = target
    selectionTargetRectRef.current = rect
    const coords = target.kind === 'desk' ? { x: e.clientX, y: e.clientY } : toCanvasCoords(e.clientX, e.clientY, rect, canvas)
    lassoPointsRef.current = [coords]
    overlayDivRef.current?.setPointerCapture(e.pointerId)
  }, [enabled, getDrawTarget, clearSelection, commitPaste, overlayDivRef])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!enabled) return
    if (e.pointerType === 'touch' && !e.isPrimary) return

    if (phaseRef.current === 'pasting' && pasteTargetRef.current && pasteTargetRectRef.current) {
      const canvas = getTargetCanvas(pasteTargetRef.current)
      if (!canvas) return
      const coords = pasteTargetRef.current.kind === 'desk' ? { x: e.clientX, y: e.clientY } : toCanvasCoords(e.clientX, e.clientY, pasteTargetRectRef.current, canvas)
      pasteCanvasCoordRef.current = coords
      // Overlay will be updated by marching ants animation
      return
    }

    if (phaseRef.current === 'moving' && selectionTargetRef.current && selectionTargetRectRef.current) {
      const canvas = getTargetCanvas(selectionTargetRef.current)
      if (!canvas) return
      const rect = selectionTargetRectRef.current
      const coords = selectionTargetRef.current.kind === 'desk' ? { x: e.clientX, y: e.clientY } : toCanvasCoords(e.clientX, e.clientY, rect, canvas)
      const dx = coords.x - moveStartRef.current.x
      const dy = coords.y - moveStartRef.current.y
      lassoPointsRef.current = lassoPointsRef.current.map(p => ({ x: p.x + dx, y: p.y + dy }))
      moveStartRef.current = coords
      return
    }

    if (phaseRef.current === 'drawing-lasso' && selectionTargetRef.current && selectionTargetRectRef.current) {
      const canvas = getTargetCanvas(selectionTargetRef.current)
      if (!canvas) return
      const rect = selectionTargetRectRef.current
      const coords = selectionTargetRef.current.kind === 'desk' ? { x: e.clientX, y: e.clientY } : toCanvasCoords(e.clientX, e.clientY, rect, canvas)
      lassoPointsRef.current.push(coords)
      drawOverlay()
    }
  }, [enabled, getTargetCanvas, drawOverlay])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!enabled) return
    overlayDivRef.current?.releasePointerCapture(e.pointerId)

    if (phaseRef.current === 'moving') {
      phaseRef.current = 'selected'
      return
    }

    if (phaseRef.current === 'drawing-lasso') {
      const pts = lassoPointsRef.current
      if (pts.length < 5) {
        clearSelection()
        return
      }
      phaseRef.current = 'selected'
      onSelectionChange(true)
      startMarchingAnts()
    }
  }, [enabled, clearSelection, onSelectionChange, startMarchingAnts, overlayDivRef])

  // Keyboard shortcuts
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { clearSelection(); return }
      if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelection(); return }
      if ((e.ctrlKey || e.metaKey) && e.key === 'x') { e.preventDefault(); cutSelection(); return }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') { e.preventDefault(); copySelection(); return }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') { e.preventDefault(); startPaste(); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, clearSelection, deleteSelection, cutSelection, copySelection, startPaste])

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    clearSelection,
    cutSelection,
    copySelection,
    deleteSelection,
    startPaste,
    hasClipboard: () => !!clipboardRef.current,
    isSelectionActive: () => phaseRef.current === 'selected' || phaseRef.current === 'moving',
    isPasting: () => phaseRef.current === 'pasting',
  }
}

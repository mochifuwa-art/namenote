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

function rotatePoint(px: number, py: number, cx: number, cy: number, angle: number): Point {
  if (angle === 0) return { x: px, y: py }
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = px - cx
  const dy = py - cy
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
}

function dist(x1: number, y1: number, x2: number, y2: number) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2)
}

/** キャンバスの4隅がクリーム色なら旧形式と判定 */
function hasOpaqueBackground(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d')!
  const w = canvas.width, h = canvas.height
  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]] as const
  return corners.every(([x, y]) => {
    const p = ctx.getImageData(x, y, 1, 1).data
    return p[0] >= 240 && p[1] >= 240 && p[2] >= 220 && p[3] > 200
  })
}

/** キャンバスからクリーム色ピクセルを透明化（旧背景の除去） */
function stripOpaqueBackground(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = imageData.data
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] >= 240 && d[i + 1] >= 240 && d[i + 2] >= 220 && d[i + 3] > 200) d[i + 3] = 0
  }
  ctx.putImageData(imageData, 0, 0)
}

const HANDLE_HIT_R = 18   // タッチ対応の広いヒット半径 (px)
const HANDLE_DRAW_R = 8   // 描画ハンドル半径 (px)
const ROT_HANDLE_OFFSET = 40  // 回転ハンドルを上端から離す距離 (px)

interface UseSelectionOptions {
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>
  overlayDivRef: React.RefObject<HTMLDivElement | null>
  leftCanvasRef: React.RefObject<HTMLCanvasElement | null>
  rightCanvasRef: React.RefObject<HTMLCanvasElement | null>
  deskCanvasRef: React.RefObject<HTMLCanvasElement | null>
  enabled: boolean
  onBeforeEdit?: (target: DrawTarget) => void
  onSelectionChange: (hasSelection: boolean) => void
  onPasteChange?: (isPasting: boolean) => void
}

type Phase = 'idle' | 'drawing-lasso' | 'selected' | 'moving' | 'pasting'
type ActiveHandle = 'corner' | 'rotate' | null

export function useSelection({
  overlayCanvasRef,
  overlayDivRef,
  leftCanvasRef,
  rightCanvasRef,
  deskCanvasRef,
  enabled,
  onBeforeEdit,
  onSelectionChange,
  onPasteChange,
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

  // リサイズ・回転用
  const pasteScaleRef = useRef(1)
  const pasteRotationRef = useRef(0)
  const activeHandleRef = useRef<ActiveHandle>(null)
  const handleCenterRef = useRef<Point>({ x: 0, y: 0 })  // ハンドル操作開始時のペースト中心(スクリーン座標)
  const resizeInitDistRef = useRef(1)
  const resizeInitScaleRef = useRef(1)
  const rotStartAngleRef = useRef(0)
  const rotStartValueRef = useRef(0)
  const isPasteDraggingRef = useRef(false)  // ポインタダウン中のみtrue（ホバーでは追従しない）
  const isCutPasteRef = useRef(false)  // 切り取り/移動由来のペーストならtrue（キャンセル時に元位置に戻す）

  const getDrawTarget = useCallback((clientX: number, clientY: number): { target: DrawTarget; rect: DOMRect | null; canvas: HTMLCanvasElement | null } => {
    const leftRect = leftCanvasRef.current?.getBoundingClientRect() ?? null
    const rightRect = rightCanvasRef.current?.getBoundingClientRect() ?? null
    if (leftRect && leftRect.width > 0 && clientX >= leftRect.left && clientX <= leftRect.right && clientY >= leftRect.top && clientY <= leftRect.bottom) {
      return { target: { kind: 'page', side: 'left' }, rect: leftRect, canvas: leftCanvasRef.current }
    }
    if (rightRect && rightRect.width > 0 && clientX >= rightRect.left && clientX <= rightRect.right && clientY >= rightRect.top && clientY <= rightRect.bottom) {
      return { target: { kind: 'page', side: 'right' }, rect: rightRect, canvas: rightCanvasRef.current }
    }
    const deskRect = new DOMRect(0, 0, window.innerWidth, window.innerHeight)
    return { target: { kind: 'desk' }, rect: deskRect, canvas: deskCanvasRef.current }
  }, [leftCanvasRef, rightCanvasRef, deskCanvasRef])

  const getTargetCanvas = useCallback((target: DrawTarget): HTMLCanvasElement | null => {
    if (target.kind === 'desk') return deskCanvasRef.current
    return target.side === 'left' ? leftCanvasRef.current : rightCanvasRef.current
  }, [deskCanvasRef, leftCanvasRef, rightCanvasRef])

  /**
   * ペーストプレビューのハンドル座標を返す（スクリーン座標・回転済み）
   * cx/cy: ペースト中心, pw/ph: 表示サイズ
   * corners[4]: コーナーハンドル, rotHandle: 回転ハンドル
   */
  const getPasteHandles = useCallback((): {
    cx: number; cy: number; pw: number; ph: number
    corners: Point[]; rotHandle: Point
  } | null => {
    const cb = clipboardRef.current
    const target = pasteTargetRef.current
    const rect = pasteTargetRectRef.current
    if (!cb || !target || !rect) return null
    const targetCanvas = getTargetCanvas(target)
    if (!targetCanvas) return null

    const scaleX = rect.width / targetCanvas.width
    const scaleY = rect.height / targetCanvas.height
    const ox = target.kind === 'desk' ? 0 : rect.left
    const oy = target.kind === 'desk' ? 0 : rect.top
    const pw = cb.width * scaleX * pasteScaleRef.current
    const ph = cb.height * scaleY * pasteScaleRef.current
    const cx = pasteCanvasCoordRef.current.x * scaleX + ox
    const cy = pasteCanvasCoordRef.current.y * scaleY + oy
    const angle = pasteRotationRef.current

    const localCorners = [
      { x: cx - pw / 2, y: cy - ph / 2 },
      { x: cx + pw / 2, y: cy - ph / 2 },
      { x: cx - pw / 2, y: cy + ph / 2 },
      { x: cx + pw / 2, y: cy + ph / 2 },
    ]
    const corners = localCorners.map(c => rotatePoint(c.x, c.y, cx, cy, angle))
    const rotHandle = rotatePoint(cx, cy - ph / 2 - ROT_HANDLE_OFFSET, cx, cy, angle)

    return { cx, cy, pw, ph, corners, rotHandle }
  }, [getTargetCanvas])

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
      const scaleX = rect.width / canvas.width
      const scaleY = rect.height / canvas.height
      const ox = selectionTargetRef.current.kind === 'desk' ? 0 : rect.left
      const oy = selectionTargetRef.current.kind === 'desk' ? 0 : rect.top
      ctx.beginPath()
      ctx.setLineDash([5, 5])
      ctx.strokeStyle = 'rgba(60,120,255,0.9)'
      ctx.lineWidth = 1.5
      ctx.moveTo(pts[0].x * scaleX + ox, pts[0].y * scaleY + oy)
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
      const ox = selectionTargetRef.current.kind === 'desk' ? 0 : rect.left
      const oy = selectionTargetRef.current.kind === 'desk' ? 0 : rect.top
      ctx.beginPath()
      ctx.setLineDash([6, 3])
      ctx.lineDashOffset = -marchingOffsetRef.current
      ctx.strokeStyle = 'rgba(60,120,255,1)'
      ctx.lineWidth = 1.5
      ctx.moveTo(pts[0].x * scaleX + ox, pts[0].y * scaleY + oy)
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x * scaleX + ox, pts[i].y * scaleY + oy)
      }
      ctx.closePath()
      ctx.stroke()
    }

    if (phase === 'pasting' && clipboardRef.current && pasteTargetRef.current) {
      const handles = getPasteHandles()
      if (!handles) return
      const { cx, cy, pw, ph } = handles
      const cb = clipboardRef.current

      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(pasteRotationRef.current)

      // ペーストプレビュー画像
      ctx.globalAlpha = 0.75
      ctx.drawImage(cb.canvas, -pw / 2, -ph / 2, pw, ph)
      ctx.globalAlpha = 1

      // マーチングアンツの枠線
      ctx.setLineDash([6, 3])
      ctx.lineDashOffset = -marchingOffsetRef.current
      ctx.strokeStyle = 'rgba(60,120,255,1)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(-pw / 2, -ph / 2, pw, ph)

      // コーナーハンドル（リサイズ用・白丸）
      const localCorners = [
        { x: -pw / 2, y: -ph / 2 }, { x: pw / 2, y: -ph / 2 },
        { x: -pw / 2, y:  ph / 2 }, { x: pw / 2, y:  ph / 2 },
      ]
      ctx.setLineDash([])
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = 'rgba(60,120,255,1)'
      ctx.lineWidth = 1.5
      for (const c of localCorners) {
        ctx.beginPath()
        ctx.arc(c.x, c.y, HANDLE_DRAW_R, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }

      // 回転ハンドル（青丸・上中央から離れた位置）
      const rhY = -ph / 2 - ROT_HANDLE_OFFSET
      ctx.beginPath()
      ctx.moveTo(0, -ph / 2)
      ctx.lineTo(0, rhY)
      ctx.setLineDash([3, 3])
      ctx.strokeStyle = 'rgba(60,120,255,0.5)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.arc(0, rhY, HANDLE_DRAW_R, 0, Math.PI * 2)
      ctx.fillStyle = '#60a5fa'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      ctx.restore()
    }
  }, [overlayCanvasRef, getTargetCanvas, getPasteHandles])

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
    onPasteChange?.(false)
  }, [stopMarchingAnts, onSelectionChange, onPasteChange])

  const cutSelection = useCallback(() => {
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

    // 旧形式（クリーム背景）からコピーした場合、背景色を透明化
    if (hasOpaqueBackground(srcCanvas)) stripOpaqueBackground(tempCanvas)

    isCutPasteRef.current = false  // 単体の切り取りは確定操作。キャンセルしても戻さない
    clipboardRef.current = {
      canvas: tempCanvas,
      width: Math.ceil(bb.w),
      height: Math.ceil(bb.h),
      sourceX: bb.minX,
      sourceY: bb.minY,
      path: [...pts],
      sourceTarget: target,
    }

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
  }, [getTargetCanvas, onBeforeEdit, clearSelection])

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

    // 旧形式（クリーム背景）からコピーした場合、背景色を透明化
    if (hasOpaqueBackground(srcCanvas)) stripOpaqueBackground(tempCanvas)

    isCutPasteRef.current = false
    clipboardRef.current = {
      canvas: tempCanvas,
      width: Math.ceil(bb.w),
      height: Math.ceil(bb.h),
      sourceX: bb.minX,
      sourceY: bb.minY,
      path: [...pts],
      sourceTarget: target,
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
    sctx.globalCompositeOperation = 'destination-out'
    sctx.fillStyle = 'black'
    sctx.beginPath()
    sctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) sctx.lineTo(pts[i].x, pts[i].y)
    sctx.closePath()
    sctx.fill()
    sctx.restore()
    clearSelection()
  }, [getTargetCanvas, onBeforeEdit, clearSelection])

  /** ペーストを開始。クリップボードの元位置にプレビューを初期表示する */
  const startPaste = useCallback(() => {
    const cb = clipboardRef.current
    if (!cb) return
    const srcCanvas = getTargetCanvas(cb.sourceTarget)
    const srcRect = srcCanvas?.getBoundingClientRect() ?? null
    if (srcCanvas && srcRect) {
      pasteTargetRef.current = cb.sourceTarget
      pasteTargetRectRef.current = srcRect
      pasteCanvasCoordRef.current = { x: cb.sourceX + cb.width / 2, y: cb.sourceY + cb.height / 2 }
    }
    pasteScaleRef.current = 1
    pasteRotationRef.current = 0
    isPasteDraggingRef.current = false
    phaseRef.current = 'pasting'
    onPasteChange?.(true)
    startMarchingAnts()
  }, [startMarchingAnts, getTargetCanvas, onPasteChange])

  /** スケール・回転を適用してペーストをコミット */
  const commitPaste = useCallback(() => {
    if (phaseRef.current !== 'pasting' || !clipboardRef.current) return
    const cb = clipboardRef.current
    const target = pasteTargetRef.current
    if (!target) return
    const destCanvas = getTargetCanvas(target)
    if (!destCanvas) return
    onBeforeEdit?.(target)
    const dctx = destCanvas.getContext('2d')!
    const scaledW = cb.width * pasteScaleRef.current
    const scaledH = cb.height * pasteScaleRef.current
    dctx.save()
    dctx.translate(pasteCanvasCoordRef.current.x, pasteCanvasCoordRef.current.y)
    dctx.rotate(pasteRotationRef.current)
    dctx.drawImage(cb.canvas, 0, 0, cb.width, cb.height, -scaledW / 2, -scaledH / 2, scaledW, scaledH)
    dctx.restore()
    clearSelection()
  }, [getTargetCanvas, onBeforeEdit, clearSelection])

  /** 選択範囲をその場で切り取ってペースト開始（移動操作） */
  const startMove = useCallback(() => {
    if (phaseRef.current !== 'selected') return
    const pts = lassoPointsRef.current
    if (pts.length < 3) return
    const target = selectionTargetRef.current!
    const rect = selectionTargetRectRef.current!
    const bb = getBoundingBox(pts)

    cutSelection()
    isCutPasteRef.current = true  // 移動は切り取り+貼り付けを1操作として扱う。キャンセル時に元位置に戻す

    pasteTargetRef.current = target
    pasteTargetRectRef.current = rect
    pasteCanvasCoordRef.current = { x: bb.minX + bb.w / 2, y: bb.minY + bb.h / 2 }
    pasteScaleRef.current = 1
    pasteRotationRef.current = 0
    isPasteDraggingRef.current = false
    phaseRef.current = 'pasting'
    onPasteChange?.(true)
    startMarchingAnts()
  }, [cutSelection, startMarchingAnts, onPasteChange])

  // Pointer handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!enabled && phaseRef.current !== 'pasting') return
    if (e.pointerType === 'touch' && !e.isPrimary) return
    const { target, rect, canvas } = getDrawTarget(e.clientX, e.clientY)
    if (!canvas || !rect) return

    if (phaseRef.current === 'pasting') {
      const handles = getPasteHandles()
      if (handles) {
        const { cx, cy, corners, rotHandle } = handles

        // 回転ハンドル判定
        if (dist(e.clientX, e.clientY, rotHandle.x, rotHandle.y) <= HANDLE_HIT_R) {
          activeHandleRef.current = 'rotate'
          handleCenterRef.current = { x: cx, y: cy }
          rotStartAngleRef.current = Math.atan2(e.clientY - cy, e.clientX - cx)
          rotStartValueRef.current = pasteRotationRef.current
          overlayDivRef.current?.setPointerCapture(e.pointerId)
          return
        }

        // コーナーハンドル判定
        for (const c of corners) {
          if (dist(e.clientX, e.clientY, c.x, c.y) <= HANDLE_HIT_R) {
            activeHandleRef.current = 'corner'
            handleCenterRef.current = { x: cx, y: cy }
            const dx = c.x - cx
            const dy = c.y - cy
            resizeInitDistRef.current = Math.sqrt(dx * dx + dy * dy) || 1
            resizeInitScaleRef.current = pasteScaleRef.current
            overlayDivRef.current?.setPointerCapture(e.pointerId)
            return
          }
        }
      }

      // ハンドル以外: ドラッグ開始（ポインタダウン中だけ追従）
      isPasteDraggingRef.current = true
      pasteTargetRef.current = target
      pasteTargetRectRef.current = rect
      const coords = target.kind === 'desk'
        ? { x: e.clientX, y: e.clientY }
        : toCanvasCoords(e.clientX, e.clientY, rect, canvas)
      pasteCanvasCoordRef.current = coords
      overlayDivRef.current?.setPointerCapture(e.pointerId)
      return
    }

    if (phaseRef.current === 'selected') {
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

    // なげなわ開始
    phaseRef.current = 'drawing-lasso'
    selectionTargetRef.current = target
    selectionTargetRectRef.current = rect
    const coords = target.kind === 'desk' ? { x: e.clientX, y: e.clientY } : toCanvasCoords(e.clientX, e.clientY, rect, canvas)
    lassoPointsRef.current = [coords]
    overlayDivRef.current?.setPointerCapture(e.pointerId)
  }, [enabled, getDrawTarget, getPasteHandles, clearSelection, overlayDivRef])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!enabled && phaseRef.current !== 'pasting') return
    if (e.pointerType === 'touch' && !e.isPrimary) return

    if (phaseRef.current === 'pasting') {
      if (activeHandleRef.current === 'corner') {
        // リサイズ: 中心からの距離比でスケール更新
        const cx = handleCenterRef.current.x
        const cy = handleCenterRef.current.y
        const dx = e.clientX - cx
        const dy = e.clientY - cy
        const newDist = Math.sqrt(dx * dx + dy * dy) || 1
        pasteScaleRef.current = Math.max(0.1, resizeInitScaleRef.current * newDist / resizeInitDistRef.current)
        return
      }
      if (activeHandleRef.current === 'rotate') {
        // 回転: 中心から見たポインタ角度の変化量を加算
        const cx = handleCenterRef.current.x
        const cy = handleCenterRef.current.y
        const angle = Math.atan2(e.clientY - cy, e.clientX - cx)
        pasteRotationRef.current = rotStartValueRef.current + (angle - rotStartAngleRef.current)
        return
      }
      // ドラッグ中のみペースト位置を更新（ホバーでは追従しない）
      if (isPasteDraggingRef.current) {
        const { target, rect, canvas } = getDrawTarget(e.clientX, e.clientY)
        if (canvas && rect) {
          pasteTargetRef.current = target
          pasteTargetRectRef.current = rect
          const coords = target.kind === 'desk'
            ? { x: e.clientX, y: e.clientY }
            : toCanvasCoords(e.clientX, e.clientY, rect, canvas)
          pasteCanvasCoordRef.current = coords
        }
      }
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
  }, [enabled, getDrawTarget, getTargetCanvas, drawOverlay])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!enabled && phaseRef.current !== 'pasting') return
    overlayDivRef.current?.releasePointerCapture(e.pointerId)

    if (phaseRef.current === 'pasting') {
      activeHandleRef.current = null
      isPasteDraggingRef.current = false
      return
    }

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

  /** ペーストをキャンセル。
   *  移動操作（startMove）由来: 元位置にコンテンツを復元して選択状態に戻る。
   *  切り取り単体/コピー由来: 浮動プレビューを破棄してアイドルに戻る（他ペイントソフトの標準挙動）。
   */
  const cancelPaste = useCallback(() => {
    if (phaseRef.current !== 'pasting') return
    const cb = clipboardRef.current
    if (!cb) { clearSelection(); return }

    if (isCutPasteRef.current) {
      // 移動操作: 元キャンバスにコンテンツを戻して選択状態を復元
      const srcCanvas = getTargetCanvas(cb.sourceTarget)
      if (srcCanvas) {
        onBeforeEdit?.(cb.sourceTarget)
        const sctx = srcCanvas.getContext('2d')!
        sctx.drawImage(cb.canvas, cb.sourceX, cb.sourceY)
      }
      lassoPointsRef.current = [...cb.path]
      selectionTargetRef.current = cb.sourceTarget
      selectionTargetRectRef.current = getTargetCanvas(cb.sourceTarget)?.getBoundingClientRect() ?? null
      isPasteDraggingRef.current = false
      phaseRef.current = 'selected'
      onSelectionChange(true)
      onPasteChange?.(false)
      stopMarchingAnts()
      startMarchingAnts()
    } else {
      // 切り取り単体 or コピー: 浮動プレビューを破棄してアイドルへ
      clearSelection()
    }
  }, [clearSelection, getTargetCanvas, onBeforeEdit, onSelectionChange, onPasteChange, stopMarchingAnts, startMarchingAnts])

  // Keyboard shortcuts
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (phaseRef.current === 'pasting') cancelPaste(); else clearSelection(); return }
      if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelection(); return }
      if ((e.ctrlKey || e.metaKey) && e.key === 'x') { e.preventDefault(); cutSelection(); return }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') { e.preventDefault(); copySelection(); return }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') { e.preventDefault(); startPaste(); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, cancelPaste, clearSelection, deleteSelection, cutSelection, copySelection, startPaste])

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    clearSelection,
    cutSelection,
    copySelection,
    deleteSelection,
    startPaste,
    startMove,
    commitPaste,
    cancelPaste,
    hasClipboard: () => !!clipboardRef.current,
    isSelectionActive: () => phaseRef.current === 'selected' || phaseRef.current === 'moving',
    isPasting: () => phaseRef.current === 'pasting',
  }
}

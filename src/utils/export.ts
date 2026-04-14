import { jsPDF } from 'jspdf'
import { PAGE_WIDTH, PAGE_HEIGHT } from '../components/PageCanvas'
import { saveWithPicker } from './filePicker'
import type { TextObject } from '../types'

// ── Text rendering ────────────────────────────────────────────────────────

function renderTextToCtx(
  ctx: CanvasRenderingContext2D,
  objects: TextObject[],
  side: 'left' | 'right',
  spread: number,
) {
  const items = objects.filter(
    o => o.side === side && o.spread === spread && o.text.trim(),
  )
  for (const obj of items) {
    ctx.save()
    ctx.fillStyle = obj.color
    ctx.font = `${obj.fontSize}px "Hiragino Mincho ProN", "游明朝", YuMincho, serif`
    ctx.textBaseline = 'top'

    if (obj.writingMode === 'vertical-rl') {
      // Draw each character vertically (right-to-left columns)
      let cx = obj.x
      let cy = obj.y
      const charH = obj.fontSize * 1.5
      const colW = obj.fontSize * 1.2
      for (const char of [...obj.text]) {
        if (char === '\n') {
          cx -= colW
          cy = obj.y
        } else {
          ctx.fillText(char, cx, cy)
          cy += charH
        }
      }
    } else {
      // Horizontal text, newline-aware
      const lines = obj.text.split('\n')
      const lineH = obj.fontSize * 1.5
      lines.forEach((line, i) => {
        ctx.fillText(line, obj.x, obj.y + i * lineH)
      })
    }
    ctx.restore()
  }
}

// ── Exports ───────────────────────────────────────────────────────────────

/** Export current spread as JPEG via save picker. Returns the saved filename. */
export async function exportSpreadAsJpg(
  leftCanvas: HTMLCanvasElement | null,
  rightCanvas: HTMLCanvasElement | null,
  rightPageNum: number,
  textObjects: TextObject[] = [],
  spreadIndex = 0,
): Promise<string> {
  const w = PAGE_WIDTH * 2
  const h = PAGE_HEIGHT
  const merged = document.createElement('canvas')
  merged.width = w
  merged.height = h
  const ctx = merged.getContext('2d')!
  ctx.fillStyle = '#fffef8'
  ctx.fillRect(0, 0, w, h)
  // Page canvases are HiDPI (CANVAS_SCALE×); use 9-arg drawImage to downscale.
  if (rightCanvas) {
    ctx.drawImage(rightCanvas, 0, 0, rightCanvas.width, rightCanvas.height, PAGE_WIDTH, 0, PAGE_WIDTH, PAGE_HEIGHT)
  }
  if (leftCanvas) {
    ctx.drawImage(leftCanvas, 0, 0, leftCanvas.width, leftCanvas.height, 0, 0, PAGE_WIDTH, PAGE_HEIGHT)
  }
  // Render text objects on top
  renderTextToCtx(ctx, textObjects.map(o => ({ ...o, x: o.side === 'right' ? o.x + PAGE_WIDTH : o.x })), 'right', spreadIndex)
  const leftCtx = (() => {
    const tmp = document.createElement('canvas')
    tmp.width = PAGE_WIDTH; tmp.height = PAGE_HEIGHT
    const c = tmp.getContext('2d')!
    renderTextToCtx(c, textObjects, 'left', spreadIndex)
    return c
  })()
  ctx.drawImage(leftCtx.canvas, 0, 0)

  const blob = await new Promise<Blob>((resolve, reject) =>
    merged.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', 0.92)
  )
  const filename = `namenote_p${rightPageNum}-${rightPageNum + 1}.jpg`
  const result = await saveWithPicker(blob, filename, [
    { description: 'JPEG 画像', accept: { 'image/jpeg': ['.jpg'] } },
  ])
  return result.filename
}

/** Export a single page as JPEG. Returns the saved filename. */
export async function exportPageAsJpg(
  canvas: HTMLCanvasElement | null,
  pageNumber: number,
): Promise<string> {
  if (!canvas) return ''
  const out = document.createElement('canvas')
  out.width = PAGE_WIDTH
  out.height = PAGE_HEIGHT
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#fffef8'
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT)
  ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, PAGE_WIDTH, PAGE_HEIGHT)

  const blob = await new Promise<Blob>((resolve, reject) =>
    out.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', 0.92)
  )
  const filename = `namenote_p${pageNumber}.jpg`
  const result = await saveWithPicker(blob, filename, [
    { description: 'JPEG 画像', accept: { 'image/jpeg': ['.jpg'] } },
  ])
  return result.filename
}

/**
 * Export all spreads as a PDF, one page per canvas page (portrait A4).
 * Page order: right page then left page for each spread (reading order for right-bound notebooks).
 * Returns the saved filename.
 */
export async function exportAllAsPdf(
  totalSpreads: number,
  getSpreadData: (i: number) => { leftData: string | null; rightData: string | null },
  textObjects: TextObject[] = [],
): Promise<string> {
  const mmW = 210  // A4 portrait width (mm)
  const mmH = 297  // A4 portrait height (mm)
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [mmW, mmH] })
  let isFirstPage = true

  const renderPage = (data: string | null, side: 'left' | 'right', spreadIndex: number) => {
    if (!isFirstPage) pdf.addPage([mmW, mmH], 'portrait')
    isFirstPage = false

    if (data) pdf.addImage(data, 'PNG', 0, 0, mmW, mmH)

    // Overlay text objects for this page
    const pageTexts = textObjects.filter(
      o => o.side === side && o.spread === spreadIndex && o.text.trim(),
    )
    if (pageTexts.length > 0) {
      const tmp = document.createElement('canvas')
      tmp.width = PAGE_WIDTH
      tmp.height = PAGE_HEIGHT
      renderTextToCtx(tmp.getContext('2d')!, pageTexts, side, spreadIndex)
      pdf.addImage(tmp.toDataURL('image/png'), 'PNG', 0, 0, mmW, mmH)
    }
  }

  for (let i = 0; i < totalSpreads; i++) {
    const { leftData, rightData } = getSpreadData(i)
    // Right page first (odd pages: 1, 3, 5… in right-bound reading order)
    renderPage(rightData, 'right', i)
    // Left page second (even pages: 2, 4, 6…)
    renderPage(leftData, 'left', i)
  }

  const filename = `namenote_${new Date().toISOString().slice(0, 10)}.pdf`
  const blob = pdf.output('blob')
  const result = await saveWithPicker(blob, filename, [
    { description: 'PDF', accept: { 'application/pdf': ['.pdf'] } },
  ])
  return result.filename
}

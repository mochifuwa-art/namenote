import { jsPDF } from 'jspdf'
import { PAGE_WIDTH, PAGE_HEIGHT } from '../components/PageCanvas'
import { saveBlobAsDownload } from './filePicker'
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

/** Export current spread as JPEG. Returns the saved filename. */
export function exportSpreadAsJpg(
  leftCanvas: HTMLCanvasElement | null,
  rightCanvas: HTMLCanvasElement | null,
  rightPageNum: number,
  textObjects: TextObject[] = [],
  spreadIndex = 0,
): string {
  const w = PAGE_WIDTH * 2
  const h = PAGE_HEIGHT
  const merged = document.createElement('canvas')
  merged.width = w
  merged.height = h
  const ctx = merged.getContext('2d')!
  ctx.fillStyle = '#fffef8'
  ctx.fillRect(0, 0, w, h)
  if (rightCanvas) ctx.drawImage(rightCanvas, PAGE_WIDTH, 0)
  if (leftCanvas) ctx.drawImage(leftCanvas, 0, 0)
  // Render text objects on top
  renderTextToCtx(ctx, textObjects.map(o => ({ ...o, x: o.side === 'right' ? o.x + PAGE_WIDTH : o.x })), 'right', spreadIndex)
  // Left page starts at x=0
  const leftCtx = (() => {
    const tmp = document.createElement('canvas')
    tmp.width = PAGE_WIDTH; tmp.height = PAGE_HEIGHT
    const c = tmp.getContext('2d')!
    renderTextToCtx(c, textObjects, 'left', spreadIndex)
    return c
  })()
  ctx.drawImage(leftCtx.canvas, 0, 0)

  const dataUrl = merged.toDataURL('image/jpeg', 0.92)
  const a = document.createElement('a')
  const filename = `namenote_p${rightPageNum}-${rightPageNum + 1}.jpg`
  a.download = filename
  a.href = dataUrl
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  return filename
}

/** Export a single page as JPEG. Returns the saved filename. */
export function exportPageAsJpg(
  canvas: HTMLCanvasElement | null,
  pageNumber: number,
): string {
  if (!canvas) return ''
  const out = document.createElement('canvas')
  out.width = PAGE_WIDTH
  out.height = PAGE_HEIGHT
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#fffef8'
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT)
  ctx.drawImage(canvas, 0, 0)
  const dataUrl = out.toDataURL('image/jpeg', 0.92)
  const a = document.createElement('a')
  const filename = `namenote_p${pageNumber}.jpg`
  a.download = filename
  a.href = dataUrl
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  return filename
}

/** Export all spreads as a PDF. Returns the saved filename. */
export function exportAllAsPdf(
  totalSpreads: number,
  getSpreadData: (i: number) => { leftData: string | null; rightData: string | null },
  textObjects: TextObject[] = [],
): string {
  const mmW = 297
  const mmH = 210
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [mmW * 2, mmH] })

  for (let i = 0; i < totalSpreads; i++) {
    if (i > 0) pdf.addPage([mmW * 2, mmH], 'landscape')
    const { leftData, rightData } = getSpreadData(i)
    if (leftData) pdf.addImage(leftData, 'PNG', 0, 0, mmW, mmH)
    if (rightData) pdf.addImage(rightData, 'PNG', mmW, 0, mmW, mmH)

    // Render text objects for this spread onto a temporary canvas and overlay
    const spreadTexts = textObjects.filter(
      o => (o.side === 'left' || o.side === 'right') && o.spread === i && o.text.trim(),
    )
    if (spreadTexts.length > 0) {
      const tmp = document.createElement('canvas')
      tmp.width = PAGE_WIDTH * 2
      tmp.height = PAGE_HEIGHT
      const tctx = tmp.getContext('2d')!
      // Left page text
      renderTextToCtx(tctx, spreadTexts, 'left', i)
      // Right page text (offset by PAGE_WIDTH)
      const rightTexts = spreadTexts
        .filter(o => o.side === 'right')
        .map(o => ({ ...o, x: o.x + PAGE_WIDTH }))
      for (const obj of rightTexts) {
        tctx.save()
        tctx.fillStyle = obj.color
        tctx.font = `${obj.fontSize}px "Hiragino Mincho ProN", serif`
        tctx.textBaseline = 'top'
        const lines = obj.text.split('\n')
        const lineH = obj.fontSize * 1.5
        lines.forEach((line, li) => tctx.fillText(line, obj.x, obj.y + li * lineH))
        tctx.restore()
      }
      pdf.addImage(tmp.toDataURL('image/png'), 'PNG', 0, 0, mmW * 2, mmH)
    }
  }

  const filename = `namenote_${new Date().toISOString().slice(0, 10)}.pdf`
  const blob = pdf.output('blob')
  return saveBlobAsDownload(blob, filename)
}

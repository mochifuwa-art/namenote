import { PAGE_WIDTH, PAGE_HEIGHT } from '../components/PageCanvas'
import { saveBlobWithPicker } from './filePicker'

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), type, quality)
  })
}

/** Export current spread as JPEG. Returns the saved filename. */
export async function exportSpreadAsJpg(
  leftCanvas: HTMLCanvasElement | null,
  rightCanvas: HTMLCanvasElement | null,
  rightPageNum: number   // manga: right page is the lower (odd) page number
): Promise<string> {
  const w = PAGE_WIDTH * 2
  const h = PAGE_HEIGHT
  const merged = document.createElement('canvas')
  merged.width = w
  merged.height = h
  const ctx = merged.getContext('2d')!
  ctx.fillStyle = '#fffef8'
  ctx.fillRect(0, 0, w, h)
  // Right page on the right side, left page on the left side (matches notebook view)
  if (rightCanvas) ctx.drawImage(rightCanvas, PAGE_WIDTH, 0)
  if (leftCanvas)  ctx.drawImage(leftCanvas, 0, 0)
  const blob = await canvasToBlob(merged, 'image/jpeg', 0.92)
  const filename = `namenote_p${rightPageNum}-${rightPageNum + 1}.jpg`
  return saveBlobWithPicker(blob, filename, [
    { description: 'JPEG 画像', accept: { 'image/jpeg': ['.jpg', '.jpeg'] } },
  ])
}

/** Export a single page as JPEG. Returns the saved filename. */
export async function exportPageAsJpg(
  canvas: HTMLCanvasElement | null,
  pageNumber: number
): Promise<string> {
  if (!canvas) return ''
  const out = document.createElement('canvas')
  out.width = PAGE_WIDTH
  out.height = PAGE_HEIGHT
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#fffef8'
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT)
  ctx.drawImage(canvas, 0, 0)
  const blob = await canvasToBlob(out, 'image/jpeg', 0.92)
  const filename = `namenote_p${pageNumber}.jpg`
  return saveBlobWithPicker(blob, filename, [
    { description: 'JPEG 画像', accept: { 'image/jpeg': ['.jpg', '.jpeg'] } },
  ])
}

/** Export all spreads as a PDF. Returns the saved filename. */
export async function exportAllAsPdf(
  totalSpreads: number,
  getSpreadData: (i: number) => { leftData: string | null; rightData: string | null }
): Promise<string> {
  const { jsPDF } = await import('jspdf')
  const mmW = 297
  const mmH = 210
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [mmW * 2, mmH] })

  for (let i = 0; i < totalSpreads; i++) {
    if (i > 0) pdf.addPage([mmW * 2, mmH], 'landscape')
    const { leftData, rightData } = getSpreadData(i)
    // Right page (lower number) on the right half, left page (higher number) on the left half
    if (leftData)  pdf.addImage(leftData,  'PNG', 0,   0, mmW, mmH)
    if (rightData) pdf.addImage(rightData, 'PNG', mmW, 0, mmW, mmH)
  }

  const blob = pdf.output('blob')
  const filename = `namenote_${new Date().toISOString().slice(0, 10)}.pdf`
  return saveBlobWithPicker(blob, filename, [
    { description: 'PDF ファイル', accept: { 'application/pdf': ['.pdf'] } },
  ])
}

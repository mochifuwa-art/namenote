import { jsPDF } from 'jspdf'
import { PAGE_WIDTH, PAGE_HEIGHT } from '../components/PageCanvas'
import { saveBlobAsDownload } from './filePicker'

/** Export current spread as JPEG. Returns the saved filename. */
export function exportSpreadAsJpg(
  leftCanvas: HTMLCanvasElement | null,
  rightCanvas: HTMLCanvasElement | null,
  rightPageNum: number
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
  if (leftCanvas)  ctx.drawImage(leftCanvas, 0, 0)
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
  pageNumber: number
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
  getSpreadData: (i: number) => { leftData: string | null; rightData: string | null }
): string {
  const mmW = 297
  const mmH = 210
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [mmW * 2, mmH] })

  for (let i = 0; i < totalSpreads; i++) {
    if (i > 0) pdf.addPage([mmW * 2, mmH], 'landscape')
    const { leftData, rightData } = getSpreadData(i)
    if (leftData)  pdf.addImage(leftData,  'PNG', 0,   0, mmW, mmH)
    if (rightData) pdf.addImage(rightData, 'PNG', mmW, 0, mmW, mmH)
  }

  const filename = `namenote_${new Date().toISOString().slice(0, 10)}.pdf`
  const blob = pdf.output('blob')
  return saveBlobAsDownload(blob, filename)
}

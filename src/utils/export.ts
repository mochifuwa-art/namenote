import { PAGE_WIDTH, PAGE_HEIGHT } from '../components/PageCanvas'

export function exportSpreadAsJpg(
  leftCanvas: HTMLCanvasElement | null,
  rightCanvas: HTMLCanvasElement | null,
  spreadIndex: number
) {
  const w = PAGE_WIDTH * 2
  const h = PAGE_HEIGHT
  const merged = document.createElement('canvas')
  merged.width = w
  merged.height = h
  const ctx = merged.getContext('2d')!
  ctx.fillStyle = '#fffef8'
  ctx.fillRect(0, 0, w, h)
  if (leftCanvas) ctx.drawImage(leftCanvas, 0, 0)
  if (rightCanvas) ctx.drawImage(rightCanvas, PAGE_WIDTH, 0)
  const link = document.createElement('a')
  link.download = `namenote_spread_${spreadIndex + 1}.jpg`
  link.href = merged.toDataURL('image/jpeg', 0.92)
  link.click()
}

export function exportPageAsJpg(
  canvas: HTMLCanvasElement | null,
  pageNumber: number
) {
  if (!canvas) return
  const out = document.createElement('canvas')
  out.width = PAGE_WIDTH
  out.height = PAGE_HEIGHT
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#fffef8'
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT)
  ctx.drawImage(canvas, 0, 0)
  const link = document.createElement('a')
  link.download = `namenote_page_${pageNumber}.jpg`
  link.href = out.toDataURL('image/jpeg', 0.92)
  link.click()
}

export async function exportAllAsPdf(
  totalSpreads: number,
  getSpreadData: (i: number) => { leftData: string | null; rightData: string | null }
) {
  const { jsPDF } = await import('jspdf')
  // A4 landscape sized for the spread (297×210mm per page, 2 pages wide)
  const mmW = 297
  const mmH = 210
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [mmW * 2, mmH] })

  for (let i = 0; i < totalSpreads; i++) {
    if (i > 0) pdf.addPage([mmW * 2, mmH], 'landscape')
    const { leftData, rightData } = getSpreadData(i)
    if (leftData) pdf.addImage(leftData, 'PNG', 0, 0, mmW, mmH)
    if (rightData) pdf.addImage(rightData, 'PNG', mmW, 0, mmW, mmH)
  }
  pdf.save('namenote.pdf')
}

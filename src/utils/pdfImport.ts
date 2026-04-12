import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { CANVAS_SCALE } from './canvasScale'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

/**
 * Import a PDF file and render each page to a data URL (JPEG).
 * Pages are returned in order: index 0 = PDF page 1, index 1 = PDF page 2, ...
 * The caller maps them to notebook pages in right-to-left order.
 *
 * @param file - The PDF file to import
 * @param pageWidth - Target canvas width (pixels)
 * @param pageHeight - Target canvas height (pixels)
 * @param onProgress - Optional progress callback (current page, total pages)
 */
export async function importPdfPages(
  file: File,
  pageWidth: number,
  pageHeight: number,
  onProgress?: (current: number, total: number) => void
): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pages: string[] = []

  // Render at HiDPI resolution so imported pages match the new page-canvas backing store
  const physW = pageWidth * CANVAS_SCALE
  const physH = pageHeight * CANVAS_SCALE

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 1 })

    // Scale to fit within physW × physH, keeping aspect ratio
    const scale = Math.min(physW / viewport.width, physH / viewport.height)
    const scaledViewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = physW
    canvas.height = physH

    // Center the rendered page within the canvas
    const offsetX = (physW - scaledViewport.width) / 2
    const offsetY = (physH - scaledViewport.height) / 2

    // pdfjs-dist v5: use `canvas` as primary parameter (canvasContext is legacy)
    await page.render({
      canvas,
      viewport: scaledViewport,
      transform: [1, 0, 0, 1, offsetX, offsetY],
      background: '#fffef8',
    }).promise

    // JPEG to keep localStorage usage well within the ~5 MB limit
    pages.push(canvas.toDataURL('image/jpeg', 0.92))
    onProgress?.(i, pdf.numPages)
  }

  return pages
}

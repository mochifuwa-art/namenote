import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

/**
 * Import a PDF file and render each page to a data URL (PNG).
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

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 1 })

    // Scale to fit within pageWidth × pageHeight, keeping aspect ratio
    const scale = Math.min(pageWidth / viewport.width, pageHeight / viewport.height)
    const scaledViewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = pageWidth
    canvas.height = pageHeight
    const ctx = canvas.getContext('2d')!

    // White notebook background
    ctx.fillStyle = '#fffef8'
    ctx.fillRect(0, 0, pageWidth, pageHeight)

    // Center the rendered page within the canvas
    const offsetX = (pageWidth - scaledViewport.width) / 2
    const offsetY = (pageHeight - scaledViewport.height) / 2

    await page.render({
      canvasContext: ctx,
      canvas,
      viewport: scaledViewport,
      transform: [1, 0, 0, 1, offsetX, offsetY],
    }).promise

    pages.push(canvas.toDataURL('image/png'))
    onProgress?.(i, pdf.numPages)
  }

  return pages
}

/**
 * Save a Blob as a file download (browser's default Downloads folder).
 * Returns the filename used.
 */
export function saveBlobAsDownload(blob: Blob, filename: string): string {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.download = filename
  a.href = url
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return filename
}

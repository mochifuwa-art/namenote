type FilePickerType = { description: string; accept: Record<string, string[]> }

/**
 * Save a Blob with the File System Access API when available (user chooses location),
 * or fall back to a browser download link (saves to Downloads folder).
 * Throws an AbortError if the user cancels the file picker.
 * Returns the actual filename used.
 */
export async function saveBlobWithPicker(
  blob: Blob,
  filename: string,
  types: FilePickerType[]
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ('showSaveFilePicker' in window) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handle = await (window as any).showSaveFilePicker({ suggestedName: filename, types })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return handle.name as string
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
      // Other errors (permissions, etc.) — fall through to download
    }
  }
  // Fallback: standard anchor download
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.download = filename
  a.href = url
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return filename
}

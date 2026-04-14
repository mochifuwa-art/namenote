import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

function isNativePlatform(): boolean {
  return !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor?.isNativePlatform?.()
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      // Strip "data:<mime>;base64," prefix
      resolve(dataUrl.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function shareNative(blob: Blob, filename: string): Promise<void> {
  const base64 = await blobToBase64(blob)
  await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache })
  const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache })
  await Share.share({ title: filename, url: uri, dialogTitle: '保存先を選択' })
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.download = filename
  a.href = url
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** Result from saveWithPicker — store this to enable overwriting later. */
export interface SaveResult {
  filename: string
  /** File System Access API handle for silent overwrite on subsequent saves (web only). */
  handle: FileSystemFileHandle | null
}

/**
 * Show a native save dialog then write the blob.
 *
 * - Chrome/Edge (desktop): File System Access API — real "Save As" dialog that lets
 *   the user name the file and pick the location. Returns a handle for silent overwrite.
 * - iOS/Android (Capacitor): share sheet — user chooses destination app/folder. handle = null.
 * - Other browsers (Firefox, Safari): <a download> — browser handles save location.
 *
 * Throws AbortError if the user cancels the picker.
 */
export async function saveWithPicker(
  blob: Blob,
  suggestedName: string,
  types?: Array<{ description: string; accept: Record<string, string[]> }>,
): Promise<SaveResult> {
  if (isNativePlatform()) {
    await shareNative(blob, suggestedName)
    return { filename: suggestedName, handle: null }
  }

  // Web: try File System Access API (Chrome/Edge)
  if ('showSaveFilePicker' in window) {
    try {
      const picker = (window as Window & { showSaveFilePicker: (o: object) => Promise<FileSystemFileHandle> })
        .showSaveFilePicker
      const handle = await picker({ suggestedName, types: types ?? [] })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return { filename: handle.name, handle }
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
      // API failed for non-cancel reason (e.g. insecure context) → fall through
    }
  }

  // Fallback: <a download>
  downloadBlob(blob, suggestedName)
  return { filename: suggestedName, handle: null }
}

/**
 * Overwrite a previously saved file.
 *
 * - Web with handle: silent overwrite via FileSystemFileHandle.createWritable().
 * - iOS/Android: show share sheet with same filename (iOS Files asks "Replace?").
 * - Web without handle: <a download> with same filename.
 */
export async function overwriteFile(
  blob: Blob,
  filename: string,
  handle: FileSystemFileHandle | null,
): Promise<void> {
  if (handle) {
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    return
  }
  if (isNativePlatform()) {
    await shareNative(blob, filename)
    return
  }
  downloadBlob(blob, filename)
}

/**
 * Save a Blob as a file.
 * - Web: triggers browser download via <a download>
 * - Native (iOS/Android): writes to cache then opens system share sheet
 */
export function saveBlobAsDownload(blob: Blob, filename: string): string {
  if (isNativePlatform()) {
    ;(async () => {
      await shareNative(blob, filename)
    })().catch(console.error)
    return filename
  }
  downloadBlob(blob, filename)
  return filename
}

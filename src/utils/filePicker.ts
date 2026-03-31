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

/**
 * Save a Blob as a file.
 * - Web: triggers browser download via <a download>
 * - Native (iOS/Android): writes to cache then opens system share sheet
 */
export function saveBlobAsDownload(blob: Blob, filename: string): string {
  if (isNativePlatform()) {
    ;(async () => {
      const base64 = await blobToBase64(blob)
      await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Cache,
      })
      const { uri } = await Filesystem.getUri({
        path: filename,
        directory: Directory.Cache,
      })
      await Share.share({ title: filename, url: uri, dialogTitle: 'ファイルを保存' })
    })().catch(console.error)
    return filename
  }

  // Web fallback
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

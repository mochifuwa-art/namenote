import { saveWithPicker } from './filePicker'
import type { SaveResult } from './filePicker'

const SPREAD_COUNT_KEY = 'namenote_spread_count'

interface ProjectData {
  version: number
  createdAt: string
  spreadCount: number
  [key: string]: unknown
}

/** Build the project Blob from the current localStorage state. */
export function buildProjectBlob(spreadCount: number): Blob {
  const data: ProjectData = {
    version: 1,
    createdAt: new Date().toISOString(),
    spreadCount,
  }
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('namenote_')) {
      data[key] = localStorage.getItem(key) ?? ''
    }
  }
  return new Blob([JSON.stringify(data)], { type: 'application/json' })
}

/** Generate a timestamp-based default filename. */
export function defaultProjectFilename(): string {
  return `namenote_${new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')}.namenote`
}

/**
 * Save the current project to a .namenote file via a save picker.
 * Returns the SaveResult so the caller can store the file handle for later overwriting.
 */
export async function saveProjectFile(spreadCount: number): Promise<SaveResult> {
  const blob = buildProjectBlob(spreadCount)
  return saveWithPicker(blob, defaultProjectFilename(), [
    { description: 'NameNote File', accept: { 'application/json': ['.namenote'] } },
  ])
}

/** Load a .namenote project file. Returns a map of localStorage keys → values. */
export async function loadProjectFile(file: File): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target?.result as string) as ProjectData
        if (data.version !== 1) {
          reject(new Error('Unsupported file version'))
          return
        }
        const result: Record<string, string> = {}
        for (const [k, v] of Object.entries(data)) {
          if (k.startsWith('namenote_') || k === SPREAD_COUNT_KEY) {
            result[k] = String(v)
          }
        }
        if (data.spreadCount) {
          result[SPREAD_COUNT_KEY] = String(data.spreadCount)
        }
        resolve(result)
      } catch {
        reject(new Error('Failed to parse project file'))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

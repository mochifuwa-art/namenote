const SPREAD_COUNT_KEY = 'namenote_spread_count'

interface ProjectData {
  version: number
  createdAt: string
  spreadCount: number
  [key: string]: unknown
}

export function saveProjectFile(spreadCount: number) {
  const data: ProjectData = {
    version: 1,
    createdAt: new Date().toISOString(),
    spreadCount,
  }

  // Collect all relevant localStorage keys
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('namenote_')) {
      data[key] = localStorage.getItem(key) ?? ''
    }
  }

  const json = JSON.stringify(data)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.download = `namenote_${new Date().toISOString().slice(0, 10)}.namenote`
  link.href = url
  link.click()
  URL.revokeObjectURL(url)
}

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
        // Extract only namenote_ keys
        const result: Record<string, string> = {}
        for (const [k, v] of Object.entries(data)) {
          if (k.startsWith('namenote_') || k === SPREAD_COUNT_KEY) {
            result[k] = String(v)
          }
        }
        // Ensure spread count is in result
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

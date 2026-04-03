import { useRef, useState, useCallback } from 'react'
import type { DrawTarget, TextObject } from '../types'

type HistoryEntry =
  | { kind: 'canvas'; target: 'left' | 'right' | 'memo'; data: ImageData }
  | { kind: 'text'; snapshot: TextObject[] }

const MAX_HISTORY = 20

export function useHistory(
  leftRef: React.RefObject<HTMLCanvasElement | null>,
  rightRef: React.RefObject<HTMLCanvasElement | null>,
  memoRef: React.RefObject<HTMLCanvasElement | null>,
  getTextObjects: () => TextObject[],
  onTextRestore: (snapshot: TextObject[]) => void,
) {
  const undoStack = useRef<HistoryEntry[]>([])
  const redoStack = useRef<HistoryEntry[]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const sync = useCallback(() => {
    setCanUndo(undoStack.current.length > 0)
    setCanRedo(redoStack.current.length > 0)
  }, [])

  const getCanvas = useCallback((target: 'left' | 'right' | 'memo'): HTMLCanvasElement | null => {
    if (target === 'memo') return memoRef.current
    return target === 'left' ? leftRef.current : rightRef.current
  }, [leftRef, rightRef, memoRef])

  /** Call BEFORE making a canvas change. Saves a snapshot for undo. */
  const push = useCallback((t: DrawTarget) => {
    const key = t.kind === 'memo' ? 'memo' : t.side
    const canvas = getCanvas(key)
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    undoStack.current.push({ kind: 'canvas', target: key, data })
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift()
    redoStack.current = []
    sync()
  }, [getCanvas, sync])

  /** Call BEFORE making a text change. Saves current text state for undo. */
  const pushText = useCallback(() => {
    const snapshot = getTextObjects()
    undoStack.current.push({ kind: 'text', snapshot: [...snapshot] })
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift()
    redoStack.current = []
    sync()
  }, [getTextObjects, sync])

  const undo = useCallback(() => {
    const entry = undoStack.current.pop()
    if (!entry) return
    if (entry.kind === 'canvas') {
      const canvas = getCanvas(entry.target)
      if (!canvas) return
      const ctx = canvas.getContext('2d')!
      const current = ctx.getImageData(0, 0, canvas.width, canvas.height)
      redoStack.current.push({ kind: 'canvas', target: entry.target, data: current })
      ctx.putImageData(entry.data, 0, 0)
    } else {
      const current = getTextObjects()
      redoStack.current.push({ kind: 'text', snapshot: [...current] })
      onTextRestore(entry.snapshot)
    }
    sync()
  }, [getCanvas, getTextObjects, onTextRestore, sync])

  const redo = useCallback(() => {
    const entry = redoStack.current.pop()
    if (!entry) return
    if (entry.kind === 'canvas') {
      const canvas = getCanvas(entry.target)
      if (!canvas) return
      const ctx = canvas.getContext('2d')!
      const current = ctx.getImageData(0, 0, canvas.width, canvas.height)
      undoStack.current.push({ kind: 'canvas', target: entry.target, data: current })
      ctx.putImageData(entry.data, 0, 0)
    } else {
      const current = getTextObjects()
      undoStack.current.push({ kind: 'text', snapshot: [...current] })
      onTextRestore(entry.snapshot)
    }
    sync()
  }, [getCanvas, getTextObjects, onTextRestore, sync])

  const clearPageHistory = useCallback(() => {
    undoStack.current = []
    redoStack.current = []
    sync()
  }, [sync])

  return { push, pushText, undo, redo, canUndo, canRedo, clearPageHistory }
}

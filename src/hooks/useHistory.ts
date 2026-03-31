import { useRef, useState, useCallback } from 'react'
import type { DrawTarget } from '../types'

interface HistoryEntry {
  target: 'left' | 'right'
  data: ImageData
}

const MAX_HISTORY = 20

export function useHistory(
  leftRef: React.RefObject<HTMLCanvasElement | null>,
  rightRef: React.RefObject<HTMLCanvasElement | null>,
) {
  const undoStack = useRef<HistoryEntry[]>([])
  const redoStack = useRef<HistoryEntry[]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const sync = useCallback(() => {
    setCanUndo(undoStack.current.length > 0)
    setCanRedo(redoStack.current.length > 0)
  }, [])

  const getCanvas = useCallback((target: 'left' | 'right') => {
    return target === 'left' ? leftRef.current : rightRef.current
  }, [leftRef, rightRef])

  /** Call BEFORE making a change to the canvas. Saves a snapshot for undo. */
  const push = useCallback((t: DrawTarget) => {
    const key = t.side
    const canvas = getCanvas(key)
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    undoStack.current.push({ target: key, data })
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift()
    redoStack.current = []
    sync()
  }, [getCanvas, sync])

  const undo = useCallback(() => {
    const entry = undoStack.current.pop()
    if (!entry) return
    const canvas = getCanvas(entry.target)
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const current = ctx.getImageData(0, 0, canvas.width, canvas.height)
    redoStack.current.push({ target: entry.target, data: current })
    ctx.putImageData(entry.data, 0, 0)
    sync()
  }, [getCanvas, sync])

  const redo = useCallback(() => {
    const entry = redoStack.current.pop()
    if (!entry) return
    const canvas = getCanvas(entry.target)
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const current = ctx.getImageData(0, 0, canvas.width, canvas.height)
    undoStack.current.push({ target: entry.target, data: current })
    ctx.putImageData(entry.data, 0, 0)
    sync()
  }, [getCanvas, sync])

  /** Clear history on spread navigation. */
  const clearPageHistory = useCallback(() => {
    undoStack.current = []
    redoStack.current = []
    sync()
  }, [sync])

  return { push, undo, redo, canUndo, canRedo, clearPageHistory }
}

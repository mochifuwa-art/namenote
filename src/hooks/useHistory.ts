import { useRef, useState, useCallback } from 'react'
import type { DrawTarget } from '../types'

interface HistoryEntry {
  target: 'desk' | 'left' | 'right'
  data: ImageData
}

const MAX_HISTORY = 20

function targetKey(t: DrawTarget): 'desk' | 'left' | 'right' {
  if (t.kind === 'desk') return 'desk'
  return t.side
}

export function useHistory(
  deskRef: React.RefObject<HTMLCanvasElement | null>,
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

  const getCanvas = useCallback((target: 'desk' | 'left' | 'right') => {
    if (target === 'desk') return deskRef.current
    if (target === 'left') return leftRef.current
    return rightRef.current
  }, [deskRef, leftRef, rightRef])

  /** Call BEFORE making a change to the canvas. Saves a snapshot for undo. */
  const push = useCallback((t: DrawTarget) => {
    const key = targetKey(t)
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

  /** Clear left/right page history on spread navigation (their content changes). */
  const clearPageHistory = useCallback(() => {
    undoStack.current = undoStack.current.filter(e => e.target === 'desk')
    redoStack.current = redoStack.current.filter(e => e.target === 'desk')
    sync()
  }, [sync])

  return { push, undo, redo, canUndo, canRedo, clearPageHistory }
}

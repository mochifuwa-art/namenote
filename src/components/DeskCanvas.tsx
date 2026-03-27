import { forwardRef, useEffect } from 'react'

const DeskCanvas = forwardRef<HTMLCanvasElement>((_, ref) => {
  useEffect(() => {
    const canvas = (ref as React.RefObject<HTMLCanvasElement>).current
    if (!canvas) return
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }, [ref])

  return (
    <canvas
      ref={ref}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100dvh',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  )
})
DeskCanvas.displayName = 'DeskCanvas'

export default DeskCanvas

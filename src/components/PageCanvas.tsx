import { forwardRef, useEffect } from 'react'

export const PAGE_WIDTH = 560
export const PAGE_HEIGHT = 800

interface PageCanvasProps {
  side: 'left' | 'right'
}

const PageCanvas = forwardRef<HTMLCanvasElement, PageCanvasProps>(({ side }, ref) => {
  useEffect(() => {
    const canvas = (ref as React.RefObject<HTMLCanvasElement>).current
    if (!canvas) return
    // Paint white background so eraser reveals white, not transparency
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fffef8'
    ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT)
  }, [ref])

  return (
    <canvas
      ref={ref}
      width={PAGE_WIDTH}
      height={PAGE_HEIGHT}
      data-side={side}
      style={{
        display: 'block',
        width: '50%',
        height: '100%',
        pointerEvents: 'none',
        backgroundColor: '#fffef8',
      }}
    />
  )
})
PageCanvas.displayName = 'PageCanvas'

export default PageCanvas

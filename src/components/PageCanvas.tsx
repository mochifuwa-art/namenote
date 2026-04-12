import { forwardRef } from 'react'
import { CANVAS_SCALE } from '../utils/canvasScale'

export const PAGE_WIDTH = 560
export const PAGE_HEIGHT = 800

interface PageCanvasProps {
  side: 'left' | 'right'
}

const PageCanvas = forwardRef<HTMLCanvasElement, PageCanvasProps>(({ side }, ref) => {
  // キャンバス自体は透明のまま。背景色はCSSの backgroundColor で表示。
  // これにより、コピー&ペースト時に未描画領域の白が一緒にコピーされるのを防ぐ。
  return (
    <canvas
      ref={ref}
      width={PAGE_WIDTH * CANVAS_SCALE}
      height={PAGE_HEIGHT * CANVAS_SCALE}
      data-side={side}
      role="img"
      aria-label={side === 'left' ? '左ページ' : '右ページ'}
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

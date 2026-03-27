import { forwardRef } from 'react'
import PageCanvas from './PageCanvas'
import '../styles/Notebook.css'

interface NotebookSpreadProps {
  leftCanvasRef: React.RefObject<HTMLCanvasElement | null>
  rightCanvasRef: React.RefObject<HTMLCanvasElement | null>
  currentSpread: number
  totalSpreads: number
  mobileSide: 'R' | 'L'
}

const NotebookSpread = forwardRef<HTMLDivElement, NotebookSpreadProps>(
  ({ leftCanvasRef, rightCanvasRef, currentSpread, totalSpreads, mobileSide }, ref) => {
    // 右綴じ: 右ページが奇数ページ（先に読む）、左ページが偶数ページ
    const rightPageNum = currentSpread * 2 + 1
    const leftPageNum  = currentSpread * 2 + 2
    return (
      <div ref={ref} className={`notebook-spread notebook-spread--mobile-${mobileSide === 'L' ? 'left' : 'right'}`}>
        {/* 左ページ（偶数・後に読む） */}
        <div className="notebook-page notebook-page-left">
          <div className="notebook-lines" />
          <PageCanvas ref={leftCanvasRef} side="left" />
          <span className="notebook-page-num notebook-page-num-left">{leftPageNum}</span>
        </div>
        <div className="notebook-spine" />
        {/* 右ページ（奇数・先に読む）+ 製本側シャドウ */}
        <div className="notebook-page notebook-page-right">
          <div className="notebook-lines" />
          <PageCanvas ref={rightCanvasRef} side="right" />
          <span className="notebook-page-num notebook-page-num-right">{rightPageNum}</span>
          <div className="notebook-binding-edge" />
        </div>
        <div className="notebook-page-indicator">
          {rightPageNum} · {leftPageNum} / {totalSpreads * 2} p
        </div>
      </div>
    )
  }
)
NotebookSpread.displayName = 'NotebookSpread'

export default NotebookSpread

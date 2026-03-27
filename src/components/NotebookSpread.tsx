import { forwardRef } from 'react'
import PageCanvas from './PageCanvas'
import '../styles/Notebook.css'

interface NotebookSpreadProps {
  leftCanvasRef: React.RefObject<HTMLCanvasElement | null>
  rightCanvasRef: React.RefObject<HTMLCanvasElement | null>
  currentSpread: number
  totalSpreads: number
}

const NotebookSpread = forwardRef<HTMLDivElement, NotebookSpreadProps>(
  ({ leftCanvasRef, rightCanvasRef, currentSpread, totalSpreads }, ref) => {
    return (
      <div ref={ref} className="notebook-spread">
        <div className="notebook-page notebook-page-left">
          <div className="notebook-lines" />
          <PageCanvas ref={leftCanvasRef} side="left" />
        </div>
        <div className="notebook-spine" />
        <div className="notebook-page notebook-page-right">
          <div className="notebook-lines" />
          <PageCanvas ref={rightCanvasRef} side="right" />
        </div>
        <div className="notebook-page-indicator">
          {currentSpread * 2 + 1} – {currentSpread * 2 + 2} / {totalSpreads * 2}
        </div>
      </div>
    )
  }
)
NotebookSpread.displayName = 'NotebookSpread'

export default NotebookSpread

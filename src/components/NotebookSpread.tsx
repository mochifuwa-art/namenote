import { forwardRef } from 'react'
import PageCanvas, { PAGE_WIDTH, PAGE_HEIGHT } from './PageCanvas'
import TextLayer from './TextLayer'
import type { TextObject, TextWritingMode } from '../types'
import '../styles/Notebook.css'

interface NotebookSpreadProps {
  leftCanvasRef: React.RefObject<HTMLCanvasElement | null>
  rightCanvasRef: React.RefObject<HTMLCanvasElement | null>
  currentSpread: number
  totalSpreads: number
  mobileSide: 'R' | 'L'
  // Text layer props
  textObjects: TextObject[]
  isTextActive: boolean
  textColor: string
  textFontSize: number
  textWritingMode: TextWritingMode
  draggingTextId?: string
  onAddText: (obj: TextObject) => void
  onUpdateText: (id: string, updates: Partial<Pick<TextObject, 'x' | 'y' | 'text'>>) => void
  onEditRequest: (id: string, screenX: number, screenY: number) => void
  onBeginCrossAreaDrag?: (obj: TextObject, pointerId: number, clientX: number, clientY: number, grabOffsetX: number, grabOffsetY: number) => void
  bindingDirection: 'right' | 'left'
}

const NotebookSpread = forwardRef<HTMLDivElement, NotebookSpreadProps>(
  (
    {
      leftCanvasRef,
      rightCanvasRef,
      currentSpread,
      totalSpreads,
      mobileSide,
      textObjects,
      isTextActive,
      textColor,
      textFontSize,
      textWritingMode,
      draggingTextId,
      onAddText,
      onUpdateText,
      onEditRequest,
      onBeginCrossAreaDrag,
      bindingDirection,
    },
    ref,
  ) => {
    const firstPageNum  = currentSpread * 2 + 1  // 読む順で先のページ番号
    const secondPageNum = currentSpread * 2 + 2  // 読む順で後のページ番号
    // 右綴じ: 右=p.1（奇数）、左=p.2（偶数）  左綴じ: 左=p.1（奇数）、右=p.2（偶数）
    const rightPageNum = bindingDirection === 'right' ? firstPageNum  : secondPageNum
    const leftPageNum  = bindingDirection === 'right' ? secondPageNum : firstPageNum

    const leftTexts = textObjects.filter(
      o => o.side === 'left' && o.spread === currentSpread,
    )
    const rightTexts = textObjects.filter(
      o => o.side === 'right' && o.spread === currentSpread,
    )

    return (
      <div
        ref={ref}
        className={`notebook-spread notebook-spread--mobile-${mobileSide === 'L' ? 'left' : 'right'}`}
      >
        {/* 左ページ */}
        <div className="notebook-page notebook-page-left">
          <div className="notebook-lines" />
          <PageCanvas ref={leftCanvasRef} side="left" />
          <TextLayer
            objects={leftTexts}
            isActive={isTextActive}
            canvasWidth={PAGE_WIDTH}
            canvasHeight={PAGE_HEIGHT}
            spread={currentSpread}
            side="left"
            color={textColor}
            fontSize={textFontSize}
            writingMode={textWritingMode}
            draggingId={draggingTextId}
            onAdd={onAddText}
            onUpdate={onUpdateText}
            onEditRequest={onEditRequest}
            onBeginCrossAreaDrag={onBeginCrossAreaDrag}
          />
          <span className="notebook-page-num notebook-page-num-left">{leftPageNum}</span>
          {/* 左綴じ: 製本シャドウは左ページの左端 */}
          {bindingDirection === 'left' && <div className="notebook-binding-edge notebook-binding-edge--left" />}
        </div>
        <div className="notebook-spine" />
        {/* 右ページ */}
        <div className="notebook-page notebook-page-right">
          <div className="notebook-lines" />
          <PageCanvas ref={rightCanvasRef} side="right" />
          <TextLayer
            objects={rightTexts}
            isActive={isTextActive}
            canvasWidth={PAGE_WIDTH}
            canvasHeight={PAGE_HEIGHT}
            spread={currentSpread}
            side="right"
            color={textColor}
            fontSize={textFontSize}
            writingMode={textWritingMode}
            draggingId={draggingTextId}
            onAdd={onAddText}
            onUpdate={onUpdateText}
            onEditRequest={onEditRequest}
            onBeginCrossAreaDrag={onBeginCrossAreaDrag}
          />
          <span className="notebook-page-num notebook-page-num-right">{rightPageNum}</span>
          {/* 右綴じ: 製本シャドウは右ページの右端 */}
          {bindingDirection === 'right' && <div className="notebook-binding-edge" />}
        </div>
        <div className="notebook-page-indicator">
          {firstPageNum} · {secondPageNum} / {totalSpreads * 2} p
        </div>
      </div>
    )
  },
)
NotebookSpread.displayName = 'NotebookSpread'

export default NotebookSpread

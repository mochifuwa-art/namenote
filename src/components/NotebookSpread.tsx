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
  onBeginCrossAreaDrag?: (obj: TextObject, pointerId: number, clientX: number, clientY: number) => void
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
    },
    ref,
  ) => {
    // 右綴じ: 右ページが奇数ページ（先に読む）、左ページが偶数ページ
    const rightPageNum = currentSpread * 2 + 1
    const leftPageNum = currentSpread * 2 + 2

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
        {/* 左ページ（偶数・後に読む） */}
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
        </div>
        <div className="notebook-spine" />
        {/* 右ページ（奇数・先に読む）+ 製本側シャドウ */}
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
          <div className="notebook-binding-edge" />
        </div>
        <div className="notebook-page-indicator">
          {rightPageNum} · {leftPageNum} / {totalSpreads * 2} p
        </div>
      </div>
    )
  },
)
NotebookSpread.displayName = 'NotebookSpread'

export default NotebookSpread

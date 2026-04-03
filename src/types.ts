export type ToolType = 'pen' | 'eraser' | 'lasso' | 'text'
export type TextWritingMode = 'horizontal-tb' | 'vertical-rl'

export interface TextObject {
  id: string
  x: number
  y: number
  text: string
  fontSize: number
  color: string
  writingMode: TextWritingMode
  spread: number                          // spread index (0-based), ignored for memo
  side: 'left' | 'right' | 'memo'
}

export interface DrawingTool {
  type: ToolType
  color: string
  size: number
}

export type DrawTarget =
  | { kind: 'page'; side: 'left' | 'right' }
  | { kind: 'memo' }

export interface SelectionClipboard {
  canvas: HTMLCanvasElement  // 切り取ったピクセルを持つ一時canvas
  width: number
  height: number
  sourceX: number  // 切り取り元のcanvas座標
  sourceY: number
  path: { x: number; y: number }[]  // なげなわパスの点列
  sourceTarget: DrawTarget  // どのcanvasから切り取ったか
}

export type SaveStatus = 'saved' | 'unsaved' | 'saving'

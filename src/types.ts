export type ToolType = 'pen' | 'eraser' | 'lasso'

export interface DrawingTool {
  type: ToolType
  color: string
  size: number
}

export type DrawTarget =
  | { kind: 'desk' }
  | { kind: 'page'; side: 'left' | 'right' }

export interface SelectionClipboard {
  canvas: HTMLCanvasElement  // 切り取ったピクセルを持つ一時canvas
  width: number
  height: number
  sourceX: number  // 切り取り元のcanvas座標
  sourceY: number
  path: { x: number; y: number }[]  // なげなわパスの点列
}

export type SaveStatus = 'saved' | 'unsaved' | 'saving'

// Backing-store multiplier for HiDPI (Retina/iPad).
// Logical page/memo dimensions stay constant so coordinate math and text
// positions remain consistent; only the canvas resolution and per-draw stroke
// widths scale. Capped at 2 to bound memory (history snapshots scale as n²).
export const CANVAS_SCALE: number = typeof window !== 'undefined'
  ? Math.min(Math.round(window.devicePixelRatio || 1), 2)
  : 1

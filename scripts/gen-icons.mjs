// Node.js script to generate PWA icons using canvas
// Run: node scripts/gen-icons.mjs
import { createCanvas } from 'canvas'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function drawIcon(size) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')

  // Background
  ctx.fillStyle = '#4a3828'
  ctx.fillRect(0, 0, size, size)

  const pad = size * 0.12
  const w = size - pad * 2
  const h = size - pad * 2

  // Notebook pages (two rectangles)
  const halfW = w * 0.46
  ctx.fillStyle = '#fffef8'
  // Left page
  ctx.fillRect(pad, pad, halfW, h)
  // Right page
  ctx.fillRect(pad + halfW + size * 0.04, pad, halfW, h)

  // Spine
  ctx.fillStyle = '#c8b49a'
  ctx.fillRect(pad + halfW, pad, size * 0.04, h)

  // Lines on pages
  ctx.strokeStyle = 'rgba(160,190,240,0.5)'
  ctx.lineWidth = Math.max(1, size * 0.015)
  const lineSpacing = h / 6
  for (let i = 1; i < 6; i++) {
    const y = pad + i * lineSpacing
    // Left page lines
    ctx.beginPath()
    ctx.moveTo(pad + 4, y)
    ctx.lineTo(pad + halfW - 4, y)
    ctx.stroke()
    // Right page lines
    ctx.beginPath()
    ctx.moveTo(pad + halfW + size * 0.04 + 4, y)
    ctx.lineTo(pad + halfW * 2 + size * 0.04 - 4, y)
    ctx.stroke()
  }

  // Pen stroke on right page
  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth = Math.max(2, size * 0.025)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  const rx = pad + halfW + size * 0.04
  ctx.moveTo(rx + halfW * 0.15, pad + h * 0.25)
  ctx.lineTo(rx + halfW * 0.5, pad + h * 0.45)
  ctx.lineTo(rx + halfW * 0.75, pad + h * 0.3)
  ctx.stroke()

  return canvas.toBuffer('image/png')
}

mkdirSync(join(__dirname, '../public/icons'), { recursive: true })
writeFileSync(join(__dirname, '../public/icons/icon-192.png'), drawIcon(192))
writeFileSync(join(__dirname, '../public/icons/icon-512.png'), drawIcon(512))
console.log('Icons generated.')

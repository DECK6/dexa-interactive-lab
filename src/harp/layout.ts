export function harpLayout(width: number, height: number, controlsHeight: number): { top: number; bottom: number; spread: number; x0: number } {
  const mobile = width <= 600
  const controlsBottom = height <= 500 ? 12 : 100
  const bottom = mobile ? Math.min(height * 0.7, height - controlsHeight - controlsBottom - 70) : height * 0.76
  const top = Math.min(height * 0.22, bottom - 80)
  const spread = Math.min(width * 0.6, 740)
  return { top, bottom, spread, x0: (width - spread) / 2 }
}

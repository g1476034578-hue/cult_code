// Keep the GPU pixel workload bounded even on large/Retina windows.
export function renderPixelRatio(width, height, deviceRatio = 1) {
  return Math.min(deviceRatio, 1.25, Math.sqrt(1600 * 900 / Math.max(1, width * height)))
}

export function middleHeartLayout(sample, width, height) {
  const depth = sample.y
  return {
    // Save normalized random samples on each heart so resize never re-rolls it.
    size: Math.max(height * (.27 - depth * .035), width * .105),
    x: .32 + sample.x * .282,
    bottom: .23 + depth * .23,
  }
}

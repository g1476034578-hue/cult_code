// Gameplay values use story time, so pausing never spends a player's time.
export const MAX_ROUND_MS = 22000
export function pressureAt(elapsed, score, landed) {
  const finale = Math.max(0, (elapsed - 19000) / 3000)
  return Math.max(0, Math.min(1, Math.max(finale, elapsed / 18000 + landed * .006 - score * .027)))
}
export function roundShouldEnd(elapsed, pressure) {
  return elapsed >= MAX_ROUND_MS || (elapsed >= 12000 && pressure >= 1)
}
export function nearestHearts(hearts, x, y, width, height, count) {
  return hearts.map((heart, index) => ({ index, distance:
    Math.hypot(heart.x * width - x,
      height * (1 - heart.bottom) - y) }))
    .sort((a, b) => a.distance - b.distance).slice(0, count).map(item => item.index)
}


import test from 'node:test'
import assert from 'node:assert/strict'
import { pressureAt, roundShouldEnd, nearestHearts } from '../src/gameplay.js'

test('successful hits reduce pressure, while missed hearts add pressure', () => {
  assert.ok(pressureAt(10000, 8, 10) < pressureAt(10000, 0, 10))
  assert.ok(pressureAt(10000, 0, 15) > pressureAt(10000, 0, 10))
  assert.equal(pressureAt(0, 100, 0), 0)
  assert.equal(pressureAt(50000, 0, 100), 1)
  assert.equal(pressureAt(22000, 200, 0), 1)
})
test('the story allows time to play but always reaches rescue', () => {
  assert.equal(roundShouldEnd(11999, 1), false)
  assert.equal(roundShouldEnd(12000, 1), true)
  assert.equal(roundShouldEnd(18000, .4), false)
  assert.equal(roundShouldEnd(22000, .4), true)
})
test('dig selects nearby hearts without rearranging the drawing order', () => {
  const hearts = [{ x: .1, bottom: .5, size: 40 }, { x: .7, bottom: .5, size: 40 }, { x: .4, bottom: .5, size: 40 }]
  const before = structuredClone(hearts)
  assert.deepEqual(nearestHearts(hearts, 720, 520, 1000, 1000, 2), [1, 2])
  assert.deepEqual(hearts, before)
  assert.deepEqual(nearestHearts([], 0, 0, 100, 100, 3), [])
})


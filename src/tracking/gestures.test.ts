import { expect, test } from 'vitest'
import { defaults } from '../app/storage'
import { PinchMachine, OneEuro, handCoordinates, measureHand, type HandPose } from './gestures'

function pose(gap: number, hand: HandPose['hand'] = 'Right', x = .5): HandPose {
  const points = Array.from({ length: 21 }, () => ({ x, y: .5 }))
  points[5] = { x: x - .1, y: .6 }
  points[17] = { x: x + .1, y: .6 }
  points[4] = { x, y: .5 + gap * .2 }
  return { landmarks: points, hand, score: .95, aspect: 1 }
}
const hit = () => true
const frame = (machine: PinchMachine, gap: number, time: number, count: number) =>
  Array.from({ length: count }, (_, index) => machine.update(pose(gap), time + index * 40, hit))
const events = (gestures: ReturnType<typeof frame>) => gestures.flatMap(result => result.event ? [result.event] : [])

test('One Euro attenuates jitter, ignores duplicate and reversed timestamps, and resets cleanly', () => {
  const filter = new OneEuro(1, .1)
  expect(filter.update(.5, 100)).toBe(.5)
  const next = filter.update(.52, 130)
  expect(next).toBeGreaterThan(.5)
  expect(next).toBeLessThan(.508)
  expect(filter.update(10, 130)).toBe(next)
  expect(filter.update(10, 120)).toBe(next)
  filter.reset()
  expect(filter.update(.9, 200)).toBe(.9)
})

test('distance is scaled to the hand and mirror is applied once for either hand', () => {
  expect(measureHand(pose(.3))?.gap).toBeCloseTo(.3)
  expect(handCoordinates({ x: .2, y: .7 }, true)).toEqual({ x: .8, y: .7 })
  expect(handCoordinates({ x: .2, y: .7 }, false)).toEqual({ x: .2, y: .7 })
  const machine = new PinchMachine({ ...defaults, hand: 'Left' })
  expect(machine.update(pose(.6, 'Right'), 50, hit).state).toBe('NO_HAND')
  expect(machine.update(pose(.6, 'Left'), 100, hit).state).toBe('HOVER')
})

test('closes and releases exactly once with debounce and hysteresis', () => {
  const machine = new PinchMachine(defaults)
  expect(events(frame(machine, .1, 0, 6))).toEqual([])
  frame(machine, .85, 300, 10)
  expect(events(frame(machine, .11, 720, 1))).toEqual([])
  expect(events(frame(machine, .11, 760, 12))).toEqual(['grab'])
  expect(events(frame(machine, .36, 1260, 8))).toEqual([])
  expect(events(frame(machine, .8, 1600, 12))).toEqual(['release'])
  expect(events(frame(machine, .11, 2120, 14))).toEqual(['grab'])
})

test('short loss freezes the position and recovery resumes if the hand is closed', () => {
  const machine = new PinchMachine(defaults)
  frame(machine, .9, 0, 5)
  frame(machine, .07, 200, 12)
  const dragging = machine.update(pose(.07), 690, hit)
  const missing = machine.update(null, 790, hit)
  expect(missing.point).toEqual(dragging.point)
  expect(missing.event).toBeUndefined()
  expect(machine.update(pose(.07), 830, hit).state).toBe('DRAGGING')
})

test('sustained loss or sustained opening across an occlusion cancels without a drop', () => {
  for (const recovery of [false, true]) {
    const machine = new PinchMachine(defaults)
    frame(machine, .9, 0, 5)
    frame(machine, .07, 200, 12)
    expect(machine.update(null, 715, hit).event).toBeUndefined()
    if (recovery) {
      expect(machine.update(pose(.9), 760, hit).state).toBe('RELEASE_PENDING')
      expect(machine.update(pose(.9), 800, hit).event).toBeUndefined()
    }
    const output = recovery ? machine.update(pose(.9), 860, hit) : machine.update(null, 1050, hit)
    expect(output.event).toBe('cancel')
    expect(output.state).toBe('NO_HAND')
    expect(machine.update(null, 1120, hit).event).toBeUndefined()
  }
})

test('a brief opening after occlusion preserves the grab and the index pointer stays in place', () => {
  const machine = new PinchMachine(defaults)
  frame(machine, .9, 0, 5)
  expect(events(frame(machine, .07, 200, 12))).toEqual(['grab'])
  machine.update(null, 715, hit)
  const uncertain = machine.update(pose(.9), 760, hit)
  expect(uncertain.point).toEqual({ x: .5, y: .5 })
  expect(uncertain.event).toBeUndefined()
  const recovered = machine.update(pose(.07), 800, hit)
  expect(recovered).toMatchObject({ point: { x: .5, y: .5 }, state: 'DRAGGING' })
  expect(recovered.event).toBeUndefined()
  expect(events(frame(machine, .9, 840, 10))).toEqual(['release'])
})

test('release confirms the point at the first raw opening even after the hand leaves the target', () => {
  const machine = new PinchMachine(defaults)
  frame(machine, .9, 0, 5)
  expect(events(frame(machine, .07, 200, 12))).toEqual(['grab'])
  const opening = machine.update(pose(.53), 680, hit)
  expect(opening).toMatchObject({ point: { x: .5, y: .5 }, state: 'RELEASE_PENDING' })
  expect(opening.gap).toBeLessThan(defaults.open)
  expect(opening.event).toBeUndefined()
  const outside = machine.update(pose(.9, 'Right', .92), 740, hit)
  expect(outside.point).toEqual(opening.point)
  expect(outside.event).toBeUndefined()
  expect(machine.update(pose(.9, 'Right', .92), 810, hit)).toMatchObject({
    event: 'release', point: opening.point, state: 'COOLDOWN',
  })
  expect(machine.update(pose(.9, 'Right', .92), 910, hit).event).toBeUndefined()
})

test('closing again resumes movement and a later release uses the new position', () => {
  const machine = new PinchMachine(defaults)
  frame(machine, .9, 0, 5)
  frame(machine, .07, 200, 12)
  const first = machine.update(pose(.9), 680, hit)
  const resumed = machine.update(pose(.07, 'Right', .75), 720, hit)
  expect(resumed.state).toBe('DRAGGING')
  expect(resumed.event).toBeUndefined()
  expect(resumed.point).not.toEqual(first.point)
  const second = machine.update(pose(.9, 'Right', .75), 760, hit)
  expect(second.point).not.toEqual(first.point)
  machine.update(pose(.9, 'Right', .75), 820, hit)
  expect(machine.update(pose(.9, 'Right', .75), 880, hit)).toMatchObject({ event: 'release', point: second.point })
})

test('losing the hand during release invalidates the drop even when the hand returns open', () => {
  const machine = new PinchMachine(defaults)
  frame(machine, .9, 0, 5)
  frame(machine, .07, 200, 12)
  expect(machine.update(pose(.9), 680, hit).state).toBe('RELEASE_PENDING')
  expect(machine.update(null, 720, hit).event).toBeUndefined()
  expect(machine.update(pose(.9, 'Right', .8), 760, hit).event).toBeUndefined()
  expect(machine.update(pose(.9, 'Right', .8), 860, hit).event).toBe('cancel')
})

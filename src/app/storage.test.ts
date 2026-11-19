import { afterEach, expect, test } from 'vitest'
import { defaults, readSettings, savePreferences } from './storage'

afterEach(() => localStorage.clear())

test('migrates a v1 opt-in settings record with missing new preference fields', () => {
  localStorage.setItem('twm-settings', JSON.stringify({ save: true, sound: false, mirror: false }))
  expect(readSettings()).toEqual({ ...defaults, save: true, sound: false, mirror: false })
})

test('rejects unknown versions and invalid pinch thresholds', () => {
  localStorage.setItem('twm-settings', JSON.stringify({ version: 9, data: { save: true, sound: false } }))
  expect(readSettings()).toEqual(defaults)
  localStorage.setItem('twm-settings', JSON.stringify({ version: 2, data: { save: true, close: .51, open: .3 } }))
  expect(readSettings()).toEqual(defaults)
})

test('opting out removes settings and any locally saved result', () => {
  localStorage.setItem('twm-result', '{}')
  expect(savePreferences({ ...defaults, save: true })).toBe(true)
  expect(readSettings().save).toBe(true)
  expect(savePreferences(defaults)).toBe(true)
  expect(localStorage.getItem('twm-settings')).toBeNull()
  expect(localStorage.getItem('twm-result')).toBeNull()
})

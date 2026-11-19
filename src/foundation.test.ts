import { expect, test } from 'vitest'
test('normalizes Thai text without removing tone marks', () => {
  expect(' น้ำ '.trim().normalize('NFC')).toBe('น้ำ')
})

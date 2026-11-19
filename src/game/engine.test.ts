import { describe, expect, test } from 'vitest'
import { librarySchema, type Word } from '../content/schema'
import { words } from '../content/words'
import { advance, defaultConfig, generateLevels, initialGame, match, summarize, validateWordPair } from './engine'
import { layoutCards, targetAt } from './boardLayout'

describe('word bank', () => {
  test('contains 15 approved, complete entries of each mode', () => {
    expect(librarySchema.safeParse(words).success).toBe(true)
    expect(words.filter(word => word.approved && word.mode === 'compound')).toHaveLength(15)
    expect(words.filter(word => word.approved && word.mode === 'double')).toHaveLength(15)
  })
  test.each(words.map(word => [word.displayWord, word] as const))('checks %s in both drag directions', (_, word) => {
    expect(validateWordPair(word.parts, word.mode, words)).toBe(word)
    expect(validateWordPair([...word.parts].reverse(), word.mode, words)).toBe(word.orderSensitive ? undefined : word)
    expect(validateWordPair([word.parts[0], 'xxx'], word.mode, words)).toBeUndefined()
    expect(validateWordPair(word.parts, word.mode, [{ ...word, approved: false }])).toBeUndefined()
  })
  test('rejects mis-splitting and reversed ambiguous pairs', () => {
    const train = words[0]
    const reverse: Word = { ...train, id: 'reversed', parts: ['ไฟ', 'รถ'], displayWord: 'ไฟรถ', exampleSentence: 'มีคำว่าไฟรถ' }
    expect(librarySchema.safeParse([train, reverse]).success).toBe(false)
    expect(librarySchema.safeParse([{ ...train, displayWord: 'รถฟ้า' }]).success).toBe(false)
  })
})

test('generates the same playable, unambiguous levels for each seed', () => {
  for (const mode of ['compound', 'double'] as const) for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const config = { ...defaultConfig, difficulty, mode }
    expect(generateLevels(words, config, 12)).toEqual(generateLevels(words, config, 12))
    for (let seed = 0; seed < 75; seed++) {
      for (const level of generateLevels(words, config, seed)) {
        const valid = new Set<string>()
        for (const source of level.cards) for (const target of level.cards) {
          if (source.fixed || source.id === target.id) continue
          const word = validateWordPair([target.text, source.text], mode, level.whitelist)
          if (word) valid.add(word.id)
        }
        expect([...valid].sort()).toEqual(level.goals.map(word => word.id).sort())
      }
    }
  }
})

test('scores every valid pair on the board, handles wrong attempts, hints and skips', () => {
  const config = { ...defaultConfig, difficulty: 'medium' } as const
  const levels = generateLevels(words, config, 5, 'train')
  const level = levels[0]
  const id = level.goals[1].id
  const wrong = match(initialGame, level, config.mode, 'decoy-0', 'train-0')
  expect(wrong.score).toBe(0)
  const correct = match({ ...advance(wrong, levels), hint: true }, level, config.mode, id + '-1', id + '-0')
  expect(correct.score).toBe(70)
  expect(match(correct, level, config.mode, id + '-1', id + '-0')).toBe(correct)
  const cleared = advance(correct, levels)
  expect(match(cleared, level, config.mode, id + '-1', id + '-0')).toBe(cleared)
  const final = advance(cleared, levels, true, true)
  expect(final.done).toBe(true)
  expect(summarize(final, config).review).toHaveLength(levels.flatMap(level => level.goals).length)
})

test('maps drop positions without touching adjacent cards on narrow screens', () => {
  const [level] = generateLevels(words, defaultConfig, 2, 'train')
  const layout = layoutCards(level.cards, { width: 288, height: 340 })
  for (const card of level.cards) expect(targetAt(layout.places[card.id], level.cards, layout, .66)).toBe(card)
  expect(targetAt({ x: 0, y: 0 }, level.cards, layout, .66)).toBeUndefined()
})

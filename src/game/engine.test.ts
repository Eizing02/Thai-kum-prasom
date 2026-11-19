import { describe, expect, test } from 'vitest'
import { librarySchema, type Word } from '../content/schema'
import { words } from '../content/words'
import { advance, cardAnswer, defaultConfig, generateLevels, initialGame, match, retryTimedRound, summarize, validateWordPair, wordsPerGame, type Game, type Level } from './engine'
import { layoutCards, targetAt } from './boardLayout'

describe('word bank', () => {
  test('contains 200 distinct approved words with meanings, contextual examples and subtypes', () => {
    expect(librarySchema.safeParse(words).success).toBe(true)
    expect(new Set(words.map(word => word.displayWord)).size).toBe(200)
    expect(words.filter(word => word.approved && !word.needsReview && word.mode === 'compound')).toHaveLength(100)
    expect(words.filter(word => word.approved && !word.needsReview && word.mode === 'double')).toHaveLength(100)
    expect(words.some(word => word.additionalMeanings?.length)).toBe(true)
    expect(words.find(word => word.id === 'pupil')?.pronunciation).toBe('ลูกสิด')
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

test('deals ten distinct answers and verifies that every correct route can finish the stage', () => {
  for (const mode of ['compound', 'double'] as const) for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const config = { ...defaultConfig, difficulty, mode }
    expect(generateLevels(words, config, 12)).toEqual(generateLevels(words, config, 12))
    for (let seed = 0; seed < 40; seed++) {
      const levels = generateLevels(words, config, seed)
      const accepted = levels.flatMap(level => level.whitelist.map(word => word.displayWord))
      expect(levels.reduce((count, level) => count + level.goals.length, 0)).toBe(wordsPerGame)
      expect(new Set(accepted).size).toBe(accepted.length)
      function alwaysSolvable(level: Level, game: Game): boolean {
        if (game.solved.length === level.goals.length) return true
        const remaining = level.cards.filter(card => !game.removed.includes(card.id))
        const correct = remaining.flatMap(source => remaining.map(target => match(game, level, mode, source.id, target.id)))
          .filter(state => state.feedback?.kind === 'right')
        return correct.length > 0 && correct.every(state => alwaysSolvable(level, { ...state, feedback: null }))
      }
      for (const level of levels) {
        const valid = new Set<string>()
        for (const source of level.cards) for (const target of level.cards) {
          const word = cardAnswer(source, target, mode, words)
          if (word) valid.add(word.id)
          else expect(cardAnswer(source, target, mode === 'compound' ? 'double' : 'compound', words)).toBeUndefined()
        }
        expect([...valid].sort()).toEqual(level.whitelist.map(word => word.id).sort())
        expect(alwaysSolvable(level, initialGame)).toBe(true)
      }
    }
  }
}, 15000)

test('scores every valid pair on the board, handles wrong attempts, hints and skips', () => {
  const config = { ...defaultConfig, difficulty: 'medium' } as const
  const levels = generateLevels(words, config, 5)
  const level = levels[0]
  const id = level.goals[1].id
  const wrong = match(initialGame, level, config.mode, 'decoy-0', level.goals[0].id + '-0')
  expect(wrong.score).toBe(0)
  const correct = match({ ...advance(wrong, levels), hint: true }, level, config.mode, id + '-1', id + '-0')
  expect(correct.score).toBe(70)
  expect(match(correct, level, config.mode, id + '-1', id + '-0')).toBe(correct)
  const cleared = advance(correct, levels)
  expect(match(cleared, level, config.mode, id + '-1', id + '-0')).toBe(cleared)
  const expired = { ...cleared, timeExpired: 'round' as const, elapsed: 20, roundElapsed: 20 }
  expect(advance(expired, levels)).toBe(expired)
  const retried = retryTimedRound(expired)
  expect(retried).toMatchObject({ done: false, round: 0, elapsed: 20, roundElapsed: 0, score: 0, wrong: 1, retries: 1, attempts: [] })
  expect(summarize(retried, config).review).toEqual([level.goals[1]])
})

test('accepts น้ำปลา and น้ำใจ from the same cards and prefers unseen opening words', () => {
  const config = { ...defaultConfig, difficulty: 'easy' } as const
  const bank = words.map(word => ['sauce', 'kindness'].includes(word.id) ? { ...word, difficulty: 'easy' as const } : word)
  const levels = generateLevels(bank, config, 24, undefined, { recent: bank.filter(word => !['sauce', 'kindness'].includes(word.id)).map(word => word.displayWord) })
  const level = levels.find(item => item.whitelist.some(word => word.id === 'sauce') && item.whitelist.some(word => word.id === 'kindness'))!
  const anchor = level.cards.find(card => card.text === 'น้ำ')!
  for (const text of ['ปลา', 'ใจ']) {
    const source = level.cards.find(card => card.text === text)!
    expect(match(initialGame, level, config.mode, source.id, anchor.id).feedback?.word?.displayWord).toBe('น้ำ' + text)
  }
  const recent = levels.flatMap(item => item.whitelist.map(word => word.displayWord))
  const next = generateLevels(bank, config, 24, undefined, { recent })
  expect(next[0].goals.every(word => !recent.includes(word.displayWord))).toBe(true)
})

test('maps drop positions without touching adjacent cards on narrow screens', () => {
  const [level] = generateLevels(words, defaultConfig, 2, 'train')
  const layout = layoutCards(level.cards, { width: 288, height: 340 })
  for (const card of level.cards) expect(targetAt(layout.places[card.id], level.cards, layout, .66)).toBe(card)
  expect(targetAt({ x: 0, y: 0 }, level.cards, layout, .66)).toBeUndefined()
})

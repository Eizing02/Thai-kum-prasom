import { playable, type Mode, type Difficulty, type Word } from '../content/schema'
import lexicalGuard from '../content/lexicalGuard.txt?raw'

const unclassifiedForms = new Set(lexicalGuard.trim().split(/\r?\n/u))

export type GameConfig = {
  mode: Mode; difficulty: Difficulty; challenge: 'practice' | 'test';
  control: 'pointer' | 'camera'; timer: 'off' | 'round' | 'game'; seconds: number;
}
export const defaultConfig: GameConfig = {
  mode: 'compound', difficulty: 'easy', challenge: 'practice', control: 'pointer', timer: 'off', seconds: 45,
}
export const wordsPerGame = 10

export type Card = { id: string; text: string; fixed?: boolean }
export type Level = { cards: Card[]; goals: Word[]; whitelist: Word[] }
export type Attempt = { word: Word; points: number; wrong: number; hint: boolean }
export type GameResult = {
  mode: Mode; difficulty: Difficulty; challenge: GameConfig['challenge']; score: number;
  correct: number; wrong: number; seconds: number; attempts: Attempt[]; review: Word[]; retries?: number;
}
export type Game = {
  round: number; score: number; wrong: number; roundWrong: number; hint: boolean;
  solved: string[]; removed: string[]; attempts: Attempt[]; review: Word[]; elapsed: number; roundElapsed: number;
  feedback: null | { kind: 'wrong' | 'right'; source: string; target: string; word?: Word; points?: number };
  done: boolean; timeExpired?: 'round' | 'game'; retries?: number;
}
export const initialGame: Game = {
  round: 0, score: 0, wrong: 0, roundWrong: 0, hint: false, solved: [],
  removed: [], attempts: [], elapsed: 0, roundElapsed: 0, review: [], feedback: null, done: false,
}

export const normalize = (part: string) => part.trim().normalize('NFC')
export function validateWordPair(parts: readonly string[], mode: Mode, levelContext: readonly Word[]) {
  if (parts.length !== 2) return undefined
  const [first, second] = parts.map(normalize)
  return levelContext.find(word => playable(word) && word.mode === mode && (
    (word.parts[0] === first && word.parts[1] === second) ||
    (!word.orderSensitive && word.parts[0] === second && word.parts[1] === first)
  ))
}

export function cardAnswer(source: Card, target: Card, mode: Mode, words: readonly Word[]) {
  if (source.id === target.id || source.fixed) return undefined
  const word = validateWordPair([target.text, source.text], mode, words)
  return word && (!target.fixed || word.parts[0] === normalize(target.text)) ? word : undefined
}

function shuffle<T>(items: readonly T[], random: () => number) {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    ;[result[index], result[other]] = [result[other], result[index]]
  }
  return result
}

type DealOptions = { recent?: readonly string[]; exclude?: readonly string[]; total?: number }

export function generateLevels(words: readonly Word[], config: GameConfig, seed: number, preview?: string, options: DealOptions = {}): Level[] {
  let state = seed >>> 0
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
  const available = words.filter(playable)
  const bank = available.filter(word => word.mode === config.mode)
  const recent = new Set(options.recent)
  const reserved = new Set(options.exclude)
  const priority = shuffle(bank, random).sort((a, b) => Number(recent.has(a.displayWord)) - Number(recent.has(b.displayWord)) ||
    Number(b.difficulty === config.difficulty) - Number(a.difficulty === config.difficulty))
  const featured = bank.find(word => word.id === preview)
  if (preview && !featured) return []
  const total = featured ? 1 : options.total ?? wordsPerGame
  const pairKey = (mode: Mode, first: string, second: string) => JSON.stringify([mode, first, second])
  const index = new Map<string, Word>()
  for (const word of available) {
    index.set(pairKey(word.mode, ...word.parts), word)
    if (!word.orderSensitive) index.set(pairKey(word.mode, word.parts[1], word.parts[0]), word)
  }
  const otherMode = config.mode === 'compound' ? 'double' : 'compound'
  const fixed = config.difficulty === 'easy'
  const fallback = ['เมฆ', 'ดาว', 'ฝุ่น', 'ปีก', 'เกล็ด', 'หมอก', 'กรวด', 'คลื่น', 'นก', 'หยด', 'ลาย', 'กลีบ', 'หมึก', 'ฝั่ง', 'โค้ง', 'เข็ม']
  const levels: Level[] = []
  const remaining = priority.filter(word => !reserved.has(word.displayWord))
  const allParts = [...new Set(bank.flatMap(word => word.parts))]
  const cardsFor = (word: Word) => word.parts.map((text, piece) => ({ id: word.id + '-' + piece, text, fixed: fixed && piece === 0 }))

  function inspect(cards: readonly Card[], needed: number, left: number) {
    const legal = new Map<string, Word>()
    const moves = new Map<string, { mask: number; id: string }>()
    for (const [i, target] of cards.entries()) for (const [j, source] of cards.entries()) {
      if (i === j || source.fixed) continue
      const word = index.get(pairKey(config.mode, target.text, source.text))
      if (!word || (target.fixed && word.parts[0] !== target.text)) {
        const other = index.get(pairKey(otherMode, target.text, source.text))
        if (other && (!target.fixed || other.parts[0] === target.text)) return undefined
        if (unclassifiedForms.has(target.text + source.text) && !index.has(pairKey(config.mode, source.text, target.text))) return undefined
        continue
      }
      if (reserved.has(word.displayWord)) return undefined
      legal.set(word.id, word)
      const mask = (1 << i) | (1 << j)
      moves.set(mask + ':' + word.displayWord, { mask, id: word.displayWord })
    }
    if (remaining.length - legal.size < left - needed) return undefined
    // Every accepted move must leave a route to the required number of answers.
    const safe = (taken: number, used: string[], count: number): boolean => {
      if (count === 0) return true
      const choices = [...moves.values()].filter(move => !(move.mask & taken) && !used.includes(move.id))
      return choices.length > 0 && choices.every(move => safe(taken | move.mask, [...used, move.id], count - 1))
    }
    return safe(0, [], needed) ? [...legal.values()] : undefined
  }

  let left = total
  while (left > 0 && remaining.length >= left) {
    const first = featured ?? remaining[0]
    const goals = [first]
    const expected = fixed || featured ? 1 : Math.min(3, left)
    let cards: Card[] = cardsFor(first)
    let whitelist = inspect(cards, 1, left)
    if (!whitelist) {
      remaining.shift()
      continue
    }
    for (const candidate of remaining) {
      if (goals.length === expected) break
      if (goals.includes(candidate)) continue
      const expanded = [...cards, ...cardsFor(candidate)]
      const answers = inspect(expanded, goals.length + 1, left)
      if (!answers) continue
      goals.push(candidate)
      cards = expanded
      whitelist = answers
    }
    const preferred = goals.flatMap(word => word.distractorPool)
    const alternatives = featured || !fixed ? [] : shuffle(remaining.filter(word => word.parts[0] === first.parts[0]), random)
      .sort((a, b) => Number(recent.has(a.displayWord)) - Number(recent.has(b.displayWord))).map(word => word.parts[1])
    const pool = [...new Set([...alternatives, ...shuffle(config.difficulty === 'hard' ? allParts : preferred, random),
      ...shuffle([...allParts, ...preferred, ...fallback], random)])]
    const limit = fixed ? 4 : Math.max(6, cards.length + 2)
    let decoys = 0
    let addedAlternative = false
    for (const item of pool) {
      if (cards.length === limit) break
      if (cards.some(card => card.text === item)) continue
      const extra = { id: `decoy-${decoys}`, text: item }
      const answers = inspect([...cards, extra], goals.length, left)
      if (!answers) continue
      if (answers.length > whitelist.length) {
        if (featured || addedAlternative) continue
        extra.id = `option-${item}`
        addedAlternative = true
      } else decoys++
      cards.push(extra)
      whitelist = answers
    }
    const arranged = fixed ? [cards[0], ...shuffle(cards.slice(1), random)] : shuffle(cards, random)
    levels.push({ cards: arranged, goals, whitelist })
    // Reserve alternatives as well, so any answer in this stage stays unique in the game.
    whitelist.forEach(word => reserved.add(word.displayWord))
    for (let i = remaining.length - 1; i >= 0; i--) if (reserved.has(remaining[i].displayWord)) remaining.splice(i, 1)
    left -= goals.length
  }
  return left === 0 ? levels : []
}

export function match(game: Game, level: Level, mode: Mode, sourceId: string, targetId: string): Game {
  if (game.done || game.timeExpired || game.feedback || sourceId === targetId || game.removed.includes(sourceId) || game.removed.includes(targetId)) return game
  const source = level.cards.find(card => card.id === sourceId)
  const target = level.cards.find(card => card.id === targetId)
  if (!source || !target || source.fixed) return game
  const word = cardAnswer(source, target, mode, level.whitelist)
  if (!word || game.attempts.some(attempt => attempt.word.displayWord === word.displayWord)) return {
    ...game, wrong: game.wrong + 1, roundWrong: game.roundWrong + 1,
    feedback: { kind: 'wrong', source: sourceId, target: targetId },
  }
  const points = Math.max(50, 100 - Math.min(30, game.roundWrong * 10) - (game.hint ? 20 : 0))
  return {
    ...game, score: game.score + points, solved: [...game.solved, word.id], removed: [...game.removed, sourceId, targetId],
    attempts: [...game.attempts, { word, points, wrong: game.roundWrong, hint: game.hint }],
    feedback: { kind: 'right', source: sourceId, target: targetId, word, points }, roundWrong: 0, hint: false,
  }
}

export function advance(game: Game, levels: readonly Level[]): Game {
  if (game.done || game.timeExpired) return game
  if (game.feedback?.kind !== 'right' || game.solved.length < levels[game.round].goals.length) return { ...game, feedback: null }
  const done = game.round + 1 >= levels.length
  return {
    ...game, round: done ? game.round : game.round + 1, done,
    solved: [], removed: [], feedback: null, roundWrong: 0, roundElapsed: 0, hint: false,
  }
}

export function retryTimedRound(game: Game): Game {
  if (!game.timeExpired) return game
  if (game.timeExpired === 'game') return initialGame
  const kept = game.attempts.slice(0, game.attempts.length - game.solved.length)
  const review = game.attempts.slice(kept.length).filter(attempt => attempt.wrong || attempt.hint).map(attempt => attempt.word)
  return {
    ...game, timeExpired: undefined, feedback: null, solved: [], removed: [], attempts: kept,
    roundElapsed: 0, roundWrong: 0, hint: false, score: kept.reduce((sum, attempt) => sum + attempt.points, 0),
    review: [...game.review, ...review], retries: (game.retries ?? 0) + 1,
  }
}

export function summarize(game: Game, config: GameConfig): GameResult {
  const review = new Map([...game.review, ...game.attempts.filter(item => item.wrong || item.hint).map(item => item.word)].map(word => [word.id, word]))
  return {
    mode: config.mode, difficulty: config.difficulty, challenge: config.challenge,
    score: game.score, correct: game.attempts.length, wrong: game.wrong, seconds: Math.floor(game.elapsed),
    attempts: game.attempts, review: [...review.values()], retries: game.retries ?? 0,
  }
}

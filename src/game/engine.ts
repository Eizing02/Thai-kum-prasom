import { playable, type Mode, type Difficulty, type Word } from '../content/schema'

export type GameConfig = {
  mode: Mode; difficulty: Difficulty; challenge: 'practice' | 'test';
  control: 'pointer' | 'camera'; timer: 'off' | 'round' | 'game'; seconds: number;
}
export const defaultConfig: GameConfig = {
  mode: 'compound', difficulty: 'easy', challenge: 'practice', control: 'pointer', timer: 'off', seconds: 45,
}

export type Card = { id: string; text: string; fixed?: boolean }
export type Level = { cards: Card[]; goals: Word[]; whitelist: Word[] }
export type Attempt = { word: Word; points: number; wrong: number; hint: boolean }
export type GameResult = {
  mode: Mode; difficulty: Difficulty; challenge: GameConfig['challenge']; score: number;
  correct: number; wrong: number; seconds: number; attempts: Attempt[]; review: Word[];
}
export type Game = {
  round: number; score: number; wrong: number; roundWrong: number; hint: boolean;
  solved: string[]; removed: string[]; attempts: Attempt[]; review: Word[]; elapsed: number; roundElapsed: number;
  feedback: null | { kind: 'wrong' | 'right'; source: string; target: string; word?: Word; points?: number };
  done: boolean;
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

function shuffle<T>(items: readonly T[], random: () => number) {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    ;[result[index], result[other]] = [result[other], result[index]]
  }
  return result
}

export function generateLevels(words: readonly Word[], config: GameConfig, seed: number, preview?: string): Level[] {
  let state = seed >>> 0
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
  const bank = words.filter(word => playable(word) && word.mode === config.mode)
  const priority = shuffle(bank, random).sort((a, b) => Number(b.difficulty === config.difficulty) - Number(a.difficulty === config.difficulty))
  const featured = bank.find(word => word.id === preview)
  if (featured) priority.splice(priority.indexOf(featured), 1)
  const remaining = featured ? [featured, ...priority] : priority
  const levels: Level[] = []
  const groupSize = config.difficulty === 'easy' ? 1 : 3
  while (remaining.length && levels.length < (groupSize === 1 ? 5 : 3)) {
    const goals = [remaining.shift()!]
    const parts = new Set(goals[0].parts)
    for (let index = 0; index < remaining.length && goals.length < groupSize; index++) {
      const candidate = remaining[index]
      if (candidate.parts.some(part => parts.has(part))) continue
      if (candidate.parts.some(a => [...parts].some(b => validateWordPair([a, b], config.mode, bank) || validateWordPair([b, a], config.mode, bank)))) continue
      goals.push(...remaining.splice(index--, 1))
      candidate.parts.forEach(part => parts.add(part))
    }
    const goalCards = goals.flatMap(word => word.parts.map((part, index) => ({
      id: word.id + '-' + index, text: part, fixed: groupSize === 1 && index === 0,
    })))
    const distractors: Card[] = []
    const preferred = goals.flatMap(word => word.distractorPool)
    const allParts = bank.flatMap(word => word.parts)
    const pool = [...shuffle(config.difficulty === 'hard' ? allParts : preferred, random), ...shuffle([...allParts, ...preferred, 'เมฆ','ดาว','ฝุ่น','ปีก','เกล็ด','หมอก','กรวด','คลื่น','นก','หยด','ลาย','กลีบ','หมึก','ฝั่ง','โค้ง','เข็ม'], random)]
    const count = groupSize === 1 ? 2 : Math.max(2, 6 - goalCards.length)
    for (const item of pool) {
      if (parts.has(item) || [...parts].some(part => validateWordPair([part, item], config.mode, bank) || validateWordPair([item, part], config.mode, bank))) continue
      distractors.push({ id: 'decoy-' + distractors.length, text: item })
      parts.add(item)
      if (distractors.length === count) break
    }
    const cards = groupSize === 1 ? [goalCards[0], ...shuffle([...goalCards.slice(1), ...distractors], random)] : shuffle([...goalCards, ...distractors], random)
    const whitelist = bank.filter(word => word.parts.every(part => parts.has(part)))
    levels.push({ cards, goals, whitelist })
  }
  return levels
}

export function match(game: Game, level: Level, mode: Mode, sourceId: string, targetId: string): Game {
  if (game.done || game.feedback || sourceId === targetId || game.removed.includes(sourceId) || game.removed.includes(targetId)) return game
  const source = level.cards.find(card => card.id === sourceId)
  const target = level.cards.find(card => card.id === targetId)
  if (!source || !target || source.fixed) return game
  const word = validateWordPair([target.text, source.text], mode, level.whitelist)
  if (!word || game.solved.includes(word.id)) return {
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

export function advance(game: Game, levels: readonly Level[], timeout = false, finishGame = false): Game {
  if (game.done) return game
  if (!timeout && (game.feedback?.kind !== 'right' || game.solved.length < levels[game.round].goals.length)) return { ...game, feedback: null }
  const remaining = timeout
    ? (finishGame ? levels.slice(game.round) : [levels[game.round]]).flatMap(level => level.goals).filter(word => !game.solved.includes(word.id))
    : []
  const done = finishGame || game.round + 1 >= levels.length
  return {
    ...game, round: done ? game.round : game.round + 1, done, review: [...game.review, ...remaining],
    solved: [], removed: [], feedback: null, roundWrong: 0, roundElapsed: 0, hint: false,
  }
}

export function summarize(game: Game, config: GameConfig): GameResult {
  const review = new Map([...game.review, ...game.attempts.filter(item => item.wrong || item.hint).map(item => item.word)].map(word => [word.id, word]))
  return {
    mode: config.mode, difficulty: config.difficulty, challenge: config.challenge,
    score: game.score, correct: game.attempts.length, wrong: game.wrong, seconds: Math.floor(game.elapsed),
    attempts: game.attempts, review: [...review.values()],
  }
}

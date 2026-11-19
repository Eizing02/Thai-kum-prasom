import { z } from 'zod'
import { difficultySchema, modeSchema, wordSchema } from '../content/schema'
import { wordsPerGame, type Game, type GameConfig, type Level } from '../game/engine'

const counter = z.number().int().min(0)
const elapsed = z.number().min(0)
const wordList = z.array(wordSchema).max(40)
const configuration = z.object({
  mode: modeSchema, difficulty: difficultySchema, challenge: z.enum(['practice', 'test']),
  control: z.enum(['pointer', 'camera']), timer: z.enum(['off', 'round', 'game']), seconds: counter.max(900),
})
const levelShape = z.object({
  cards: z.array(z.object({ id: z.string(), text: z.string(), fixed: z.boolean().optional() })).min(2).max(8),
  goals: wordList.min(1), whitelist: wordList.min(1),
})
const gameShape = z.object({
  round: counter, score: counter, wrong: counter, roundWrong: counter, hint: z.boolean(),
  solved: z.array(z.string()).max(8), removed: z.array(z.string()).max(8),
  attempts: z.array(z.object({ word: wordSchema, points: counter, wrong: counter, hint: z.boolean() })).max(40),
  review: wordList, elapsed, roundElapsed: elapsed,
  feedback: z.object({ kind: z.enum(['wrong', 'right']), source: z.string(), target: z.string(), word: wordSchema.optional(), points: counter.optional() }).nullable(),
  done: z.literal(false), timeExpired: z.enum(['round', 'game']).optional(), retries: counter.optional(),
})
const schema = z.object({
  version: z.literal(1), id: counter, config: configuration, levels: z.array(levelShape).min(1).max(wordsPerGame), game: gameShape,
}).refine(value => value.game.round < value.levels.length && value.levels.reduce((sum, level) => sum + level.goals.length, 0) <= wordsPerGame)

const key = 'twm-progress'
export type Progress = { id: number; config: GameConfig; levels: Level[]; game: Game }

export function readProgress(): Progress | null {
  try {
    const result = schema.safeParse(JSON.parse(localStorage.getItem(key) ?? 'null'))
    return result.success ? result.data : null
  } catch { return null }
}

export function storeProgress(value: Progress | null) {
  try {
    if (value) localStorage.setItem(key, JSON.stringify({ version: 1, ...value }))
    else localStorage.removeItem(key)
    return true
  } catch { return false }
}

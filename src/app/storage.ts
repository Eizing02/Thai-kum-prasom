import { z } from 'zod'
import { librarySchema, type Word } from '../content/schema'
import type { GameResult } from '../game/engine'

const settingsSchema = z.object({
  sound: z.boolean(), reduced: z.boolean(), mirror: z.boolean(), preview: z.boolean(),
  quality: z.enum(['auto', 'low', 'medium', 'high']), save: z.boolean(),
  close: z.number().min(.12).max(.55), open: z.number().min(.2).max(.75),
  cutoff: z.number().min(.2).max(8), beta: z.number().min(0).max(8), derivative: z.number().min(.25).max(5),
  hand: z.enum(['auto', 'Left', 'Right']), magnet: z.number().min(.65).max(1.4),
  effects: z.number().int().min(200).max(850), grace: z.number().min(150).max(500),
}).refine(value => value.open > value.close + .04)

export type Settings = z.infer<typeof settingsSchema>
export const defaults: Settings = {
  sound: true, reduced: false, mirror: true, preview: true, quality: 'auto', save: false,
  close: .3, open: .45, cutoff: 1.8, beta: 3.2, derivative: 1, hand: 'auto', magnet: 1, effects: 460, grace: 400,
}

function read(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') } catch { return null }
}
const settingsKey = 'twm-settings'
const wordsKey = 'twm-words'
const resultKey = 'twm-result'

export function readSettings(): Settings {
  const value = read(settingsKey)
  if (!value || typeof value !== 'object') return defaults
  const record = value as Record<string, unknown>
  const payload = record.version === 2 ? record.data : record.version === undefined ? record : null
  if (!payload || typeof payload !== 'object') return defaults
  const settings = settingsSchema.safeParse({ ...defaults, ...payload })
  return settings.success && settings.data.save ? settings.data : defaults
}
export function readLibrary(): Word[] | undefined {
  const result = librarySchema.safeParse(read(wordsKey))
  return result.success ? result.data : undefined
}
export function writeLibrary(words: Word[]) {
  try { localStorage.setItem(wordsKey, JSON.stringify(words)); return true } catch { return false }
}
export function savePreferences(settings: Settings) {
  try {
    if (settings.save) localStorage.setItem(settingsKey, JSON.stringify({ version: 2, data: settings }))
    else { localStorage.removeItem(settingsKey); localStorage.removeItem(resultKey) }
    return true
  } catch { return false }
}
export function writeResult(result: GameResult) {
  try { localStorage.setItem(resultKey, JSON.stringify(result)); return true } catch { return false }
}
export function readResult(): GameResult | null {
  const value = read(resultKey) as GameResult | null
  if (!value || !['compound', 'double'].includes(value.mode) || !['easy', 'medium', 'hard'].includes(value.difficulty)
    || !['practice', 'test'].includes(value.challenge) || !Array.isArray(value.attempts)
    || ![value.score, value.correct, value.wrong, value.seconds].every(number => Number.isFinite(number) && number >= 0)) return null
  if (!librarySchema.safeParse(value.review).success || !librarySchema.safeParse(value.attempts.map(attempt => attempt?.word)).success
    || value.attempts.some(attempt => !Number.isFinite(attempt.points) || !Number.isFinite(attempt.wrong) || typeof attempt.hint !== 'boolean')) return null
  return value
}
export function clearResult() {
  try { localStorage.removeItem(resultKey); return true } catch { return false }
}

export function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = Object.assign(document.createElement('a'), { href: url, download: name })
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

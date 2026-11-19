import { z } from 'zod'

export const modeSchema = z.enum(['compound', 'double'])
export const difficultySchema = z.enum(['easy', 'medium', 'hard'])
export const subtypeSchema = z.enum(['compound', 'similar', 'opposite', 'sound'])
const text = (max = 280) => z.string().trim().min(1).max(max).regex(/[ก-๛]/u, 'ต้องมีข้อความภาษาไทย').transform(value => value.normalize('NFC'))
export const wordSchema = z.object({
  id: z.string().trim().min(1).max(64),
  mode: modeSchema,
  subtype: subtypeSchema,
  parts: z.tuple([text(16), text(16)]),
  displayWord: text(32),
  meaning: text(),
  explanation: text(),
  exampleSentence: text(),
  pronunciation: text(64).optional(),
  additionalMeanings: z.array(z.object({ meaning: text(), exampleSentence: text() })).max(8).optional(),
  hint: text(),
  difficulty: difficultySchema,
  distractorPool: z.array(text(16)).max(20),
  orderSensitive: z.boolean(),
  approved: z.boolean(),
  needsReview: z.boolean().default(false),
  illustrationType: z.enum(['train', 'snow', 'wind', 'water', 'home', 'sound', 'word']),
  tags: z.array(z.string().trim().min(1).max(32)).max(12),
}).superRefine((word, context) => {
  if ((word.mode === 'compound') !== (word.subtype === 'compound')) {
    context.addIssue({ code: 'custom', path: ['subtype'], message: 'ชนิดย่อยไม่ตรงกับหมวดคำ' })
  }
  if (word.parts.join('') !== word.displayWord) {
    context.addIssue({ code: 'custom', path: ['displayWord'], message: 'ตรวจการสะกด คำเต็มต้องตรงกับส่วนคำตามลำดับ' })
  }
  if (!word.exampleSentence.includes(word.displayWord)) {
    context.addIssue({ code: 'custom', path: ['exampleSentence'], message: 'ประโยคตัวอย่างต้องมีคำเต็ม' })
  }
  for (const [index, sense] of (word.additionalMeanings ?? []).entries()) {
    if (!sense.exampleSentence.includes(word.displayWord)) {
      context.addIssue({ code: 'custom', path: ['additionalMeanings', index, 'exampleSentence'], message: 'ประโยคตัวอย่างต้องมีคำเต็ม' })
    }
  }
  if (word.approved && word.needsReview) {
    context.addIssue({ code: 'custom', path: ['approved'], message: 'ปิดสถานะรอตรวจทานก่อนอนุมัติ' })
  }
})

export type Word = z.infer<typeof wordSchema>
export type Mode = z.infer<typeof modeSchema>
export type Difficulty = z.infer<typeof difficultySchema>
export const modeLabel: Record<Mode, string> = { compound: 'คำประสม', double: 'คำซ้อน' }
export const difficultyLabel: Record<Difficulty, string> = { easy: 'ง่าย', medium: 'ปานกลาง', hard: 'ยาก' }
export const subtypeLabel: Record<Word['subtype'], string> = {
  compound: 'คำประสม', similar: 'คำซ้อนเพื่อความหมาย · ใกล้เคียง',
  opposite: 'คำซ้อนเพื่อความหมาย · ตรงข้าม', sound: 'คำซ้อนเพื่อเสียง',
}

export const librarySchema = z.array(wordSchema).max(600).superRefine((words, ctx) => {
  const ids = new Set<string>()
  const pairs = new Map<string, boolean>()
  for (const [index, word] of words.entries()) {
    const key = JSON.stringify([word.mode, ...word.parts])
    const reverse = JSON.stringify([word.mode, ...[...word.parts].reverse()])
    const report = (field: string, message: string) => ctx.addIssue({ code: 'custom', path: [index, field], message })
    if (ids.has(word.id)) report('id', 'รหัสคำซ้ำ')
    if (pairs.has(key) || (pairs.has(reverse) && (!word.orderSensitive || pairs.get(reverse) === false))) {
      report('parts', 'คู่คำซ้ำหรือกำกวมกับรายการอื่น')
    }
    ids.add(word.id)
    pairs.set(key, word.orderSensitive)
  }
})
export const playable = (word: Word) => word.approved && !word.needsReview

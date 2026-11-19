import { useRef, useState } from 'react'
import { ArrowRight, CheckCircle2, Download, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import type { FormEvent } from 'react'
import { Button, Check, Dialog } from '../components/ui'
import { download } from '../app/storage'
import { difficultyLabel, librarySchema, modeLabel, playable, subtypeLabel, type Word } from '../content/schema'

const blank = (): Word => ({
  id: globalThis.crypto?.randomUUID?.() ?? 'word-' + Date.now(), mode: 'compound', subtype: 'compound',
  parts: ['', ''], displayWord: '', meaning: '', explanation: '', exampleSentence: '', hint: '', difficulty: 'easy',
  distractorPool: [], tags: [], orderSensitive: false, approved: false, needsReview: true, illustrationType: 'word',
})
const fields: Record<string, string> = {
  id: 'รหัสคำ', parts: 'ส่วนคำ', mode: 'หัวข้อ', subtype: 'ชนิดคำ', displayWord: 'คำเต็ม',
  meaning: 'ความหมาย', explanation: 'เหตุผล', exampleSentence: 'ประโยคตัวอย่าง', hint: 'คำใบ้',
  difficulty: 'ระดับ', distractorPool: 'ตัวหลอก', orderSensitive: 'ลำดับส่วนคำ',
  approved: 'อนุมัติ', needsReview: 'รอตรวจทาน', illustrationType: 'ภาพประกอบ', tags: 'ป้ายกำกับ',
}
const formatError = (error: { issues: { path: PropertyKey[]; message: string }[] }) =>
  error.issues.slice(0, 6).map(issue => issue.path.map(part => typeof part === 'number' ? 'ลำดับ ' + (part + 1) : fields[String(part)] ?? 'คลังคำ').join(' / ') +
    ' · ' + (/[ก-๛]/u.test(issue.message) ? issue.message : 'ข้อมูลขาดหายหรือไม่ตรงรูปแบบ')).join(' · ')

export function Teacher({ library, save, preview }: { library: Word[]; save: (words: Word[]) => boolean; preview: (word: Word) => void }) {
  const [draft, setDraft] = useState<Word | null>(null)
  const [pending, setPending] = useState<{ words: Word[]; label: string }>()
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const list = library.filter(word => (word.displayWord + ' ' + modeLabel[word.mode]).includes(filter.trim()))
  function persist(words: Word[], label: string) {
    if (!save(words)) { setError('เบราว์เซอร์บันทึกคลังคำไม่ได้ ลองตรวจพื้นที่จัดเก็บหรือส่งออกไฟล์ไว้'); return false }
    setMessage(label)
    setError('')
    return true
  }
  function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft) return
    const data = new FormData(event.currentTarget)
    const formValue = (name: string) => String(data.get(name) ?? '').trim()
    const split = (name: string) => formValue(name).split(',').map(value => value.trim()).filter(Boolean)
    const candidate = { ...draft, tags: split('tags'), distractorPool: split('decoys') }
    const next = library.some(word => word.id === draft.id) ? library.map(word => word.id === draft.id ? candidate : word) : [...library, candidate]
    const parsed = librarySchema.safeParse(next)
    if (!parsed.success) { setError(formatError(parsed.error)); return }
    if (persist(parsed.data, 'บันทึกคำแล้ว')) setDraft(null)
  }
  async function importWords(source: File) {
    setError('')
    setMessage('')
    if (source.size > 2_000_000) { setError('ไฟล์มีขนาดเกิน 2 MB'); return }
    try {
      const payload = JSON.parse((await source.text()).replace(/^\uFEFF/, ''))
      if (!Array.isArray(payload) && payload?.version !== 1) { setError('ใช้ไฟล์คลังคำ JSON รุ่น 1 หรืออาร์เรย์รายการคำ'); return }
      const parsed = librarySchema.safeParse(Array.isArray(payload) ? payload : payload?.words)
      if (!parsed.success) { setError(formatError(parsed.error)); return }
      setPending({ words: parsed.data, label: `แทนที่คลังเดิมด้วย ${parsed.data.length} รายการ` })
    } catch { setError('เปิดไฟล์ JSON ไม่สำเร็จ ตรวจรูปแบบไฟล์แล้วลองใหม่') }
  }
  return <section className="page-flow teacher-page">
    <div><h1>คลังคำสำหรับครู</h1><p className="lead">แก้ไข ตรวจทาน และอนุมัติคำในเบราว์เซอร์นี้</p></div>
    <div className="teacher-tools">
      <label>ค้นหาคำ <input type="search" value={filter} onChange={event => setFilter(event.target.value)} placeholder="เช่น รถไฟ" /></label>
      <div className="actions">
        <Button look="primary" onClick={() => { setError(''); setDraft(blank()) }}><Plus size={18} /> เพิ่มคำ</Button>
        <Button onClick={() => file.current?.click()}><Upload size={17} /> นำเข้า JSON</Button>
        <Button onClick={() => download('thai-word-library.json', JSON.stringify({ version: 1, words: library }, null, 2), 'application/json')}><Download size={17} /> ส่งออก JSON</Button>
      </div>
      <input ref={file} type="file" accept=".json,application/json" hidden onChange={event => {
        const source = event.currentTarget.files?.[0]
        if (source) void importWords(source)
        event.currentTarget.value = ''
      }} />
    </div>
    {error && !draft && !pending && <p className="error-message" role="alert">{error}</p>}
    <p className="muted" aria-live="polite">{message || `${list.length} รายการ · พร้อมเล่น ${list.filter(playable).length} รายการ`}</p>
    <ul className="teacher-list">
      {list.map(word => <li key={word.id}>
        <div className="teacher-word"><strong>{word.displayWord}</strong><span>{subtypeLabel[word.subtype]}</span></div>
        <span className="teacher-status">{playable(word) ? <><CheckCircle2 size={15} /> พร้อมเล่น</> : word.needsReview ? 'รอตรวจทาน' : 'ปิดใช้งาน'}</span>
        <div className="actions">
          <Button look="quiet" aria-label={'ดูตัวอย่าง ' + word.displayWord} onClick={() => preview(word)}><ArrowRight size={17} /><span>ดูโจทย์</span></Button>
          <Button look="quiet" aria-label={'แก้ไข ' + word.displayWord} onClick={() => { setError(''); setDraft(word) }}><Pencil size={17} /><span>แก้ไข</span></Button>
          <Button look="quiet" aria-label={'ลบ ' + word.displayWord} onClick={() => { setError(''); setPending({ words: library.filter(item => item.id !== word.id), label: 'ลบคำ ' + word.displayWord }) }}><Trash2 size={17} /></Button>
        </div>
      </li>)}
    </ul>
    {!list.length && <p>ไม่พบคำในรายการนี้</p>}
    {pending && <Dialog title={pending.label} close={() => setPending(undefined)}>
      <p>การเปลี่ยนแปลงมีผลกับคลังคำในเบราว์เซอร์นี้</p>
      {error && <p role="alert" className="error-message">{error}</p>}
      <div className="actions"><Button look="primary" onClick={() => { if (persist(pending.words, 'อัปเดตคลังคำแล้ว')) setPending(undefined) }}>ยืนยัน</Button><Button onClick={() => setPending(undefined)}>ยกเลิก</Button></div>
    </Dialog>}
    {draft && <Dialog title={library.some(word => word.id === draft.id) ? 'แก้ไขคำ' : 'เพิ่มคำ'} close={() => { setDraft(null); setError('') }}>
      <form className="teacher-form" onSubmit={saveDraft}>
        <div className="form-row">
          <label>ชนิดคำ <select value={draft.subtype} onChange={event => {
            const subtype = event.target.value as Word['subtype']
            setDraft({ ...draft, subtype, mode: subtype === 'compound' ? 'compound' : 'double' })
          }}>{Object.entries(subtypeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>ระดับ <select value={draft.difficulty} onChange={event => setDraft({ ...draft, difficulty: event.target.value as Word['difficulty'] })}>
            {Object.entries(difficultyLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <div className="form-row">{draft.parts.map((part, index) => <label key={index}>ส่วนที่ {index + 1}<input required maxLength={16} value={part} onChange={event => {
          const parts: Word['parts'] = [...draft.parts]
          parts[index] = event.target.value
          setDraft({ ...draft, parts, displayWord: parts.map(text => text.trim()).join('') })
        }} /></label>)}</div>
        <p>คำเต็ม <strong>{draft.displayWord || '—'}</strong></p>
        {([['meaning', 'ความหมาย'], ['explanation', 'เหตุผล'], ['exampleSentence', 'ประโยคตัวอย่าง'], ['hint', 'คำใบ้']] as const).map(([key, label]) =>
          <label key={key}>{label}<textarea required maxLength={280} rows={2} value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })} /></label>)}
        <label>ตัวหลอก (คั่นด้วยจุลภาค)<input name="decoys" defaultValue={draft.distractorPool.join(', ')} /></label>
        <label>ป้ายกำกับ (คั่นด้วยจุลภาค)<input name="tags" defaultValue={draft.tags.join(', ')} /></label>
        <label>ภาพประกอบ <select value={draft.illustrationType} onChange={event => setDraft({ ...draft, illustrationType: event.target.value as Word['illustrationType'] })}>
          {Object.entries({ word: 'แม่เหล็ก', train: 'รถไฟ', snow: 'เกล็ดน้ำแข็ง', wind: 'ลม', water: 'หยดน้ำ', home: 'บ้าน', sound: 'คลื่นเสียง' }).map(([key, label]) =>
            <option key={key} value={key}>{label}</option>)}
        </select></label>
        <Check checked={draft.orderSensitive} onChange={orderSensitive => setDraft({ ...draft, orderSensitive })} label="ตรวจลำดับส่วนคำตอนวาง" />
        <Check checked={draft.needsReview} onChange={needsReview => setDraft({ ...draft, needsReview, approved: needsReview ? false : draft.approved })} label="รอตรวจทาน" />
        <Check checked={draft.approved} onChange={approved => setDraft({ ...draft, approved, needsReview: approved ? false : draft.needsReview })} label="อนุมัติให้ใช้ในเกม" />
        {error && <p className="error-message" role="alert">{error}</p>}
        <Button type="submit" look="primary">บันทึกคำ</Button>
      </form>
    </Dialog>}
  </section>
}

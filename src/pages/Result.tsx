import { ArrowRight, Download, Printer, RotateCcw, Trash2 } from 'lucide-react'
import { Button, type Navigate } from '../components/ui'
import { AdditionalMeanings, WordSpeech } from '../components/WordDetails'
import { download } from '../app/storage'
import { difficultyLabel, modeLabel, subtypeLabel } from '../content/schema'
import type { GameResult } from '../game/engine'

function csv(result: GameResult) {
  const summary = ['คะแนน', result.score, 'ถูก', result.correct, 'ผิด', result.wrong, 'วินาที', result.seconds, 'ลองด่านเดิมใหม่', result.retries ?? 0]
  const rows = [
    summary, ['คำ', 'หัวข้อ', 'ชนิด', 'ความหมาย', 'เหตุผล', 'ประโยคตัวอย่าง', 'คะแนน', 'จำนวนครั้งที่พลาดก่อนตอบถูก', 'สถานะ'],
    ...result.attempts.map(({ word, points, wrong, hint }) => [word.displayWord, modeLabel[word.mode], subtypeLabel[word.subtype],
      [word.meaning, ...(word.additionalMeanings?.map(sense => sense.meaning) ?? [])].join(' · '), word.explanation,
      [word.exampleSentence, ...(word.additionalMeanings?.map(sense => sense.exampleSentence) ?? [])].join(' · '), points, wrong, hint || wrong ? 'ทบทวน' : 'ตอบถูก']),
    ...result.review.filter(word => !result.attempts.some(attempt => attempt.word.id === word.id))
      .map(word => [word.displayWord, modeLabel[word.mode], subtypeLabel[word.subtype], word.meaning, word.explanation, word.exampleSentence, 0, '', 'ยังไม่ได้ตอบ']),
  ]
  const cell = (value: string | number) => {
    const text = String(value)
    return '"' + (/^[=+@\-\t\r\n]/.test(text) ? "'" : '') + text.replaceAll('"', '""') + '"'
  }
  download('thai-word-magnet.csv', '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n'), 'text/csv;charset=utf-8')
}
export function Result({ result, go, replay, clear }: { result: GameResult | null; go: Navigate; replay: () => void; clear: () => void }) {
  if (!result) return <section className="narrow page-flow"><h1>ยังไม่มีผลการเล่น</h1><Button look="primary" onClick={() => go('/setup')}>เลือกบทเรียน <ArrowRight size={18} /></Button></section>
  const total = result.correct + result.wrong
  const reviewIds = new Set(result.review.map(word => word.id))
  const items = new Map([...result.attempts.map(({ word }) => word), ...result.review].map(word => [word.id, word]))
  return <section className="narrow page-flow result">
    <div><h1>สรุปผลการเล่น</h1><p className="lead">{modeLabel[result.mode]} · ระดับ{difficultyLabel[result.difficulty]} · {result.challenge === 'test' ? 'ทดสอบ' : 'ฝึกเล่น'}</p></div>
    <dl className="result-grid">
      {[
        ['คะแนน', result.score], ['คู่ที่ตอบถูก', result.correct], ['ครั้งที่วางผิด', result.wrong],
        ['ความแม่นยำ', total ? Math.round(result.correct * 100 / total) + '%' : '—'],
        ['เวลา', Math.floor(result.seconds / 60) + ':' + String(result.seconds % 60).padStart(2, '0')],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    {!!result.retries && <p>ลองด่านเดิมใหม่ {result.retries} ครั้ง</p>}
    <div className="actions print-hide">
      <Button look="primary" onClick={replay}><RotateCcw size={17} /> เล่นอีกครั้ง</Button>
      <Button onClick={() => csv(result)}><Download size={17} /> ดาวน์โหลด CSV</Button>
      <Button onClick={() => window.print()}><Printer size={17} /> พิมพ์</Button>
    </div>
    <div><h2>คำที่ควรทบทวน</h2><p>{result.review.length ? result.review.map(word => word.displayWord).join(' · ') : 'ไม่มีคำที่ต้องทบทวนในรอบนี้'}</p></div>
    <div className="review-list"><h2>คำในรอบนี้</h2>
      {[...items.values()].map(word => <details key={word.id} open>
        <summary><strong>{word.displayWord}</strong><span>{reviewIds.has(word.id) ? 'ทบทวน' : subtypeLabel[word.subtype]}</span></summary>
        <p>{word.meaning}</p><p>{word.explanation}</p><p>“{word.exampleSentence}”</p>
        <AdditionalMeanings word={word} />
        <div className="actions print-hide"><WordSpeech word={word} label={`อ่านออกเสียง ${word.displayWord}`} /></div>
      </details>)}
    </div>
    <div><h2>จำความต่างไว้ใช้กับคำใหม่</h2><p>คำประสมเกิดจากการรวมคำให้เกิดความหมายใหม่ ส่วนคำซ้อนจัดส่วนคำเข้าด้วยกันโดยอาศัยความหมายที่สัมพันธ์กันหรือเสียงที่รับกัน</p></div>
    <Button look="quiet" className="print-hide" onClick={clear}><Trash2 size={17} /> ล้างผลล่าสุด</Button>
  </section>
}

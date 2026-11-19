import { useEffect, useRef, useState } from 'react'
import { ArrowRight, BookOpen, Layers3, Magnet, Mouse, Pause, Play, Settings2, StepForward, Waves } from 'lucide-react'
import { Button, type Navigate } from '../components/ui'

const examples = [
  { title: 'คำประสม', detail: 'รวมคำแล้วเกิดความหมายใหม่', words: ['รถ', 'ไฟ', 'รถไฟ'], Icon: Layers3 },
  { title: 'คำซ้อน', detail: 'ซ้อนกันเพื่อความหมายหรือเสียง', words: ['ใหญ่', 'โต', 'ใหญ่โต'], Icon: Waves },
]
const motionPreference = '(prefers-reduced-motion: reduce)'
const flipStart = 10000
const flipMidpoint = 260
const flipEnd = 630

function Formula({ words: [first, second, result] }: { words: string[] }) {
  return <strong>{first} <span>+</span> {second} <span>→</span> {result}</strong>
}

export function Home({ go, saved, reduced, resume }: { go: Navigate; saved: boolean; reduced: boolean; resume?: () => void }) {
  const stage = useRef<HTMLElement>(null)
  const [active, setActive] = useState(0)
  const [turn, setTurn] = useState<'still' | 'close' | 'open'>('still')
  const [paused, setPaused] = useState(false)
  const [onScreen, setOnScreen] = useState(false)
  const [pageVisible, setPageVisible] = useState(() => !document.hidden)
  const [systemReduced, setSystemReduced] = useState(() => window.matchMedia(motionPreference).matches)
  const reduceMotion = reduced || systemReduced
  const cycling = !reduceMotion && !paused && pageVisible && onScreen
  const example = examples[active]

  useEffect(() => {
    const media = window.matchMedia(motionPreference)
    const updateMotion = () => setSystemReduced(media.matches)
    const updateVisibility = () => setPageVisible(!document.hidden)
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.intersectionRatio >= .25), { threshold: .25 })
    observer.observe(stage.current!)
    media.addEventListener('change', updateMotion)
    document.addEventListener('visibilitychange', updateVisibility)
    return () => {
      observer.disconnect()
      media.removeEventListener('change', updateMotion)
      document.removeEventListener('visibilitychange', updateVisibility)
    }
  }, [])

  useEffect(() => {
    if (!cycling) { setTurn('still'); return }
    let swap = 0
    let settle = 0
    const loop = window.setInterval(() => {
      setTurn('close')
      // Swap at the edge of the flip so the new word and palette enter together.
      swap = window.setTimeout(() => {
        setActive(value => (value + 1) % examples.length)
        setTurn('open')
      }, flipMidpoint)
      settle = window.setTimeout(() => setTurn('still'), flipEnd)
    }, flipStart)
    return () => {
      window.clearInterval(loop)
      window.clearTimeout(swap)
      window.clearTimeout(settle)
    }
  }, [cycling])

  const controlLabel = reduceMotion ? 'สลับตัวอย่าง' : paused ? 'เล่นตัวอย่างต่อ' : 'พักการสลับตัวอย่าง'
  const ControlIcon = reduceMotion ? StepForward : paused ? Play : Pause

  return <>
    <section className="home-hero" data-reduced={reduceMotion}>
      <div className="home-copy">
        <h1>เกม<br /><span>คำชนคำ</span></h1>
        <p>หยิบการ์ดมาจับคู่ แล้วค้นพบว่าคำไทยสองส่วนรวมกันเป็น<span data-current={active === 0}>คำประสม</span>หรือ<span data-current={active === 1}>คำซ้อน</span>ได้อย่างไร</p>
        <div className="actions">
          <Button look="primary" onClick={() => go('/setup')}>เริ่มเล่น <ArrowRight size={21} /></Button>
          <Button onClick={() => go('/help')}><BookOpen size={18} /> วิธีเล่น</Button>
        </div>
        <span className="home-note"><Mouse size={17} /> เล่นด้วยเมาส์ สัมผัส หรือใช้กล้อง</span>
      </div>
      <figure className="lab-art" ref={stage} data-example={active} data-turn={cycling ? turn : 'still'}>
        <div aria-hidden="true">
          <div className="lab-dial"><i /><i /><i /><i /></div>
          <div className="lab-orbit" /><div className="lab-orbit orbit-small" />
          <span className="lab-plus plus-a" /><span className="lab-plus plus-b" /><span className="lab-plus plus-c" />
          <span className="lab-dot dot-a" /><span className="lab-dot dot-b" /><span className="lab-dot dot-c" />
          <div className="lab-magnet"><div className="magnet-edge" /><div className="magnet-face" /><i /><b /></div>
          <div className="lab-tile tile-one"><span className="tile-pin">+</span>{example.words[0]}</div>
          <div className="lab-tile tile-two"><span className="tile-pin">−</span>{example.words[1]}</div>
        </div>
        <figcaption className="lab-footer">
          <div className="lab-key" aria-live={reduceMotion ? 'polite' : 'off'} aria-atomic="true">
            <span>{example.title}</span>
            <Formula words={example.words} />
          </div>
          <button type="button" className="lab-control" aria-label={controlLabel} title={controlLabel} onClick={() => {
            if (reduceMotion) setActive(value => (value + 1) % examples.length)
            else setPaused(value => !value)
          }}><ControlIcon size={19} aria-hidden="true" /></button>
        </figcaption>
      </figure>
    </section>
    <section className="lesson-strip" aria-label="ตัวอย่างการสร้างคำ">
      {examples.map(({ title, detail, words, Icon }, index) => <article key={title}>
        <div className={index === 0 ? 'lesson-icon' : 'lesson-icon lavender'}><Icon size={25} /></div>
        <div><h2>{title}</h2><p>{detail}</p></div>
        <Formula words={words} />
      </article>)}
    </section>
    <div className="home-tools">
      {resume && <Button look="primary" onClick={resume}>เล่นรอบเดิมต่อ <ArrowRight size={18} /></Button>}
      {saved && <Button look="quiet" onClick={() => go('/result')}>ผลการเล่นล่าสุด <ArrowRight size={17} /></Button>}
      <Button look="quiet" onClick={() => go('/settings')}><Settings2 size={17} /> ตั้งค่า</Button>
    </div>
  </>
}

export function Help({ go }: { go: Navigate }) {
  return <section className="narrow page-flow">
    <h1>วิธีเล่น</h1>
    <ol className="guide-list">
      <li><strong>เลือกบทเรียน</strong><p>คำประสมรวมส่วนคำให้เกิดความหมายใหม่ คำซ้อนอาศัยความสัมพันธ์ทางความหมายหรือเสียง</p></li>
      <li><strong>หยิบแล้ววางบนการ์ดอีกใบ</strong><p>ลากด้วยเมาส์หรือนิ้ว หรือเลือกการ์ดสองใบด้วย Enter หากใช้กล้อง ให้บีบนิ้วโป้งกับนิ้วชี้เพื่อหยิบและคลายนิ้วเพื่อวาง</p></li>
      <li><strong>อ่านคำที่ประกอบเสร็จ</strong><p>คู่ที่ถูกจะดูดเข้าหากัน ในโหมดฝึกจะได้อ่านความหมายทันที ส่วนโหมดทดสอบจะทบทวนได้ตอนจบ</p></li>
    </ol>
    <p><Magnet size={18} className="inline-icon" /> หากการ์ดเด้งกลับ ให้ลองคู่ใหม่ โหมดฝึกเปิดคำใบ้ได้หลังลองผิดสองครั้ง</p>
    <Button look="primary" onClick={() => go('/setup')}>เลือกบทเรียน <ArrowRight size={18} /></Button>
  </section>
}

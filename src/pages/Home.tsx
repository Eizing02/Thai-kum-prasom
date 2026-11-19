import { ArrowRight, BookOpen, Layers3, Magnet, Mouse, Settings2, Waves } from 'lucide-react'
import { Button, type Navigate } from '../components/ui'

export function Home({ go, saved, resume }: { go: Navigate; saved: boolean; resume?: () => void }) {
  return <>
    <section className="home-hero">
      <div className="home-copy">
        <h1>เกม<br /><span>คำชนคำ</span></h1>
        <p>หยิบการ์ดมาจับคู่ แล้วค้นพบว่าคำไทยสองส่วนรวมกันเป็นคำประสมหรือคำซ้อนได้อย่างไร</p>
        <div className="actions">
          <Button look="primary" onClick={() => go('/setup')}>เริ่มเล่น <ArrowRight size={21} /></Button>
          <Button onClick={() => go('/help')}><BookOpen size={18} /> วิธีเล่น</Button>
        </div>
        <span className="home-note"><Mouse size={17} /> เล่นด้วยเมาส์ สัมผัส หรือใช้กล้อง</span>
      </div>
      <div className="lab-art" role="img" aria-label="แม่เหล็กกำลังดึงการ์ด รถ และ ไฟ เข้าหากัน">
        <div className="lab-dial"><i /><i /><i /><i /></div>
        <div className="lab-orbit" /><div className="lab-orbit orbit-small" />
        <span className="lab-plus plus-a" /><span className="lab-plus plus-b" /><span className="lab-plus plus-c" />
        <span className="lab-dot dot-a" /><span className="lab-dot dot-b" /><span className="lab-dot dot-c" />
        <div className="lab-magnet"><div className="magnet-edge" /><div className="magnet-face" /><i /><b /></div>
        <div className="lab-tile tile-one"><span className="tile-pin">+</span>รถ</div>
        <div className="lab-tile tile-two"><span className="tile-pin">−</span>ไฟ</div>
        <div className="lab-key"><span /> สนามแม่เหล็ก</div>
      </div>
    </section>
    <section className="lesson-strip" aria-label="ตัวอย่างการสร้างคำ">
      <article>
        <div className="lesson-icon"><Layers3 size={25} /></div>
        <div><h2>คำประสม</h2><p>รวมคำแล้วเกิดความหมายใหม่</p></div>
        <strong>รถ <span>+</span> ไฟ <span>→</span> รถไฟ</strong>
      </article>
      <article>
        <div className="lesson-icon lavender"><Waves size={25} /></div>
        <div><h2>คำซ้อน</h2><p>ซ้อนกันเพื่อความหมายหรือเสียง</p></div>
        <strong>ใหญ่ <span>+</span> โต <span>→</span> ใหญ่โต</strong>
      </article>
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

import { ArrowRight, BookOpen } from 'lucide-react'
import { Button, type Navigate } from '../components/ui'

export function About({ go }: { go: Navigate }) {
  return <section className="page-flow about-page" aria-labelledby="about-title">
    <div className="about-copy">
      <div>
        <h1 id="about-title">เกี่ยวกับเกมคำชนคำ</h1>
        <p className="lead">เกมฝึกจับคู่คำประสมและคำซ้อนสำหรับนักเรียนชั้นมัธยมศึกษาปีที่ 1</p>
      </div>
      <div className="about-credit">
        <p>สร้างโดย</p>
        <h2>ครูจันทร์เพ็ญ สังข์วงค์</h2>
        <p>สาขาวิชาภาษาไทย มหาวิทยาลัยราชภัฏเลย</p>
      </div>
      <p>หยิบการ์ดมาจับคู่ แล้วเรียนรู้ความหมายและเหตุผลของคำที่ประกอบสำเร็จ เล่นได้ด้วยเมาส์ จอสัมผัส คีย์บอร์ด หรือกล้อง</p>
      <div className="actions">
        <Button look="primary" onClick={() => go('/setup')}>เริ่มเล่น <ArrowRight size={19} /></Button>
        <Button onClick={() => go('/help')}><BookOpen size={18} /> วิธีเล่น</Button>
      </div>
    </div>
    <figure className="about-art">
      <img src={import.meta.env.BASE_URL + 'brand/kru-jan.webp'} width={720} height={658} alt="ภาพการ์ตูนครูแจนถือหนังสือภาษาไทยและปากกาขนนก" />
    </figure>
  </section>
}

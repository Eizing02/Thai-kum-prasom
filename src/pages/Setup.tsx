import { ArrowRight, Camera, Hand, Layers3, Waves } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button, Check } from '../components/ui'
import type { Settings } from '../app/storage'
import { difficultyLabel } from '../content/schema'
import { wordsPerGame, type GameConfig } from '../game/engine'

function Options<T extends string>({ title, value, options, change }: {
  title: string; value: T; change: (next: T) => void; options: { value: T; label: string; details?: string; icon?: ReactNode }[];
}) {
  return <fieldset className="options"><legend>{title}</legend><div className="option-row" data-count={options.length}>
    {options.map(option => <label className="option" key={option.value}>
      <input type="radio" name={title} checked={value === option.value} onChange={() => change(option.value)} />
      {option.icon}<span><strong>{option.label}</strong>{option.details && <small>{option.details}</small>}</span>
    </label>)}
  </div></fieldset>
}

export function Setup({ config, setConfig, settings, changeSettings, start, available, dealError }: {
  config: GameConfig; setConfig: (value: GameConfig) => void; settings: Settings; changeSettings: (patch: Partial<Settings>) => void;
  start: () => void; available: boolean; dealError: string;
}) {
  const change = (patch: Partial<GameConfig>) => setConfig({ ...config, ...patch })
  return <section className="narrow page-flow setup">
    <div><h1>เลือกบทเรียน</h1><p className="lead">จับคู่ให้ถูกครบ {wordsPerGame} คำเพื่อผ่านและดูผลการเล่น</p></div>
    <Options title="หัวข้อ" value={config.mode} change={mode => change({ mode })} options={[
      { value: 'compound', label: 'คำประสม', details: 'รวมคำให้เกิดความหมายใหม่', icon: <Layers3 /> },
      { value: 'double', label: 'คำซ้อน', details: 'ซ้อนคำเพื่อความหมายหรือเสียง', icon: <Waves /> },
    ]} />
    <Options title="รูปแบบการเล่น" value={config.challenge} change={challenge => change({ challenge, timer: 'off' })} options={[
      { value: 'practice', label: 'ฝึกเล่น', details: 'มีคำใบ้และอธิบายทันที' },
      { value: 'test', label: 'ทดสอบ', details: 'ทบทวนคำตอบหลังจบเกม' },
    ]} />
    <Options title="ระดับ" value={config.difficulty} change={difficulty => change({ difficulty, timer: difficulty === 'hard' || config.challenge === 'test' ? config.timer : 'off' })} options={
      (Object.keys(difficultyLabel) as GameConfig['difficulty'][]).map(value => ({ value, label: difficultyLabel[value] }))
    } />
    <Options title="วิธีควบคุม" value={config.control} change={control => change({ control })} options={[
      { value: 'pointer', label: 'เมาส์หรือสัมผัส', details: 'ใช้คีย์บอร์ดได้ด้วย', icon: <Hand /> },
      { value: 'camera', label: 'กล้อง', details: 'บีบนิ้วเพื่อหยิบการ์ด', icon: <Camera /> },
    ]} />
    {config.control === 'camera' && <div className="inline-controls">
      <Check checked={settings.mirror} onChange={mirror => changeSettings({ mirror })} label="สะท้อนภาพเหมือนกระจก" />
      <Check checked={settings.preview} onChange={preview => changeSettings({ preview })} label="แสดงภาพกล้องในสนาม" />
      <p>กล้องจะเปิดเมื่อคุณกดอนุญาต ภาพจะประมวลผลบนอุปกรณ์</p>
    </div>}
    {config.challenge === 'test' && <div className="inline-controls">
      <label>จับเวลา <select value={config.timer} onChange={event => change({ timer: event.target.value as GameConfig['timer'] })}>
        <option value="off">ปิด</option><option value="round">ต่อด่าน</option><option value="game">ทั้งเกม</option>
      </select></label>
      {config.timer !== 'off' && <label>เวลา (วินาที) <input type="number" min={10} max={900} value={config.seconds} onChange={event => change({ seconds: event.target.valueAsNumber || 0 })} /></label>}
    </div>}
    {(!available || dealError) && <p role="alert">{!available ? `หัวข้อนี้มีคำพร้อมเล่นไม่ถึง ${wordsPerGame} คำ ตรวจสถานะในคลังคำสำหรับครู` : dealError}</p>}
    <Button look="primary" disabled={!available || (config.timer !== 'off' && (config.seconds < 10 || config.seconds > 900))} onClick={start}>
      {config.control === 'camera' ? 'ไปหน้าปรับเทียบกล้อง' : 'เข้าสนาม'} <ArrowRight size={20} />
    </Button>
  </section>
}

export function SettingsForm({ settings, change }: { settings: Settings; change: (patch: Partial<Settings>) => void }) {
  return <div className="settings-form">
    <Check checked={settings.sound} onChange={sound => change({ sound })} label="เปิดเสียงเอฟเฟกต์" />
    <Check checked={settings.reduced} onChange={reduced => change({ reduced })} label="ลดการเคลื่อนไหว" />
    <Check checked={settings.preview} onChange={preview => change({ preview })} label="แสดงภาพกล้องในสนาม" />
    <Check checked={settings.mirror} onChange={mirror => change({ mirror })} label="สะท้อนภาพเหมือนกระจก" />
    <Check checked={settings.save} onChange={save => change({ save })} label="เก็บการตั้งค่า รอบที่เล่นค้าง และผลล่าสุดในเบราว์เซอร์นี้" />
    <label>คุณภาพกราฟิก <select value={settings.quality} onChange={event => change({ quality: event.target.value as Settings['quality'] })}>
      <option value="auto">ปรับอัตโนมัติ</option><option value="low">ต่ำ</option><option value="medium">ปานกลาง</option><option value="high">สูง</option>
    </select></label>
    <label>แรงแม่เหล็ก <input type="range" min=".65" max="1.4" step=".05" value={settings.magnet} onChange={event => change({ magnet: +event.target.value })} /></label>
    <label>ระยะเวลาเอฟเฟกต์ <input type="range" min="200" max="850" step="10" value={settings.effects} onChange={event => change({ effects: +event.target.value })} /></label>
  </div>
}

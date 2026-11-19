import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import { Camera, CameraOff, Crosshair, Hand, Mouse, Video } from 'lucide-react'
import type { Settings } from '../app/storage'
import { Button, Check } from '../components/ui'
import { distance, clamp, type Point } from '../game/boardLayout'
import type { BoardInput } from '../game/Board'
import type { Reading } from './camera'
import { handCoordinates, PinchMachine, type Gesture, type HandPose } from './gestures'
import { useCamera, type CameraState, type Metrics } from './useCamera'

const stateLabel: Record<CameraState['status'], string> = {
  off: 'ปิดกล้อง', request: 'รออนุญาตกล้อง', loading: 'กำลังโหลดตัวตรวจจับมือ',
  ready: 'กล้องพร้อม', paused: 'พักกล้อง', error: 'กล้องติดขัด',
}
const gestureLabel: Record<Gesture['state'], string> = {
  NO_HAND: 'ยังไม่เห็นมือ', IDLE: 'เห็นมือ', HOVER: 'เหนือการ์ด', PINCH_CANDIDATE: 'กำลังบีบนิ้ว',
  GRABBING: 'หยิบแล้ว', DRAGGING: 'กำลังลาก', RELEASE_PENDING: 'กำลังปล่อย', COOLDOWN: 'วางแล้ว',
}
const idle: Gesture = { point: null, state: 'NO_HAND', gap: null }
type Snapshot = { gesture: Gesture; pose: HandPose | null; lost: number; brief: number }

function useHands(settings: Settings, input: RefObject<BoardInput | null>, display: boolean) {
  const { close, open, cutoff, beta, derivative, mirror, hand, grace } = settings
  const machine = useMemo(() => new PinchMachine({ close, open, cutoff, beta, derivative, mirror, hand, grace }), [close, open, cutoff, beta, derivative, mirror, hand, grace])
  const [snapshot, setSnapshot] = useState<Snapshot>({ gesture: idle, pose: null, lost: 0, brief: 0 })
  const lastDraw = useRef(0)
  useLayoutEffect(() => () => input.current?.cancel(), [machine, input])
  return {
    snapshot,
    read(reading: Reading) {
      const control = input.current
      if (!control) return
      const now = performance.now()
      const alreadyWaiting = machine.state === 'RELEASE_PENDING'
      const gesture = machine.update(reading.pose, reading.time, control.hit)
      if (gesture.event === 'cancel') control.cancel()
      else if (gesture.event === 'grab' && gesture.point) control.down(gesture.point)
      else if (gesture.event === 'release' && gesture.point) control.up(gesture.point)
      else if (gesture.state === 'RELEASE_PENDING') {
        if (!alreadyWaiting && gesture.point) control.move(gesture.point)
      } else if (gesture.point && (gesture.state === 'DRAGGING' || gesture.state === 'GRABBING')) control.move(gesture.point)
      else control.hover(gesture.point)
      if (display && now - lastDraw.current >= 65) {
        lastDraw.current = now
        setSnapshot({ gesture, pose: reading.pose, lost: machine.lostCount, brief: machine.briefOpenCount })
      }
    },
    cancel() {
      machine.cancel()
      input.current?.cancel()
      if (display) setSnapshot({ gesture: idle, pose: null, lost: machine.lostCount, brief: machine.briefOpenCount })
    },
  }
}

function Feed({ video, mirror, show }: { video: RefObject<HTMLVideoElement | null>; mirror: boolean; show: boolean }) {
  return <video ref={video} aria-hidden="true" className="tracking-video" data-mirror={mirror} data-visible={show} muted autoPlay playsInline />
}

function useCameraAspect(video: RefObject<HTMLVideoElement | null>) {
  const [aspect, setAspect] = useState(4 / 3)
  useEffect(() => {
    const element = video.current!
    function update() {
      if (element.videoWidth && element.videoHeight) setAspect(element.videoWidth / element.videoHeight)
    }
    element.addEventListener('loadedmetadata', update)
    element.addEventListener('resize', update)
    update()
    return () => {
      element.removeEventListener('loadedmetadata', update)
      element.removeEventListener('resize', update)
    }
  }, [video])
  return aspect
}

const frameStyle = (aspect: number) => ({ '--camera-aspect': aspect } as CSSProperties)
const classroomCameraQuality = (quality: Settings['quality']) => quality === 'high' ? 'auto' : quality

export function CameraGame({ input, active, settings, switchControl, children, onReady }: {
  input: RefObject<BoardInput | null>; active: boolean; settings: Settings; switchControl: () => void;
  children: ReactNode; onReady: (ready: boolean) => void;
}) {
  const [retry, setRetry] = useState(0)
  const video = useRef<HTMLVideoElement>(null)
  const aspect = useCameraAspect(video)
  const hands = useHands(settings, input, false)
  const camera = useCamera({ enabled: true, active, retry, quality: classroomCameraQuality(settings.quality), video, onReading: hands.read, cancel: hands.cancel, reportMetrics: false })
  const ready = camera.status === 'ready'
  useEffect(() => { onReady(ready) }, [ready, onReady])
  return <div className="camera-stage">
    <div className="camera-frame" style={frameStyle(aspect)}>
      <Feed video={video} mirror={settings.mirror} show={settings.preview && (ready || camera.status === 'loading')} />
      {children}
    </div>
    <div className="camera-in-game">
      <span role="status"><Video size={14} /> {stateLabel[camera.status]}</span>
      {camera.status === 'error' && <p role="alert">{camera.detail}</p>}
      {camera.status !== 'ready' && <div className="actions">
        {camera.status === 'error' && <Button onClick={() => setRetry(value => value + 1)}>ลองอีกครั้ง</Button>}
        <Button onClick={switchControl}><Mouse size={16} /> ใช้เมาส์</Button>
      </div>}
      {camera.status === 'ready' && <Button onClick={switchControl}><CameraOff size={15} /> ปิดกล้อง</Button>}
    </div>
  </div>
}

const start = { x: .33, y: .58 }
const dock = { x: .72, y: .42 }
function synthetic(point: Point, closed: boolean, mirror: boolean): HandPose {
  const x = mirror ? 1 - point.x : point.x
  const { y } = point
  const points = Array.from({ length: 21 }, (_, index) => ({
    x: x + ((index % 4) - 1.5) * .021 * (mirror ? -1 : 1),
    y: y + .09 - .012 * (index % 5),
  }))
  points[0] = { x, y: y + .18 }
  points[5] = { x: x - .06, y: y + .1 }
  points[17] = { x: x + .06, y: y + .1 }
  points[9] = { x, y: y + .07 }
  points[8] = { x, y }
  points[4] = { x, y: y + (closed ? .024 : .112) }
  return { landmarks: points, hand: 'Right', aspect: 1.33, score: 1 }
}
const pointStyle = (point: Point): CSSProperties => ({ left: point.x * 100 + '%', top: point.y * 100 + '%' })

export function TrackingLab({ diagnostic, settings, change, onPlay, onSkip }: {
  diagnostic: boolean; settings: Settings; change: (patch: Partial<Settings>) => void; onPlay: () => void; onSkip: () => void;
}) {
  const [enabled, setEnabled] = useState(false)
  const [retry, setRetry] = useState(0)
  const [simulate, setSimulate] = useState(false)
  const [closed, setClosed] = useState(false)
  const [cube, setCube] = useState(start)
  const [complete, setComplete] = useState(false)
  const [grabbed, setGrabbed] = useState(false)
  const cursor = useRef<HTMLSpanElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const aspect = useCameraAspect(video)
  const simulated = useRef(start)
  const grab = useRef<{ grip: Point; origin: Point } | null>(null)
  const input = useRef<BoardInput | null>(null)
  const hands = useHands(settings, input, true)
  const camera = useCamera({ enabled, active: !simulate, retry, quality: diagnostic ? settings.quality : classroomCameraQuality(settings.quality), video, onReading: hands.read, cancel: hands.cancel })

  const mark = (point: Point | null) => {
    const node = cursor.current
    if (!node) return
    node.hidden = !point
    if (point) { node.style.left = point.x * 100 + '%'; node.style.top = point.y * 100 + '%' }
  }
  useLayoutEffect(() => {
    function reset() { grab.current = null; setGrabbed(false); mark(null); setCube(current => complete ? current : start) }
    const position = (point: Point) => {
      const active = grab.current!
      return { x: clamp(active.origin.x + point.x - active.grip.x, .08, .92), y: clamp(active.origin.y + point.y - active.grip.y, .12, .88) }
    }
    input.current = {
      hit: point => distance(point, cube) < .14 && !complete,
      hover: mark,
      down: point => { grab.current = { grip: point, origin: cube }; setGrabbed(true); mark(point) },
      move: point => { if (grab.current) setCube(position(point)); mark(point) },
      up: point => {
        if (!grab.current) return
        const success = distance(position(point), dock) < .15
        setComplete(success)
        setCube(success ? dock : start)
        setGrabbed(false)
        grab.current = null
        mark(point)
      },
      cancel: reset,
    }
  }, [cube, complete])

  const simulation = useRef({ read: hands.read, closed, mirror: settings.mirror })
  useLayoutEffect(() => { simulation.current = { read: hands.read, closed, mirror: settings.mirror } })
  useEffect(() => {
    if (!simulate) return
    const step = () => {
      const { read, closed, mirror } = simulation.current
      read({ pose: synthetic(simulated.current, closed, mirror), time: performance.now(), duration: 0 })
    }
    const handle = window.setInterval(step, 33)
    return () => window.clearInterval(handle)
  }, [simulate])

  function resetCube() {
    input.current?.cancel()
    hands.cancel()
    setCube(start)
    simulated.current = start
    setClosed(false)
    setComplete(false)
  }
  function toggleSimulation() {
    resetCube()
    setEnabled(false)
    setSimulate(!simulate)
    if (!simulate) requestAnimationFrame(() => {
      stage.current?.scrollIntoView({ block: 'center' })
      stage.current?.focus({ preventScroll: true })
    })
  }
  const { gesture, pose, lost, brief } = hands.snapshot
  return <section className="page-flow tracking-page">
    <div><h1>{diagnostic ? 'ตรวจสอบการควบคุม' : 'ปรับเทียบกล้อง'}</h1>
      <p className="lead">เล็งที่ลูกบาศก์ บีบนิ้วโป้งกับนิ้วชี้ แล้วลากไปปล่อยบนช่องเป้าหมาย</p></div>
    <div className="tracking-grid">
      <div className="tracking-work">
        <div className="tracking-stage" ref={stage} tabIndex={simulate ? 0 : undefined} aria-label="พื้นที่ทดลองหยิบลูกบาศก์"
          onKeyDown={event => {
            if (!simulate) return
            const x = Number(event.key === 'ArrowRight') - Number(event.key === 'ArrowLeft')
            const y = Number(event.key === 'ArrowDown') - Number(event.key === 'ArrowUp')
            if (x || y) {
              event.preventDefault()
              simulated.current = { x: clamp(simulated.current.x + x * .04, .025, .975), y: clamp(simulated.current.y + y * .04, .025, .975) }
            }
            if (event.key === ' ') { event.preventDefault(); if (!event.repeat) setClosed(value => !value) }
          }}>
          <div className="camera-frame" style={frameStyle(simulate ? 4 / 3 : aspect)}
            onPointerMove={event => {
              if (!simulate) return
              const rect = event.currentTarget.getBoundingClientRect()
              simulated.current = { x: clamp((event.clientX - rect.left) / rect.width, .025, .975), y: clamp((event.clientY - rect.top) / rect.height, .025, .975) }
            }}
            onPointerDown={() => { if (simulate) setClosed(value => !value) }}>
            <Feed video={video} mirror={settings.mirror} show={!simulate && (camera.status === 'ready' || camera.status === 'loading')} />
            <span className="practice-dock" style={pointStyle(dock)}>วางที่นี่</span>
            <span className="practice-cube" data-grabbed={grabbed} style={pointStyle(cube)} aria-hidden="true"><Hand size={25} /></span>
            {pose?.landmarks.map((point, index) => <span key={index} className="landmark" data-tip={index === 4 || index === 8} style={pointStyle(handCoordinates(point, settings.mirror))} />)}
            <span ref={cursor} hidden className="tracking-cursor" aria-hidden="true"><Crosshair size={26} /></span>
          </div>
          <span className="tracking-caption">{simulate ? 'จำลองท่ามือ' : stateLabel[camera.status]}</span>
        </div>
        <div className="inline-controls">
          <p aria-live="polite">{complete ? 'วางลูกบาศก์สำเร็จ' : simulate ? 'ขยับเมาส์หรือใช้ลูกศร คลิกในกรอบหรือกด Space เพื่อบีบหรือคลายนิ้ว' : 'ให้แสงอยู่ด้านหน้าและวางมือในกรอบ โดยเว้นพื้นที่รอบตัว'}</p>
          {camera.detail && <p className={camera.status === 'error' ? 'error-message' : 'muted'} role={camera.status === 'error' ? 'alert' : 'status'}>{camera.detail}</p>}
          <div className="actions">
            {!enabled && <Button look="primary" onClick={() => { setSimulate(false); resetCube(); setEnabled(true) }}><Camera size={18} /> อนุญาตและเปิดกล้อง</Button>}
            {enabled && <Button onClick={() => { setEnabled(false); resetCube() }}><CameraOff size={17} /> ปิดกล้อง</Button>}
            {camera.status === 'error' && enabled && <Button look="primary" onClick={() => { resetCube(); setRetry(value => value + 1) }}>ลองเปิดกล้องอีกครั้ง</Button>}
            {diagnostic && <Button onClick={toggleSimulation}>{simulate ? 'หยุดจำลอง' : 'จำลองท่าบีบ'}</Button>}
            {complete && <Button onClick={resetCube}>ทดลองอีกครั้ง</Button>}
            {!diagnostic && <Button onClick={onSkip}><Mouse size={17} /> เล่นด้วยเมาส์</Button>}
            {!diagnostic && camera.status === 'ready' && <Button look="primary" onClick={onPlay}>เข้าสนามพร้อมกล้อง</Button>}
          </div>
          <p className="muted">ประมวลผลภาพบนอุปกรณ์ ภาพไม่ถูกเก็บหรือส่งออกไป</p>
        </div>
      </div>
      <aside className="tracking-side">
        <section className="settings-form">
          <h2>ปรับท่าบีบ</h2>
          <label>ระยะนิ้วเทียบกับขนาดมือ <meter min={0} max={1} value={Math.min(1, gesture.gap ?? 0)} /></label>
          <p>{gestureLabel[gesture.state]} · {gesture.gap?.toFixed(2) ?? '—'}</p>
          <label>เกณฑ์หยิบ <output>{settings.close.toFixed(2)}</output><input type="range" min=".12" max={Math.min(.55, settings.open - .06)} step=".01"
            value={settings.close} onChange={event => change({ close: +event.target.value })} /></label>
          <label>เกณฑ์ปล่อย <output>{settings.open.toFixed(2)}</output><input type="range" min={Math.max(.2, settings.close + .06)} max=".75" step=".01"
            value={settings.open} onChange={event => change({ open: +event.target.value })} /></label>
          <label>มือที่ใช้ <select value={settings.hand} onChange={event => change({ hand: event.target.value as Settings['hand'] })}>
            <option value="auto">ตรวจอัตโนมัติ</option><option value="Left">มือซ้าย</option><option value="Right">มือขวา</option>
          </select></label>
          <Check checked={settings.mirror} onChange={mirror => change({ mirror })} label="สะท้อนภาพเหมือนกระจก" />
          <p>คะแนนจำแนกซ้าย/ขวา {pose ? Math.round(pose.score * 100) + '%' : '—'}</p>
        </section>
        {diagnostic && <section className="settings-form">
          <h2>ตัวกรอง One Euro</h2>
          <label>ความถี่ต่ำสุด {settings.cutoff.toFixed(1)} Hz<input type="range" min=".2" max="8" step=".1" value={settings.cutoff} onChange={event => change({ cutoff: +event.target.value })} /></label>
          <label>การตอบสนองตามความเร็ว {settings.beta.toFixed(1)}<input type="range" min="0" max="8" step=".1" value={settings.beta} onChange={event => change({ beta: +event.target.value })} /></label>
          <label>ความถี่กรองความเร็ว {settings.derivative.toFixed(2)} Hz<input type="range" min=".25" max="5" step=".05" value={settings.derivative} onChange={event => change({ derivative: +event.target.value })} /></label>
          <label>รอก่อนคืนการ์ดเมื่อมือหาย {settings.grace} ms<input type="range" min="150" max="500" step="10" value={settings.grace} onChange={event => change({ grace: +event.target.value })} /></label>
        </section>}
      </aside>
    </div>
    {diagnostic && <Telemetry metrics={camera.metrics} snapshot={hands.snapshot} running={camera.status === 'ready'} simulate={simulate} lost={lost} brief={brief} />}
  </section>
}

function Telemetry({ metrics, snapshot, running, simulate, lost, brief }: {
  metrics: Metrics; snapshot: Snapshot; running: boolean; simulate: boolean; lost: number; brief: number;
}) {
  const metric = (value: number, unit: string) => running ? value.toFixed(1) + ' ' + unit : '—'
  const rows = [
    ['แหล่งข้อมูล', simulate ? 'มือจำลอง' : running ? metrics.backend : '—'],
    ['ความละเอียดกล้อง', running ? metrics.resolution : '—'],
    ['ขนาดเฟรมเข้าโมเดล', running ? metrics.resolutionInput : '—'],
    ['คุณภาพที่กำลังใช้', running ? ({ low: 'ต่ำ', medium: 'กลาง', high: 'สูง' })[metrics.quality] : '—'],
    ['ภาพกล้อง', metric(metrics.camera, 'FPS')], ['อนุมาน', metric(metrics.inference, 'FPS')], ['เฟรมหน้าเว็บ', metric(metrics.render, 'FPS')],
    ['เวลาอนุมานต่อเฟรม', metric(metrics.frame, 'ms')], ['จากรับเฟรมถึงจัดการท่ามือ', metric(metrics.latency, 'ms')],
    ['เฟรมกล้องที่ตก / ข้ามก่อนอนุมาน', running ? metrics.dropped + ' / ' + metrics.skipped : '—'],
    ['จุดมือที่พบ', snapshot.pose?.landmarks.length ?? 0], ['มือหายนาน / คลายชั่วคราว', lost + ' / ' + brief],
  ]
  return <section className="telemetry">
    <h2>ค่าที่วัดได้</h2>
    <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <p className="muted">ค่ากล้องและความหน่วงเฉลี่ยจากเฟรมราวหนึ่งวินาที ตัวนับคลายชั่วคราวใช้วิเคราะห์สัญญาณรบกวน</p>
  </section>
}

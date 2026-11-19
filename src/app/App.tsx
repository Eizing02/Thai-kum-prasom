import { useCallback, useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button, Shell } from '../components/ui'
import { playable, type Word } from '../content/schema'
import { words } from '../content/words'
import { defaultConfig, generateLevels, wordsPerGame, type Game, type GameConfig, type GameResult, type Level } from '../game/engine'
import { unlockAudio } from '../game/audio'
import { Home, Help } from '../pages/Home'
import { About } from '../pages/About'
import { Setup, SettingsForm } from '../pages/Setup'
import { Play } from '../pages/Play'
import { Result } from '../pages/Result'
import { Teacher } from '../pages/Teacher'
import { CameraGame, TrackingLab } from '../tracking/TrackingUI'
import { readProgress, storeProgress, type Progress } from './progress'
import { clearResult, readLibrary, readRecentDeals, readResult, readSettings, savePreferences, writeLibrary, writeRecentDeals, writeResult, type RecentDeals, type Settings } from './storage'

const base = import.meta.env.BASE_URL
const currentPath = () => ('/' + window.location.pathname.slice(base.length)).replace(/\/$/, '') || '/'
type Session = { id: number; config: GameConfig; levels: Level[]; resume?: Game; preview?: boolean }

export default function App() {
  const [route, setRoute] = useState(currentPath)
  const [settings, setSettings] = useState(readSettings)
  const [library, setLibrary] = useState(() => readLibrary() ?? words)
  const [result, setResult] = useState(() => readSettings().save ? readResult() : null)
  const [progress, setProgress] = useState(() => readSettings().save ? readProgress() : null)
  const [config, setConfig] = useState(defaultConfig)
  const [session, setSession] = useState<Session>()
  const [saveError, setSaveError] = useState(false)
  const [dealError, setDealError] = useState('')
  const [recentDeals, setRecentDeals] = useState<RecentDeals>(() => settings.save ? readRecentDeals() : {})
  const go = useCallback((path: string) => {
    window.history.pushState({}, '', base + path.slice(1))
    setRoute(path)
    window.scrollTo(0, 0)
    requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>('main h1')
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }) }
    })
  }, [])

  useEffect(() => {
    const update = () => setRoute(currentPath())
    window.addEventListener('popstate', update)
    return () => window.removeEventListener('popstate', update)
  }, [])
  function changeSettings(patch: Partial<Settings>) {
    const updated = { ...settings, ...patch }
    setSettings(updated)
    const saved = savePreferences(updated)
    const cleared = patch.save !== false || storeProgress(null)
    if (patch.save === false) setProgress(null)
    setSaveError(!saved || !cleared)
  }
  function saveLibrary(next: Word[]) {
    if (!writeLibrary(next)) return false
    setLibrary(next)
    return true
  }
  function launch(setup: GameConfig, featured?: string, preview = false) {
    if (settings.sound) unlockAudio()
    const id = Date.now()
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]
    const bank = preview ? library.map(word => word.id === featured ? { ...word, approved: true, needsReview: false } : word) : library
    const key = `${setup.mode}/${setup.difficulty}`
    const history = recentDeals[key] ?? []
    const levels = generateLevels(bank, setup, seed, featured, { recent: preview ? [] : history.flat() })
    if (!levels.length) {
      setDealError('จัดคำพร้อมเล่นให้ครบ 10 คำไม่ได้ ลองเลือกอีกหัวข้อหรือเพิ่มคำในคลังสำหรับครู')
      go('/setup')
      return
    }
    if (!preview) {
      const labels = [...new Set(levels.flatMap(level => level.whitelist.map(word => word.displayWord)))]
      const next = { ...recentDeals, [key]: [labels, ...history].slice(0, 3) }
      setRecentDeals(next)
      if (settings.save) setSaveError(!writeRecentDeals(next))
    }
    setDealError('')
    setSession({ id, config: setup, levels, preview })
    go('/play')
  }
  function resumeSession() {
    if (!progress) return
    const config = { ...progress.config, control: 'pointer' } as const
    let levels = progress.levels
    const missing = wordsPerGame - levels.reduce((sum, level) => sum + level.goals.length, 0)
    if (missing > 0) {
      const exclude = levels.flatMap(level => level.whitelist.map(word => word.displayWord))
      const extras = generateLevels(library, config, progress.id, undefined, { total: missing, exclude })
      if (!extras.length) {
        setDealError('คลังคำปัจจุบันจัดโจทย์เพิ่มให้รอบที่บันทึกไว้ไม่ครบ 10 คำ กรุณาเลือกบทเรียนเพื่อเริ่มรอบใหม่')
        go('/setup')
        return
      }
      levels = [...levels, ...extras]
    }
    if (settings.sound) unlockAudio()
    setConfig(config)
    setSession({ id: progress.id, config, levels, resume: progress.game })
    go('/play')
  }
  const saveProgress = useCallback((game: Game) => {
    if (!session) return
    const { id, config, levels } = session
    const progress: Progress = { id, config, levels, game }
    setProgress(progress)
    setSaveError(!storeProgress(progress))
  }, [session])
  function finish(next: GameResult) {
    if (session?.preview) { go('/teacher'); return }
    if (next.correct !== wordsPerGame) return
    setResult(next)
    if (settings.save) {
      const saved = writeResult(next)
      const cleared = storeProgress(null)
      setProgress(null)
      setSaveError(!saved || !cleared)
    }
    go('/result')
  }
  let page
  switch (route) {
    case '/': page = <Home go={go} saved={!!result} reduced={settings.reduced} resume={progress ? resumeSession : undefined} />; break
    case '/help': page = <Help go={go} />; break
    case '/about': page = <About go={go} />; break
    case '/setup': page = <Setup config={config} setConfig={setConfig} settings={settings} changeSettings={changeSettings}
      available={new Set(library.filter(word => playable(word) && word.mode === config.mode).map(word => word.displayWord)).size >= wordsPerGame}
      dealError={dealError} start={() => config.control === 'camera' ? go('/calibration') : launch(config)} />; break
    case '/play': page = session ? <Play key={session.id} config={session.config} levels={session.levels} settings={settings} change={changeSettings} finish={finish} go={go} restart={() => launch(session.config)} preview={session.preview} resume={session.resume} saveProgress={settings.save && !session.preview ? saveProgress : undefined} camera={session.config.control === 'camera' ? (input, active, board, onReady) => <CameraGame input={input} active={active} settings={settings} onReady={onReady} switchControl={() => setSession({ ...session, config: { ...session.config, control: 'pointer' } })}>{board}</CameraGame> : undefined} /> :
      <section className="narrow page-flow"><h1>เลือกบทเรียนเพื่อเริ่มเกม</h1><div className="actions">{progress && <Button look="primary" onClick={resumeSession}>เล่นรอบเดิมต่อ <ArrowRight size={18} /></Button>}<Button look={progress ? 'secondary' : 'primary'} onClick={() => go('/setup')}>เลือกบทเรียน <ArrowRight size={18} /></Button></div></section>; break
    case '/result': page = <Result result={result} go={go} replay={() => go('/setup')} clear={() => { setResult(null); setSaveError(!clearResult()) }} />; break
    case '/teacher': page = <Teacher library={library} save={saveLibrary} preview={word => launch({ ...defaultConfig, mode: word.mode }, word.id, true)} />; break
    case '/calibration': page = <TrackingLab key="calibration" diagnostic={false} settings={settings} change={changeSettings} onPlay={() => launch({ ...config, control: 'camera' })} onSkip={() => launch({ ...config, control: 'pointer' })} />; break
    case '/diagnostics': page = <TrackingLab key="diagnostics" diagnostic settings={settings} change={changeSettings} onPlay={() => go('/setup')} onSkip={() => go('/setup')} />; break
    case '/settings': page = <section className="narrow page-flow"><h1>ตั้งค่า</h1><SettingsForm settings={settings} change={changeSettings} /></section>; break
    default: page = <section className="narrow page-flow"><h1>ไม่พบหน้านี้</h1><Button onClick={() => go('/')}>กลับหน้าแรก</Button></section>
  }
  return <Shell go={go} route={route}>{saveError && <p role="alert" className="error-message">เบราว์เซอร์ไม่อนุญาตให้บันทึกข้อมูลในเครื่อง</p>}{page}</Shell>
}

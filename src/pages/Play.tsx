import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Clock3, Droplet, Fan, House, Lightbulb, LogOut, Magnet, Maximize, Minimize, Pause, Settings2, Snowflake, TrainFront, Volume2, VolumeX, Waves } from 'lucide-react'
import { Button, Dialog, type Navigate } from '../components/ui'
import { AdditionalMeanings, WordSpeech } from '../components/WordDetails'
import { modeLabel, subtypeLabel, type Word } from '../content/schema'
import type { Settings } from '../app/storage'
import { advance, cardAnswer, initialGame, match, retryTimedRound, summarize, wordsPerGame } from '../game/engine'
import type { Game, GameConfig, GameResult, Level } from '../game/engine'
import { Board, type BoardInput } from '../game/Board'
import { chime, unlockAudio } from '../game/audio'
import { SettingsForm } from './Setup'

const icons = { train: TrainFront, snow: Snowflake, wind: Fan, water: Droplet, home: House, sound: Waves, word: Magnet }

function WordDetail({ word, points, next }: { word: Word; points: number; next: () => void }) {
  const Icon = icons[word.illustrationType]
  return <Dialog title={word.displayWord}>
    <p className="word-category"><span><Icon size={21} /> {subtypeLabel[word.subtype]}</span><strong>+{points} แต้ม</strong></p>
    <dl className="explanation">
      <div><dt>ความหมาย</dt><dd>{word.meaning}</dd></div>
      <div><dt>เหตุผล</dt><dd>{word.explanation}</dd></div>
      <div><dt>ประโยคตัวอย่าง</dt><dd>“{word.exampleSentence}”</dd></div>
    </dl>
    <AdditionalMeanings word={word} />
    <div className="actions">
      <Button look="primary" onClick={next}>ถัดไป <ArrowRight size={18} /></Button>
      <WordSpeech word={word} />
    </div>
  </Dialog>
}

const useReduced = () => {
  const query = useRef(window.matchMedia('(prefers-reduced-motion: reduce)'))
  const [reduced, setReduced] = useState(query.current.matches)
  useEffect(() => {
    const media = query.current
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [])
  return reduced
}

export function Play({ config, settings, change, levels, finish, go, restart, camera, preview, resume, saveProgress }: {
  config: GameConfig; settings: Settings; change: (patch: Partial<Settings>) => void;
  levels: Level[]; finish: (result: GameResult) => void; go: Navigate; restart: () => void;
  preview?: boolean; resume?: Game; saveProgress?: (state: Game) => void;
  camera?: (input: React.RefObject<BoardInput | null>, active: boolean, board: React.ReactNode, onReady: (ready: boolean) => void) => React.ReactNode;
}) {
  const [game, setGame] = useState(resume ?? initialGame)
  const [overlay, setOverlay] = useState<'pause' | 'settings' | 'exit' | null>(null)
  const [ready, setReady] = useState(false)
  const [automatic, setAutomatic] = useState<'low' | 'medium' | 'high'>(() => window.innerWidth < 650 || navigator.hardwareConcurrency <= 4 ? 'low' : 'medium')
  const [cameraReady, setCameraReady] = useState(false)
  const cameraMode = Boolean(camera)
  const [fullscreen, setFullscreen] = useState(false)
  const play = useRef<HTMLElement>(null)
  const input = useRef<BoardInput>(null)
  const boardArea = useRef<HTMLDivElement>(null)
  const lastSave = useRef('')
  const finished = useRef(false)
  const systemReduced = useReduced()
  const reduced = settings.reduced || systemReduced
  const level = levels[game.round]
  const busy = !!overlay || !!game.feedback || !!game.timeExpired || game.done
  const quality = settings.quality === 'auto' ? automatic : settings.quality

  useEffect(() => {
    if (cameraMode || settings.quality !== 'auto' || automatic === 'low' || !boardArea.current) return
    let start = 0, frames = 0, frame = 0
    const measure = (now: number) => {
      if (!start) start = now
      frames++
      if (now - start < 2200) frame = requestAnimationFrame(measure)
      else if (!document.hidden && frames / ((now - start) / 1000) < 40) setAutomatic('low')
    }
    frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
  }, [settings.quality, automatic, cameraMode])

  useEffect(() => {
    if (busy || !level || (cameraMode && !cameraReady)) return
    let previous = performance.now()
    const tick = window.setInterval(() => {
      const now = performance.now()
      const delta = Math.min(1, (now - previous) / 1000)
      previous = now
      if (document.hidden) return
      setGame(current => {
        if (current.done || current.timeExpired || current.feedback) return current
        const updated = { ...current, elapsed: current.elapsed + delta, roundElapsed: current.roundElapsed + delta }
        const time = config.timer === 'game' ? updated.elapsed : updated.roundElapsed
        return config.timer !== 'off' && time >= config.seconds
          ? { ...updated, timeExpired: config.timer } : updated
      })
    }, 200)
    return () => window.clearInterval(tick)
  }, [busy, cameraMode, cameraReady, config.seconds, config.timer, level])

  useEffect(() => {

    if (game.done && !finished.current) {
      finished.current = true
      finish(summarize(game, config))
    }
  }, [config, finish, game])

  useEffect(() => {
    if (!saveProgress || game.done) { lastSave.current = ''; return }
    const stamp = [game.round, game.score, game.wrong, game.hint, game.feedback?.kind, game.timeExpired, Math.floor(game.elapsed)].join('/')
    if (stamp !== lastSave.current) {
      lastSave.current = stamp
      saveProgress(game)
    }
  }, [game, saveProgress])

  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === play.current)
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [])
  useEffect(() => {
    function visibility() {
      if (document.hidden) {
        input.current?.cancel()
        setOverlay(current => current ?? 'pause')
      }
    }
    document.addEventListener('visibilitychange', visibility)
    return () => document.removeEventListener('visibilitychange', visibility)
  }, [])
  useEffect(() => {
    if (!game.feedback) return
    const right = game.feedback.kind === 'right'
    if (settings.sound) chime(right)
    const timer = window.setTimeout(() => {
      if (!right || config.challenge === 'test') setGame(current => advance(current, levels))
      else setReady(true)
    }, reduced ? 100 : settings.effects)
    return () => window.clearTimeout(timer)
  }, [game.feedback, config.challenge, levels, reduced, settings.effects, settings.sound])

  if (!level) return <section className="narrow page-flow"><h1>ไม่มีด่านให้เล่น</h1><Button onClick={() => go('/setup')}>กลับไปเลือกบทเรียน</Button></section>
  const time = config.timer === 'off' ? Math.floor(game.elapsed) :
    Math.max(0, config.seconds - Math.floor(config.timer === 'game' ? game.elapsed : game.roundElapsed))
  const guidance = level.cards.some(card => card.fixed) ? 'ลากการ์ดที่เลือกไปวางบนแท่นสีม่วง' : 'ลากส่วนท้ายไปวางบนส่วนหน้าของคำ'
  const remainingCards = game.hint ? level.cards.filter(card => !game.removed.includes(card.id)) : []
  const hint = level.whitelist.find(word => !game.attempts.some(attempt => attempt.word.displayWord === word.displayWord) &&
    remainingCards.some(source => remainingCards.some(target => cardAnswer(source, target, config.mode, level.whitelist)?.id === word.id)))?.hint
  const feedback = game.feedback
  function next() {
    setReady(false)
    setGame(current => advance(current, levels))
  }

  const board = <Board key={game.round} level={level} mode={config.mode} game={game} disabled={busy} inputRef={input}
    reduced={reduced} quality={quality} settings={settings} masked={config.challenge === 'test'} cameraMode={cameraMode}
    commit={(source, target) => {
      if (settings.sound) unlockAudio()
      setGame(current => match(current, level, config.mode, source, target))
    }} />

  return <section className="play" data-camera={cameraMode} ref={play}>
    <header className="play-head">
      <div><h1>{modeLabel[config.mode]}</h1><p>{preview ? 'ตัวอย่างโจทย์' : config.challenge === 'practice' ? 'ฝึกเล่น' : 'ทดสอบ'} <span aria-hidden="true">/</span> ด่าน {game.round + 1} จาก {levels.length}{level.goals.length > 1 && ` · ${game.solved.length}/${level.goals.length} คู่`}{!preview && ` · ถูก ${game.attempts.length}/${wordsPerGame} คำ`}</p></div>
      <div className="game-toolbar">
        <span className="game-clock"><Clock3 size={17} /> <span aria-label="เวลา">{Math.floor(time / 60)}:{String(time % 60).padStart(2, '0')}</span></span>
        <strong className="game-score">{game.score} <small>แต้ม</small></strong>
        <Button aria-label={settings.sound ? 'ปิดเสียง' : 'เปิดเสียง'} onClick={() => { unlockAudio(); change({ sound: !settings.sound }) }}>{settings.sound ? <Volume2 size={19} /> : <VolumeX size={19} />}</Button>
        <Button aria-label="พักเกม" onClick={() => setOverlay('pause')}><Pause size={19} /></Button>
        <Button aria-label="ตั้งค่าในเกม" onClick={() => setOverlay('settings')}><Settings2 size={19} /></Button>
        {document.fullscreenEnabled && <Button className="fullscreen-toggle" aria-label={fullscreen ? 'ย่อหน้าจอ' : 'เต็มหน้าจอ'} onClick={() => {
          if (fullscreen) void document.exitFullscreen().catch(() => {})
          else void play.current?.requestFullscreen().catch(() => {})
        }}>{fullscreen ? <Minimize size={19} /> : <Maximize size={19} />}</Button>}
        <Button aria-label="ออกจากเกม" onClick={() => setOverlay('exit')}><LogOut size={19} /></Button>
      </div>
    </header>
    <div className="board-area" ref={boardArea} data-layout={config.difficulty}>
      {camera ? camera(input, !overlay && !game.timeExpired && !game.done, board, setCameraReady) : board}
    </div>
    <div className="game-instructions">
      <div aria-live="polite">
        <strong>{feedback?.kind === 'wrong' ? 'ยังจับคู่ไม่สำเร็จ ลองจัดคำใหม่ได้' : feedback?.kind === 'right' ? 'จับคู่สำเร็จ' : guidance}</strong>
        <p>{game.hint ? hint : cameraMode ? 'เล็งด้วยนิ้วชี้ บีบนิ้วเพื่อหยิบ แล้วคลายเหนือคำเป้าหมาย' : 'ใช้คีย์บอร์ดได้ด้วย Tab และ Enter'}</p>
      </div>
      {config.challenge === 'practice' && <Button disabled={game.roundWrong < 2 || game.hint || busy} onClick={() => setGame(current => ({ ...current, hint: true }))}>
        <Lightbulb size={18} /> คำใบ้
      </Button>}
    </div>
    {ready && feedback?.word && !overlay && <WordDetail key={feedback.word.id} word={feedback.word} points={feedback.points ?? 0} next={next} />}
    {game.timeExpired && !overlay && <Dialog title={game.timeExpired === 'round' ? 'หมดเวลาด่านนี้' : 'หมดเวลาทั้งเกม'}>
      <p>จับคู่ถูก {game.attempts.length} จาก {wordsPerGame} คำ ลองอีกครั้งเพื่อจับคู่ให้ครบ</p>
      <div className="actions">
        {game.timeExpired === 'round'
          ? <Button look="primary" onClick={() => setGame(retryTimedRound)}>ลองด่านนี้ใหม่</Button>
          : <Button look="primary" onClick={restart}>เริ่มเกมใหม่</Button>}
        <Button onClick={() => go('/setup')}>เลือกบทเรียน</Button>
      </div>
    </Dialog>}
    {overlay === 'pause' && <Dialog title="พักเกม" close={() => setOverlay(null)}><Button look="primary" onClick={() => setOverlay(null)}>เล่นต่อ <ArrowRight size={18} /></Button></Dialog>}
    {overlay === 'settings' && <Dialog title="ตั้งค่าในเกม" close={() => setOverlay(null)}><SettingsForm settings={settings} change={change} /><Button look="primary" onClick={() => setOverlay(null)}>กลับสู่เกม</Button></Dialog>}
    {overlay === 'exit' && <Dialog title="ออกจากเกมรอบนี้" close={() => setOverlay(null)}>
      <p>จับคู่ถูก {game.attempts.length} จาก {preview ? 1 : wordsPerGame} คำ</p>
      <div className="actions"><Button look="primary" onClick={() => setOverlay(null)}>เล่นต่อ</Button><Button onClick={() => go(preview ? '/teacher' : '/')}>ออกจากเกม</Button></div>
    </Dialog>}
  </section>
}

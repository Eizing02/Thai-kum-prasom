import { lazy, Suspense, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent, Ref } from 'react'
import { Magnet, Plus } from 'lucide-react'
import { clamp, distance, layoutCards, targetAt } from './boardLayout'
import type { Point, VisualCard } from './boardLayout'
import { cardAnswer } from './engine'
import type { Card, Game, Level } from './engine'
import type { Mode } from '../content/schema'
import type { Settings } from '../app/storage'

const Scene = lazy(() => import('./Scene'))
const SafeScene = lazy(() => import('./Scene').then(module => ({ default: module.SceneBoundary })))
export type BoardInput = {
  hit: (point: Point) => boolean; hover: (point: Point | null) => void; down: (point: Point) => void;
  move: (point: Point) => void; up: (point: Point) => void; cancel: () => void;
}
type Drag = { id: string; origin: Point; point: Point; moved: boolean; pointer: number | 'hand'; targetId?: string }

export function Board({ level, mode, game, disabled, reduced, quality, settings, commit, inputRef, masked, cameraMode }: {
  level: Level; mode: Mode; game: Game; disabled: boolean; reduced: boolean; quality: 'low' | 'medium' | 'high';
  settings: Settings; commit: (source: string, target: string) => void; inputRef: Ref<BoardInput>; masked: boolean; cameraMode: boolean;
}) {
  const surface = useRef<HTMLDivElement>(null)
  const cursor = useRef<HTMLSpanElement>(null)
  const handPoint = useRef<Point | null>(null)
  const nodes = useRef<Record<string, HTMLButtonElement | null>>({})
  const poses = useRef<Record<string, VisualCard>>({})
  const drag = useRef<Drag | null>(null)
  const animation = useRef<{ id: string; target: Point; start: number; from: Point } | null>(null)
  const suppressClick = useRef(false)
  const wakeAnimation = useRef(() => {})
  const [size, setSize] = useState({ width: 720, height: 420 })
  const [allow3d, setAllow3d] = useState(false)
  const [webgl, setWebgl] = useState(false)
  const [selected, setSelected] = useState<string>()
  const [near, setNear] = useState<{ id: string; correct: boolean }>()
  const [holding, setHolding] = useState<string>()
  const layout = layoutCards(level.cards, size)
  const visible = level.cards.filter(card => !game.removed.includes(card.id) || card.id === game.feedback?.source || card.id === game.feedback?.target)
  const radius = .66 * settings.magnet
  const blocked = disabled || Boolean(game.feedback)

  useLayoutEffect(() => {
    const element = surface.current!
    const resize = () => {
      const width = element.clientWidth, height = element.clientHeight
      setSize(previous => previous.width === width && previous.height === height ? previous : { width, height })
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let active = true
    if (!cameraMode && !import.meta.env.VITE_FORCE_2D) {
      void import('./Scene').then(module => { if (active) setAllow3d(module.supportsWebGL()) }).catch(() => {})
    }
    return () => { active = false }
  }, [cameraMode])

  const rules = { visible, layout, blocked, radius, mode, level, game, reduced, settings, masked }
  const latest = useRef(rules)
  const getTarget = (point: Point, source: string) => {
    const { visible, layout, radius } = latest.current
    return targetAt(point, visible, layout, radius, source)
  }

  const cancel = useCallback(() => {
    if (drag.current) {
      suppressClick.current = drag.current.moved
      drag.current = null
    }
    setHolding(undefined)
    setNear(undefined)
    handPoint.current = null
    if (cursor.current) cursor.current.hidden = true
    wakeAnimation.current()
  }, [])
  useLayoutEffect(() => {
    const previous = latest.current.layout
    latest.current = rules
    if (previous.width !== layout.width || previous.height !== layout.height) {
      poses.current = {}
      if (drag.current) cancel()
      if (cameraMode) {
        for (const node of Object.values(nodes.current)) {
          if (node) node.style.transform = ''
        }
      }
    }
    wakeAnimation.current()
  })
  useEffect(() => { if (blocked) cancel() }, [blocked, cancel])

  function begin(card: Card, point: Point, pointer: Drag['pointer']) {
    if (blocked || drag.current || card.fixed) return
    suppressClick.current = false
    drag.current = { id: card.id, origin: point, point: layout.places[card.id], moved: pointer === 'hand', pointer }
    setHolding(card.id)
    wakeAnimation.current()
  }

  function move(point: Point, pointer: Drag['pointer']) {
    const active = drag.current
    if (blocked || !active || active.pointer !== pointer) return
    const home = layout.places[active.id]
    active.moved ||= distance(active.origin, point) > 6
    if (!active.moved) return
    const x = pointer === 'hand' ? point.x : home.x + point.x - active.origin.x
    const y = pointer === 'hand' ? point.y : home.y + point.y - active.origin.y
    active.point = {
      x: clamp(x, layout.cardWidth / 2, layout.width - layout.cardWidth / 2),
      y: clamp(y, layout.cardHeight / 2, layout.height - layout.cardHeight / 2),
    }
    wakeAnimation.current()
    const target = getTarget(pointer === 'hand' ? point : active.point, active.id)
    if (active.targetId !== target?.id) {
      active.targetId = target?.id
      const source = level.cards.find(card => card.id === active.id)!
      const answer = target && cardAnswer(source, target, mode, level.whitelist)
      setNear(target ? { id: target.id, correct: !!answer && !game.attempts.some(attempt => attempt.word.displayWord === answer.displayWord) } : undefined)
    }
    return target
  }

  function end(point: Point, pointer: Drag['pointer']) {
    const active = drag.current
    if (!active || active.pointer !== pointer) return
    const target = move(point, pointer)
    if (active.moved) {
      animation.current = { id: active.id, from: { ...active.point }, target: target ? layout.places[target.id] : layout.places[active.id], start: performance.now() }
      setSelected(undefined)
    }
    cancel()
    if (target) commit(active.id, target.id)
  }

  function local(point: Point) {
    const rect = surface.current!.getBoundingClientRect()
    return { x: point.x - rect.left, y: point.y - rect.top }
  }

  function mark(point: Point | null) {
    handPoint.current = blocked ? null : point
    wakeAnimation.current()
  }
  const scale = (point: Point) => ({ x: point.x * layout.width, y: point.y * layout.height })
  const pick = (point: Point) => targetAt(point, visible.filter(card => !card.fixed), layout, .76)
  useImperativeHandle(inputRef, () => ({
    hit: point => !blocked && Boolean(pick(scale(point))),
    hover: point => mark(point ? scale(point) : null),
    down: point => {
      const position = scale(point)
      const card = pick(position)
      if (card) {
        mark(position)
        begin(card, position, 'hand')
        move(position, 'hand')
      }
    },
    move: point => { const position = scale(point); mark(position); move(position, 'hand') },
    up: point => end(scale(point), 'hand'),
    cancel,
  }))

  useEffect(() => {
    let frame = 0
    let previous = 0
    const wake = () => { if (!frame) frame = requestAnimationFrame(animate) }
    function animate(time: number) {
      frame = 0
      const elapsed = previous ? Math.min(45, time - previous) : 16
      previous = time
      const { layout, visible, game, reduced, settings, masked } = latest.current
      const held = drag.current
      const point = handPoint.current
      const reticle = cursor.current
      if (reticle) {
        if (reticle.hidden === Boolean(point)) reticle.hidden = !point
        if (point) {
          const transform = `translate3d(${point.x.toFixed(2)}px, ${point.y.toFixed(2)}px, 0px) translate(-50%, -50%)`
          if (reticle.style.transform !== transform) reticle.style.transform = transform
        }
      }
      const transition = animation.current
      const feedback = game.feedback
      const duration = reduced ? 1 : settings.effects
      let animating = false
      for (const card of visible) {
        const home = layout.places[card.id]
        const pose = poses.current[card.id] ??= { ...home, lift: 0, rotation: 0 }
        let x = home.x
        let y = home.y + (cameraMode || reduced || card.fixed || held ? 0 : Math.sin(time / 640 + card.id.length) * 2)
        let rotation = 0
        const lifted = held?.id === card.id
        if (lifted) {
          x = held.point.x
          y = held.point.y
          const target = cameraMode || reduced || masked ? undefined : getTarget(held.point, card.id)
          if (target) {
            const destination = layout.places[target.id]
            const answer = cardAnswer(card, target, latest.current.mode, latest.current.level.whitelist)
            const weight = (answer && !game.attempts.some(attempt => attempt.word.displayWord === answer.displayWord) ? .12 : -.07) * settings.magnet
            x = clamp(x + (destination.x - x) * weight, layout.cardWidth / 2, layout.width - layout.cardWidth / 2)
            y = clamp(y + (destination.y - y) * weight, layout.cardHeight / 2, layout.height - layout.cardHeight / 2)
          }
          rotation = reduced ? 0 : .075
        } else if (feedback?.kind === 'right' && (feedback.source === card.id || feedback.target === card.id)) {
          const target = layout.places[feedback.target]
          x = target.x
          y = target.y
        } else if (transition?.id === card.id && time - transition.start < duration && !reduced) {
          const progress = clamp((time - transition.start) / duration, 0, 1)
          if (feedback?.kind === 'wrong') {
            const repel = Math.sin(progress * Math.PI) * Math.exp(-progress * 2) * 22 * settings.magnet
            x += (transition.from.x - x) * (1 - progress) + (home.x < transition.target.x ? -repel : repel)
            y += (transition.from.y - y) * (1 - progress)
            rotation = Math.sin(progress * 6 * Math.PI) * .075 * (1 - progress)
            animating = true
          }
        }
        const lift = lifted ? 18 : 0
        const unsettled = Math.abs(x - pose.x) > .25 || Math.abs(y - pose.y) > .25 ||
          Math.abs(rotation - pose.rotation) > .003 || Math.abs(lift - pose.lift) > .25
        const directDrag = lifted && held.pointer === 'hand'
        const blend = reduced || directDrag || !unsettled ? 1 : 1 - Math.exp(-elapsed / (lifted ? 23 : 57))
        pose.x += (x - pose.x) * blend
        pose.y += (y - pose.y) * blend
        pose.rotation += (rotation - pose.rotation) * blend
        pose.lift += (lift - pose.lift) * blend
        animating ||= blend < 1
        const button = nodes.current[card.id]
        if (button) {
          const x = pose.x - (cameraMode ? home.x : layout.cardWidth / 2)
          const y = pose.y - (cameraMode ? home.y : layout.cardHeight / 2)
          const transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${pose.rotation.toFixed(4)}rad)`
          if (button.style.transform !== transform) button.style.transform = transform
        }
      }
      if (!cameraMode || animating) wake()
      else previous = 0
    }
    wakeAnimation.current = wake
    wake()
    return () => {
      cancelAnimationFrame(frame)
      wakeAnimation.current = () => {}
    }
  }, [cameraMode])

  function select(card: Card) {
    if (blocked || suppressClick.current) { suppressClick.current = false; return }
    if (selected && selected !== card.id && visible.some(item => item.id === selected)) {
      animation.current = { id: selected, target: layout.places[card.id], from: layout.places[card.id], start: performance.now() }
      commit(selected, card.id)
      setSelected(undefined)
    } else if (!card.fixed) setSelected(selected === card.id ? undefined : card.id)
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>, card: Card) {
    if (!event.isPrimary || event.button !== 0 || blocked || card.fixed) return
    begin(card, local({ x: event.clientX, y: event.clientY }), event.pointerId)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const dock = level.cards.find(card => card.fixed)
  const merged = game.feedback?.kind === 'right' ? game.feedback : undefined
  const particleCount = cameraMode || quality === 'low' ? 4 : quality === 'medium' ? 8 : 14
  return <div
    ref={surface} className="word-board" data-webgl={!cameraMode && webgl} data-camera={cameraMode} data-masked={masked}
    data-feedback={game.feedback?.kind ?? 'none'} data-testid="board"
    onKeyDown={event => { if (event.key === 'Escape' && selected) { event.stopPropagation(); setSelected(undefined) } }}
  >
    {dock && !cameraMode && <div className="board-dock" aria-hidden="true" style={{ left: layout.places[dock.id].x, top: layout.places[dock.id].y + 12, width: layout.cardWidth * 1.65, height: layout.cardHeight * 1.35 }} />}
    {!cameraMode && allow3d && <div className="scene-layer" aria-hidden="true"><Suspense fallback={null}>
      <SafeScene onError={() => { setAllow3d(false); setWebgl(false) }}>
        <Scene cards={visible} layout={layout} poses={poses} quality={quality} report={value => { setWebgl(value); if (!value) setAllow3d(false) }} />
      </SafeScene>
    </Suspense></div>}
    {visible.map(card => <button
      key={card.id} ref={node => { nodes.current[card.id] = node }} type="button"
      className="word-card" data-fixed={!!card.fixed} data-card-id={card.id} data-drag={holding === card.id}
      data-near={near?.id === card.id ? near.correct && !masked ? 'attract' : masked ? 'neutral' : 'repel' : undefined}
      data-error={game.feedback?.kind === 'wrong' && game.feedback.target === card.id}
      data-merge={merged?.source === card.id || merged?.target === card.id}
      aria-pressed={selected === card.id} aria-disabled={blocked} aria-label={card.text}
      style={{
        width: layout.cardWidth, height: layout.cardHeight,
        left: cameraMode ? layout.places[card.id].x - layout.cardWidth / 2 : 0,
        top: cameraMode ? layout.places[card.id].y - layout.cardHeight / 2 : 0,
        '--card-label-size': layout.cardHeight * .47 + 'px',
      } as React.CSSProperties}
      onPointerDown={event => handlePointerDown(event, card)}
      onPointerMove={event => move(local({ x: event.clientX, y: event.clientY }), event.pointerId)}
      onPointerUp={event => end(local({ x: event.clientX, y: event.clientY }), event.pointerId)}
      onPointerCancel={cancel} onLostPointerCapture={cancel} onClick={event => { if (event.detail === 0) suppressClick.current = false; select(card) }}
    >
      {card.fixed && <Magnet className="tile-icon" size={14} aria-hidden="true" />}{card.text}
    </button>)}
    {!masked && merged && <div className="merge-effect" aria-hidden="true" style={{ left: layout.places[merged.target].x, top: layout.places[merged.target].y, '--effects': settings.effects + 'ms' } as React.CSSProperties}>
      {!reduced && Array.from({ length: particleCount }, (_, index) =>
        <Plus size={15} key={index} style={{ '--bearing': `${index * 360 / particleCount}deg` } as React.CSSProperties} />)}
      <strong>{merged.word?.displayWord}</strong>
    </div>}
    <span ref={cursor} hidden className="hand-reticle hand-cursor" aria-hidden="true" />
  </div>
}

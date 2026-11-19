import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { cameraError, createMainRunner, createRunner, openStream, presets, type Quality, type Reading } from './camera'

export type CameraState = { status: 'off' | 'request' | 'loading' | 'ready' | 'paused' | 'error'; detail?: string }
export type Metrics = {
  camera: number; inference: number; render: number; latency: number; frame: number; dropped: number; skipped: number;
  backend: string; resolution: string; resolutionInput: string; quality: Quality;
}
export const emptyMetrics: Metrics = { camera: 0, inference: 0, render: 0, latency: 0, frame: 0, dropped: 0, skipped: 0, backend: '—', resolution: '—', resolutionInput: '—', quality: 'low' }

export function useCamera({ enabled, active, retry, quality, video, onReading, cancel, reportMetrics = true }: {
  enabled: boolean; active: boolean; retry: number; quality: Quality | 'auto';
  video: RefObject<HTMLVideoElement | null>; onReading: (reading: Reading) => void; cancel: () => void; reportMetrics?: boolean;
}) {
  const [state, setState] = useState<CameraState>({ status: 'off' })
  const [metrics, setMetrics] = useState(emptyMetrics)
  const callbacks = useRef({ onReading, cancel })
  useLayoutEffect(() => { callbacks.current = { onReading, cancel } })
  useEffect(() => {
    if (!enabled || !active) {
      setState({ status: enabled ? 'paused' : 'off' })
      return
    }
    const element = video.current!
    let dispose: (() => void) | undefined
    const safeCancel = () => callbacks.current.cancel()
    const visibility = () => {
      dispose?.()
      dispose = undefined
      if (document.hidden) { safeCancel(); setState({ status: 'paused' }); return }
      dispose = connect()
    }

    function connect() {
      const controller = new AbortController()
      const signal = controller.signal
      let stream: MediaStream | undefined
      let runtime: Awaited<ReturnType<typeof createRunner>> | undefined
      let handle = 0, renderHandle = 0, interval = 0, loadingTimer = 0
      let started = false, busy = false, fallback = false, stalled = false
      let lastMedia = -1, lastInference = -Infinity, lastDelivered = -Infinity, lastPresented = 0
      let lastFrameArrival = 0
      let current = quality === 'auto' ? (navigator.hardwareConcurrency <= 4 ? 'low' : 'medium') : quality
      let count = { camera: 0, inference: 0, render: 0, skipped: 0, dropped: 0, frame: 0, latency: 0 }
      let sampled = performance.now()
      let windows = 0
      const videoFrames = typeof element.requestVideoFrameCallback === 'function'

      const cleanup = () => {
        if (signal.aborted) return
        controller.abort()
        if (videoFrames) element.cancelVideoFrameCallback(handle)
        else cancelAnimationFrame(handle)
        cancelAnimationFrame(renderHandle)
        window.clearInterval(interval)
        window.clearTimeout(loadingTimer)
        runtime?.close()
        runtime = undefined
        stream?.getTracks().forEach(track => track.stop())
        element.pause()
        element.srcObject = null
        safeCancel()
      }
      const fail = (error: unknown) => {
        if (signal.aborted) return
        setState({ status: 'error', detail: cameraError(error, !!stream) })
        cleanup()
      }
      async function submit(now: number, width: number) {
        busy = true
        lastInference = now
        try {
          const reading = await runtime!.infer(element, now, width)
          if (signal.aborted || reading.time <= lastDelivered) return
          lastDelivered = reading.time
          const actionStart = performance.now()
          lastFrameArrival = actionStart
          stalled = false
          callbacks.current.onReading(reading)
          count.inference++
          count.frame += reading.duration
          count.latency += Math.max(0, actionStart - reading.time) + (performance.now() - actionStart)
        } catch (error) {
          if (signal.aborted) return
          if (!fallback && runtime?.backend !== 'Main thread · CPU') {
            const retryInWorker = runtime?.backend === 'Worker · GPU'
            fallback = true
            current = 'low'
            runtime?.close()
            runtime = undefined
            safeCancel()
            setState({ status: 'loading', detail: 'กำลังสลับไปใช้ CPU' })
            loadingTimer = window.setTimeout(() => fail(new Error('CPU initialization timed out')), 30000)
            try {
              runtime = await (retryInWorker ? createRunner(signal, 'low') : createMainRunner(signal, ['CPU']))
              window.clearTimeout(loadingTimer)
              if (!signal.aborted) setState({ status: 'ready' })
            } catch (cause) { fail(cause) }
          } else fail(error)
        } finally { busy = false }
      }
      function schedule() {
        if (signal.aborted) return
        handle = videoFrames
          ? element.requestVideoFrameCallback((now, meta) => onFrame(now, meta.mediaTime, meta.presentedFrames))
          : requestAnimationFrame(now => onFrame(now, element.currentTime))
      }
      function onFrame(now: number, mediaTime: number, presented?: number) {
        if (signal.aborted || !started) return
        schedule()
        if (mediaTime === lastMedia || !element.videoWidth || element.readyState < 2) return
        lastMedia = mediaTime
        count.camera++
        if (presented) {
          if (lastPresented) count.dropped += Math.max(0, presented - lastPresented - 1)
          lastPresented = presented
        }
        const preset = presets[current]
        if (busy || !runtime || now - lastInference < 1000 / preset.hz) { count.skipped++; return }
        void submit(now, Math.min(element.videoWidth, preset.width))
      }
      function onRender() { if (!signal.aborted) { count.render++; renderHandle = requestAnimationFrame(onRender) } }
      async function open() {
        setState({ status: 'request' })
        setMetrics(emptyMetrics)
        try {
          stream = await openStream(signal)
          if (signal.aborted) { stream.getTracks().forEach(track => track.stop()); return }
          stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => fail(new DOMException('Camera disconnected', 'TrackEnded')), { once: true }))
          element.srcObject = stream
          loadingTimer = window.setTimeout(() => fail(new Error('Camera initialization timed out')), 30000)
          await element.play()
          if (signal.aborted) return
          setState({ status: 'loading' })
          runtime = await createRunner(signal, current)
          window.clearTimeout(loadingTimer)
          if (signal.aborted) { runtime.close(); return }
          started = true
          setState({ status: 'ready' })
          sampled = performance.now()
          lastDelivered = sampled
          lastFrameArrival = sampled
          schedule()
          if (reportMetrics || quality === 'auto') renderHandle = requestAnimationFrame(onRender)
          interval = window.setInterval(() => {
            const now = performance.now()
            // Slow inference is not a frame in which the hand was absent.
            if (!stalled && now - lastFrameArrival > 1100) {
              stalled = true
              safeCancel()
            }
            if (now - sampled < 850) return
            const seconds = (now - sampled) / 1000
            const width = Math.min(element.videoWidth, presets[current].width)
            if (reportMetrics) setMetrics({
              camera: count.camera / seconds, inference: count.inference / seconds, render: count.render / seconds,
              latency: count.latency / Math.max(1, count.inference), frame: count.frame / Math.max(1, count.inference),
              dropped: count.dropped, skipped: count.skipped, backend: runtime?.backend ?? '—', resolution: `${element.videoWidth} × ${element.videoHeight}`,
              resolutionInput: `${width} × ${Math.round(width * element.videoHeight / Math.max(1, element.videoWidth))}`, quality: current,
            })
            if (quality === 'auto' && ++windows % 2 === 0 && count.render / seconds < 42 && current === 'medium') current = 'low'
            count = { camera: 0, inference: 0, render: 0, dropped: 0, skipped: 0, latency: 0, frame: 0 }
            sampled = now
          }, 200)
        } catch (error) { fail(error) }
      }
      void open()
      return cleanup
    }
    document.addEventListener('visibilitychange', visibility)
    visibility()
    return () => { document.removeEventListener('visibilitychange', visibility); dispose?.() }
  }, [active, enabled, quality, retry, video, reportMetrics])
  return { ...state, metrics }
}

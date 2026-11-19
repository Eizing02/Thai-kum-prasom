import type { HandLandmarkerResult } from '@mediapipe/tasks-vision'
import type { HandPose } from './gestures'
import visionModuleUrl from '../../node_modules/@mediapipe/tasks-vision/vision_bundle.mjs?url'

const wasmRoot = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm'
const modelUrl = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
type Delegate = 'GPU' | 'CPU'
export type Reading = { pose: HandPose | null; time: number; duration: number }
export type Quality = 'low' | 'medium' | 'high'
type Runner = {
  backend: string; infer: (video: HTMLVideoElement, time: number, width: number) => Promise<Reading>; close: () => void;
}
type WorkerResult = { type: 'ready'; delegate: Delegate } | { type: 'error'; message: string } | ({ type: 'pose' } & Reading)
export const presets = {
  low: { hz: 16, width: 384 }, medium: { hz: 24, width: 480 }, high: { hz: 30, width: 640 },
} satisfies Record<Quality, { hz: number; width: number }>

function aborted() { return new DOMException('Camera cancelled', 'AbortError') }

export async function openStream(signal: AbortSignal) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('insecure')
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
  })
  if (signal.aborted) { stream.getTracks().forEach(track => track.stop()); throw aborted() }
  return stream
}

function workerAvailable() {
  return 'Worker' in window && 'OffscreenCanvas' in window && 'createImageBitmap' in window
}

async function createWorker(signal: AbortSignal, preferGPU: boolean): Promise<Runner> {
  const worker = new Worker(new URL(import.meta.env.BASE_URL + 'hand-worker.js', location.origin))
  const stop = () => worker.terminate()
  signal.addEventListener('abort', stop, { once: true })
  let waitForPose: ((result: WorkerResult) => void) | undefined
  let rejectFrame: ((error: Error) => void) | undefined
  try {
    const delegate = await new Promise<Delegate>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Worker init timeout')), 14000)
      const abort = () => reject(aborted())
      signal.addEventListener('abort', abort, { once: true })
      const fail = (error: Error) => { clearTimeout(timeout); signal.removeEventListener('abort', abort); reject(error) }
      worker.onerror = error => fail(new Error(error.message))
      worker.onmessage = (event: MessageEvent<WorkerResult>) => {
        if (event.data.type === 'ready') {
          clearTimeout(timeout)
          signal.removeEventListener('abort', abort)
          resolve(event.data.delegate)
        } else if (event.data.type === 'error') fail(new Error(event.data.message))
      }
      worker.postMessage({ type: 'open', moduleUrl: new URL(visionModuleUrl, location.href).href, wasmRoot, modelUrl, delegate: preferGPU ? 'GPU' : 'CPU' })
    })
    if (signal.aborted) throw aborted()
    worker.onmessage = (event: MessageEvent<WorkerResult>) => waitForPose?.(event.data)
    worker.onerror = error => rejectFrame?.(new Error(error.message))
    return {
      backend: 'Worker · ' + delegate,
      async infer(video, time, width) {
        const frame = await createImageBitmap(video, {
          resizeWidth: width,
          resizeHeight: Math.max(1, Math.round(width * video.videoHeight / video.videoWidth)),
          resizeQuality: 'low',
        })
        if (signal.aborted) { frame.close(); throw aborted() }
        return new Promise((resolve, reject) => {
          const finish = () => {
            clearTimeout(timeout)
            signal.removeEventListener('abort', abort)
            waitForPose = undefined
            rejectFrame = undefined
          }
          const fail = (error: Error) => { finish(); reject(error) }
          const abort = () => fail(aborted())
          const timeout = setTimeout(() => fail(new Error('Worker frame timeout')), 2500)
          signal.addEventListener('abort', abort, { once: true })
          rejectFrame = fail
          waitForPose = result => {
            if (result.type === 'error') fail(new Error(result.message))
            else if (result.type === 'pose' && result.time === time) { finish(); resolve(result) }
          }
          try { worker.postMessage({ type: 'frame', frame, time }, [frame]) }
          catch (error) { frame.close(); fail(new Error(String(error))) }
        })
      },
      close() { signal.removeEventListener('abort', stop); stop() },
    }
  } catch (error) {
    signal.removeEventListener('abort', stop)
    stop()
    throw error
  }
}

export async function createMainRunner(signal: AbortSignal, delegates: Delegate[]): Promise<Runner> {
  const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision')
  const files = await FilesetResolver.forVisionTasks(wasmRoot)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { alpha: false })
  let error: unknown
  for (const delegate of delegates) {
    if (signal.aborted) throw aborted()
    try {
      const detector = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: modelUrl, delegate },
        runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: .53,
        minHandPresenceConfidence: .5, minTrackingConfidence: .5,
      })
      if (signal.aborted) { detector.close(); throw aborted() }
      return {
        backend: 'Main thread · ' + delegate,
        async infer(video, time, width) {
          const start = performance.now()
          if (context) {
            const height = Math.max(1, Math.round(width * video.videoHeight / video.videoWidth))
            if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
            context.drawImage(video, 0, 0, width, height)
          }
          const result = detector.detectForVideo(context ? canvas : video, time)
          return { pose: readPose(result, video.videoWidth / video.videoHeight), time, duration: performance.now() - start }
        },
        close() { detector.close(); canvas.width = 0; canvas.height = 0 },
      }
    } catch (cause) { error = cause }
  }
  throw error ?? new Error('โหลดตัวตรวจจับมือไม่สำเร็จ')
}

function supportsGpu() {
  const context = document.createElement('canvas').getContext('webgl2')
  context?.getExtension('WEBGL_lose_context')?.loseContext()
  return Boolean(context)
}

export async function createRunner(signal: AbortSignal, quality: Quality) {
  if (workerAvailable()) {
    try { return await createWorker(signal, quality === 'high' && supportsGpu()) }
    catch (error) { if (signal.aborted) throw error }
  }
  return createMainRunner(signal, quality !== 'low' && supportsGpu() ? ['GPU', 'CPU'] : ['CPU'])
}

function readPose(result: HandLandmarkerResult, aspect: number): HandPose | null {
  const label = result.handedness[0]?.[0]
  const points = result.landmarks[0]
  if (!points) return null
  const name = label?.categoryName
  return { landmarks: points.map(({ x, y }) => ({ x, y })), hand: name === 'Left' || name === 'Right' ? name : null, score: label?.score ?? 0, aspect }
}

export function cameraError(error: unknown, opened: boolean) {
  if (error instanceof Error && error.message === 'insecure') return 'กล้องต้องเปิดผ่าน HTTPS หรือ localhost'
  const name = error instanceof Error ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'ยังไม่ได้รับอนุญาตให้เปิดกล้อง ตรวจสิทธิ์กล้องในเบราว์เซอร์แล้วลองอีกครั้ง'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'ไม่พบกล้องที่ใช้งานได้ ลองเชื่อมต่อกล้องหรือใช้เมาส์'
  if (name === 'NotReadableError' || name === 'TrackEnded') return 'เปิดกล้องไม่ได้หรือกล้องถูกตัดการเชื่อมต่อ ลองปิดแอปอื่นที่ใช้กล้อง'
  return opened ? 'โหลดหรือประมวลผลโมเดลมือไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่ หรือเล่นด้วยเมาส์' : 'เปิดกล้องไม่สำเร็จ ลองอีกครั้งหรือเล่นด้วยเมาส์'
}

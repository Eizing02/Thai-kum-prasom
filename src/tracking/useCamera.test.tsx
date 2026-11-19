import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { createMainRunner, createRunner, openStream } from './camera'
import { useCamera } from './useCamera'

vi.mock('./camera', () => ({
  cameraError: () => 'error', createMainRunner: vi.fn(), createRunner: vi.fn(), openStream: vi.fn(),
  presets: { low: { width: 384, hz: 16 }, medium: { width: 480, hz: 24 }, high: { width: 640, hz: 30 } },
}))
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })

test('disposes tracks and model each time an active camera component unmounts', async () => {
  const track = Object.assign(new EventTarget(), { stop: vi.fn() })
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream
  const close = vi.fn()
  vi.mocked(openStream).mockResolvedValue(stream)
  vi.mocked(createRunner).mockResolvedValue({ backend: 'mock CPU', close, infer: vi.fn()  })
  for (let index = 0; index < 2; index++) {
    const element = document.createElement('video')
    element.play = vi.fn().mockResolvedValue(undefined)
    element.pause = vi.fn()
    const video = { current: element }
    const cancel = vi.fn()
    const hook = renderHook(() => useCamera({ enabled: true, active: true, retry: 0, video, quality: 'low', onReading: vi.fn(), cancel }))
    await waitFor(() => expect(hook.result.current.status).toBe('ready'))
    act(() => hook.unmount())
    expect(element.srcObject).toBeNull()
    expect(cancel).toHaveBeenCalledTimes(1)
  }
  expect(track.stop).toHaveBeenCalledTimes(2)
  expect(close).toHaveBeenCalledTimes(2)
})

test('stops a stream that resolves after the camera page is closed', async () => {
  const stop = vi.fn()
  const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream
  let resolve!: (stream: MediaStream) => void
  vi.mocked(openStream).mockReturnValue(new Promise(done => { resolve = done }))
  const element = document.createElement('video')
  element.pause = vi.fn()
  const video = { current: element }
  const hook = renderHook(() => useCamera({ enabled: true, active: true, retry: 0, video, quality: 'low', onReading: vi.fn(), cancel: vi.fn() }))
  hook.unmount()
  await act(async () => resolve(stream))
  expect(stop).toHaveBeenCalledOnce()
  expect(createRunner).not.toHaveBeenCalled()
})

test('a failed GPU Worker retries with a lower-resolution CPU Worker', async () => {
  const track = Object.assign(new EventTarget(), { stop: vi.fn() })
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream
  vi.mocked(openStream).mockResolvedValue(stream)
  const gpu = { backend: 'Worker · GPU', infer: vi.fn().mockRejectedValue(new Error('GPU timeout')), close: vi.fn() }
  const cpu = { backend: 'Worker · CPU', infer: vi.fn(), close: vi.fn() }
  vi.mocked(createRunner).mockResolvedValueOnce(gpu).mockResolvedValueOnce(cpu)
  const element = document.createElement('video')
  element.play = vi.fn().mockResolvedValue(undefined)
  element.pause = vi.fn()
  let callback: VideoFrameRequestCallback | undefined
  Object.defineProperties(element, {
    videoWidth: { value: 640 },
    readyState: { value: 2 },
    requestVideoFrameCallback: { value: (next: VideoFrameRequestCallback) => { callback = next; return 1 } },
    cancelVideoFrameCallback: { value: vi.fn() },
  })
  const value = { current: element }
  const cancel = vi.fn()
  const hook = renderHook(() => useCamera({
    enabled: true, active: true, retry: 0, quality: 'high', video: value, onReading: vi.fn(), cancel, reportMetrics: false,
  }))
  await waitFor(() => expect(hook.result.current.status).toBe('ready'))
  await act(async () => callback!(performance.now() + 40, { mediaTime: 1, presentedFrames: 1 } as VideoFrameCallbackMetadata))
  expect(gpu.infer).toHaveBeenCalledOnce()
  expect(gpu.close).toHaveBeenCalledOnce()
  expect(createRunner).toHaveBeenNthCalledWith(2, expect.any(AbortSignal), 'low')
  expect(createMainRunner).not.toHaveBeenCalled()
  expect(hook.result.current.status).toBe('ready')
  expect(cancel).toHaveBeenCalledOnce()
})

test.each(['repeated timestamp', 'missing frame callback'])('processes live video with a %s', async condition => {
  const track = Object.assign(new EventTarget(), { stop: vi.fn() })
  vi.mocked(openStream).mockResolvedValue({ getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream)
  const infer = vi.fn(async (_video: HTMLVideoElement, time: number) => ({ pose: null, time, duration: 1 }))
  vi.mocked(createRunner).mockResolvedValue({ backend: 'Worker · CPU', close: vi.fn(), infer })
  const element = document.createElement('video')
  element.play = vi.fn().mockResolvedValue(undefined)
  element.pause = vi.fn()
  let callback: VideoFrameRequestCallback | undefined
  let animation: FrameRequestCallback | undefined
  const cancelFrame = vi.fn()
  vi.stubGlobal('requestAnimationFrame', (next: FrameRequestCallback) => { animation = next; return 2 })
  Object.defineProperties(element, {
    videoWidth: { value: 480 }, readyState: { value: 2 },
    requestVideoFrameCallback: { value: (next: VideoFrameRequestCallback) => { callback = next; return 1 } },
    cancelVideoFrameCallback: { value: cancelFrame },
  })
  const video = { current: element }
  const onReading = vi.fn()
  const hook = renderHook(() => useCamera({ enabled: true, active: true, retry: 0, video, quality: 'low', onReading, cancel: vi.fn(), reportMetrics: false }))
  await waitFor(() => expect(hook.result.current.status).toBe('ready'))

  if (condition === 'repeated timestamp') {
    const time = performance.now()
    for (let index = 1; index <= 2; index++) {
      await act(async () => callback!(time + index * 80, { mediaTime: 0, presentedFrames: index } as VideoFrameCallbackMetadata))
    }
    expect(cancelFrame).not.toHaveBeenCalled()
  } else {
    await waitFor(() => expect(cancelFrame).toHaveBeenCalledWith(1), { timeout: 1600 })
    const time = performance.now()
    for (let index = 1; index <= 2; index++) {
      element.currentTime = index / 30
      await act(async () => animation!(time + index * 80))
    }
  }
  expect(onReading.mock.calls.length).toBeGreaterThanOrEqual(2)
  hook.unmount()
})

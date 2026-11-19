let detector
let last = -1

self.onmessage = async ({ data }) => {
  if (data.type === 'open') {
    try {
      const api = await import(data.moduleUrl)
      const { FilesetResolver, HandLandmarker } = api
      const files = await FilesetResolver.forVisionTasks(data.wasmRoot)
      const options = {
        runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: .53,
        minHandPresenceConfidence: .5, minTrackingConfidence: .5,
      }
      let delegate = data.delegate
      try {
        detector = await HandLandmarker.createFromOptions(files, { ...options, baseOptions: { modelAssetPath: data.modelUrl, delegate } })
      } catch (error) {
        if (delegate !== 'GPU') throw error
        delegate = 'CPU'
        detector = await HandLandmarker.createFromOptions(files, { ...options, baseOptions: { modelAssetPath: data.modelUrl, delegate } })
      }
      self.postMessage({ type: 'ready', delegate })
    } catch (error) {
      self.postMessage({ type: 'error', message: String(error) })
    }
  }
  if (data.type === 'frame') {
    const { frame, time } = data
    try {
      if (!detector || time <= last) throw new Error('Stale input frame')
      last = time
      const start = performance.now()
      const result = detector.detectForVideo(frame, time)
      const label = result.handedness[0]?.[0]
      const points = result.landmarks[0]
      const pose = points ? {
        landmarks: points.map(({ x, y }) => ({ x, y })),
        hand: label?.categoryName ?? null, score: label?.score ?? 0, aspect: frame.width / frame.height,
      } : null
      self.postMessage({ type: 'pose', time, pose, duration: performance.now() - start })
    } catch (error) {
      self.postMessage({ type: 'error', message: String(error) })
    } finally { frame.close() }
  }
}

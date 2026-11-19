import { expect, test } from '@playwright/test'

test('camera play keeps the cursor on the card and commits the target at the start of release', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 480
    const context = canvas.getContext('2d')!
    let frames = 0
    const draw = () => {
      context.fillStyle = ++frames % 2 ? 'black' : 'white'
      context.fillRect(0, 0, 640, 480)
      requestAnimationFrame(draw)
    }
    draw()
    navigator.mediaDevices.getUserMedia = async () => canvas.captureStream(30)
    Object.defineProperty(window, 'OffscreenCanvas', { value: class {} })
  })
  await page.route('**/hand-worker.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    const poses = new BroadcastChannel('test-hand-poses')
    let pose = null
    let delay = 0
    poses.onmessage = event => {
      if (typeof event.data === 'number') delay = event.data
      else pose = event.data
    }
    self.onmessage = ({ data }) => {
      if (data.type === 'open') {
        if (data.delegate !== 'CPU') throw Error('Calibration and gameplay need the stable CPU Worker')
        self.postMessage({ type: 'ready', delegate: 'CPU' })
      }
      if (data.type === 'frame') {
        data.frame.close()
        const nextPose = Array.isArray(pose) ? (pose.length > 1 ? pose.shift() : pose[0]) : pose
        const response = { type: 'pose', pose: nextPose, time: data.time, duration: 1 }
        setTimeout(() => self.postMessage(response), delay)
        delay = 0
      }
    }
  ` }))
  await page.goto('/settings')
  await page.getByLabel('คุณภาพกราฟิก').selectOption('high')
  await page.locator('.brand').click()
  await page.getByRole('button', { name: 'เริ่มเล่น' }).click()
  await page.getByRole('radio', { name: 'กล้อง' }).check()
  await page.getByRole('button', { name: 'ไปหน้าปรับเทียบกล้อง' }).click()
  await page.getByRole('button', { name: 'อนุญาตและเปิดกล้อง' }).click()
  await page.getByRole('button', { name: 'เข้าสนามพร้อมกล้อง' }).click()
  await expect(page.getByText('กล้องพร้อม', { exact: true })).toBeVisible()
  const stage = page.getByTestId('board')
  await expect(stage).toHaveAttribute('data-webgl', 'false')
  await expect(page.locator('.scene-layer canvas')).toHaveCount(0)
  await expect(page.locator('video')).toBeVisible()
  const videoRect = await page.locator('video').evaluate(element => {
    const video = element as HTMLVideoElement
    const bounds = video.getBoundingClientRect()
    return { displayed: bounds.width / bounds.height, source: video.videoWidth / video.videoHeight }
  })
  expect(videoRect.displayed).toBeCloseTo(videoRect.source, 2)
  expect((await page.locator('.camera-stage').boundingBox())!.width).toBe(page.viewportSize()!.width)
  const target = stage.locator('[data-fixed=true]')
  const id = await target.getAttribute('data-card-id')
  const source = stage.locator(`[data-card-id="${id?.replace(/-0$/, '-1')}"]`)
  const area = (await stage.boundingBox())!
  function poseAt(box: NonNullable<Awaited<ReturnType<typeof target.boundingBox>>>, closed: boolean) {
    const x = 1 - (box.x + box.width / 2 - area.x) / area.width
    const y = (box.y + box.height / 2 - area.y) / area.height
    const landmarks = Array.from({ length: 21 }, () => ({ x, y }))
    landmarks[4] = { x, y: y + (closed ? .016 : .11) }
    landmarks[5] = { x: x - .07, y: y + .10 }
    landmarks[17] = { x: x + .07, y: y + .10 }
    return { landmarks, hand: 'Right', score: 1, aspect: 1.333 }
  }
  async function sendPose(value: ReturnType<typeof poseAt> | ReturnType<typeof poseAt>[]) {
    await page.evaluate(value => {
      const sender = new BroadcastChannel('test-hand-poses')
      sender.postMessage(value)
      sender.close()
    }, value)
  }
  const sourceBox = (await source.boundingBox())!
  const from = { ...sourceBox, x: sourceBox.x + sourceBox.width * .36 }
  const to = (await target.boundingBox())!
  await sendPose(poseAt(from, false))
  const reticle = stage.locator('.hand-cursor')
  await expect(reticle).toBeVisible()
  await expect(reticle).toHaveCSS('filter', 'none')
  await expect(reticle.locator('svg')).toHaveCount(0)
  await sendPose(poseAt(from, true))
  await expect(source).toHaveAttribute('data-drag', 'true')
  await page.evaluate(() => {
    const channel = new BroadcastChannel('test-hand-poses')
    channel.postMessage(700)
    channel.close()
  })
  await page.waitForTimeout(550)
  await expect(source).toHaveAttribute('data-drag', 'true')
  await stage.evaluate(board => {
    const cursor = board.querySelector('.hand-cursor')!
    const heldCard = board.querySelector('.word-card[data-drag=true]')!
    const previous = cursor.getBoundingClientRect()
    const observer = new MutationObserver(() => {
      const current = cursor.getBoundingClientRect()
      if (Math.hypot(current.x - previous.x, current.y - previous.y) < 15) return
      const card = heldCard.getBoundingClientRect()
      board.setAttribute('data-measured-drag-gap', String(Math.hypot(
        current.x + current.width / 2 - card.x - card.width / 2,
        current.y + current.height / 2 - card.y - card.height / 2,
      )))
      observer.disconnect()
    })
    observer.observe(cursor, { attributeFilter: ['style'] })
  })
  await sendPose(poseAt(to, true))
  await expect.poll(async () => Number(await stage.getAttribute('data-measured-drag-gap') ?? Infinity)).toBeLessThan(1)
  await expect(target).toHaveAttribute('data-near', 'attract')
  await expect.poll(async () => {
    const dragged = (await source.boundingBox())!
    return Math.hypot(dragged.x + dragged.width / 2 - to.x - to.width / 2, dragged.y + dragged.height / 2 - to.y - to.height / 2)
  }).toBeLessThan(5)
  const away = { x: area.x + area.width * .08, y: area.y + area.height * .12, width: 0, height: 0 }
  await sendPose([poseAt(to, false), poseAt(away, false)])
  await expect(page.getByRole('dialog').getByText('เหตุผล')).toBeVisible()
  await expect(page.locator('.game-score')).toHaveText('100 แต้ม')
  await page.getByRole('button', { name: 'ถัดไป' }).click()
  const decoy = stage.locator('[data-card-id="decoy-0"]')
  await expect(decoy).toBeVisible()
  const wrongSource = (await decoy.boundingBox())!
  const nextTarget = (await target.boundingBox())!
  await sendPose(poseAt(wrongSource, false))
  await expect.poll(async () => {
    const cursor = await stage.locator('.hand-cursor').boundingBox()
    if (!cursor) return Infinity
    return Math.hypot(cursor.x + cursor.width / 2 - wrongSource.x - wrongSource.width / 2, cursor.y + cursor.height / 2 - wrongSource.y - wrongSource.height / 2)
  }).toBeLessThan(10)
  await sendPose(poseAt(wrongSource, true))
  await expect(decoy).toHaveAttribute('data-drag', 'true')
  await sendPose(poseAt(nextTarget, true))
  await expect(target).toHaveAttribute('data-near', 'repel')
  await sendPose(poseAt(nextTarget, false))
  await expect(stage).toHaveAttribute('data-feedback', 'wrong')
  await expect(stage).toHaveAttribute('data-feedback', 'none')
  await expect(page.locator('.game-score')).toHaveText('100 แต้ม')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(async () => (await page.locator('.camera-stage').boundingBox())!.width).toBe(390)
  await expect.poll(() => page.locator('video').evaluate(video => {
    const rect = video.getBoundingClientRect()
    return Math.round(rect.height * 4 / 3)
  })).toBe(390)
  await expect(page.locator('.site-header')).toBeHidden()
  const phoneBoard = (await stage.boundingBox())!
  for (const card of await stage.locator('.word-card').all()) {
    const rect = (await card.boundingBox())!
    expect(rect.x).toBeGreaterThanOrEqual(phoneBoard.x)
    expect(rect.x + rect.width).toBeLessThanOrEqual(phoneBoard.x + phoneBoard.width)
    expect(rect.y).toBeGreaterThanOrEqual(phoneBoard.y)
    expect(rect.y + rect.height).toBeLessThanOrEqual(phoneBoard.y + phoneBoard.height)
  }
  await page.getByRole('button', { name: 'พักเกม' }).click()
  await expect.poll(() => page.locator('video').evaluate(video => (video as HTMLVideoElement).srcObject)).toBeNull()
  await page.getByRole('button', { name: 'เล่นต่อ' }).click()
  await expect(page.getByText('กล้องพร้อม', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'ปิดกล้อง' }).click()
  await expect(page.locator('video')).toHaveCount(0)
  await expect(page.getByText('ด่าน 2 จาก 5', { exact: false })).toBeVisible()
})

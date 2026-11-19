import { expect, test } from '@playwright/test'

test('camera denial allows the player to enter the same game with a mouse', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied in test', 'NotAllowedError') }
  })
  await page.goto('/setup')
  await page.getByRole('radio', { name: 'กล้อง' }).check()
  await page.getByRole('button', { name: 'ไปหน้าปรับเทียบกล้อง' }).click()
  await expect(page).toHaveURL(/calibration$/)
  await expect(page.getByText('ปิดกล้อง', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'อนุญาตและเปิดกล้อง' }).click()
  await expect(page.getByRole('alert')).toHaveText(/ยังไม่ได้รับอนุญาต/)
  await page.getByRole('button', { name: 'เล่นด้วยเมาส์' }).click()
  const target = page.locator('[data-fixed=true]')
  const id = await target.getAttribute('data-card-id')
  await page.locator(`[data-card-id="${id?.replace(/-0$/, '-1')}"]`).dragTo(target)
  await expect(page.getByRole('dialog').getByText('เหตุผล')).toBeVisible()
})

test('diagnostics simulate a full pinch, move and release without requesting camera access', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new Error('Simulation must not ask for a camera') }
  })
  await page.goto('/diagnostics')
  await page.getByRole('button', { name: 'จำลองท่าบีบ' }).click()
  const stage = page.getByLabel('พื้นที่ทดลองหยิบลูกบาศก์')
  await stage.evaluate(element => element.scrollIntoView({ block: 'center' }))
  const rect = (await stage.locator('.camera-frame').boundingBox())!
  await page.mouse.move(rect.x + .33 * rect.width, rect.y + .58 * rect.height)
  await expect(page.getByText(/เหนือการ์ด ·/)).toBeVisible()
  await page.mouse.down()
  await page.mouse.up()
  await expect(page.locator('.practice-cube')).toHaveAttribute('data-grabbed', 'true')
  await page.mouse.move(rect.x + .72 * rect.width, rect.y + .42 * rect.height, { steps: 12 })
  await expect.poll(async () => {
    const cube = (await page.locator('.practice-cube').boundingBox())!
    return Math.abs((cube.x + cube.width / 2 - rect.x) / rect.width - .72)
  }).toBeLessThan(.05)
  await page.mouse.down()
  await page.mouse.up()
  await expect(page.getByText('วางลูกบาศก์สำเร็จ')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

for (const fallback of [false, true]) {
  test(`real model receives frames in ${fallback ? 'main-thread CPU fallback' : 'worker'} with fake video input`, async ({ baseURL }) => {
    test.skip(!process.env.TWM_TEST_MODEL, 'Enable the network-dependent MediaPipe integration check with TWM_TEST_MODEL=1')
    test.setTimeout(65000)
    const { chromium } = await import('@playwright/test')
    const fakeBrowser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', ...(fallback ? ['--disable-webgl'] : [])] })
    try {
      const page = await fakeBrowser.newPage({ baseURL, ignoreHTTPSErrors: true, permissions: ['camera'] })
      if (fallback) await page.route('**/hand-worker.js', route => route.abort())
      await page.goto('/diagnostics')
      await page.getByRole('button', { name: 'อนุญาตและเปิดกล้อง' }).click()
      await expect(page.getByText(fallback ? 'Main thread · CPU' : 'Worker · CPU', { exact: true })).toBeVisible({ timeout: 50000 })
      await expect(page.getByText('640 × 480', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'ปิดกล้อง', exact: true }).click()
      await expect.poll(() => page.locator('video').evaluate(video => (video as HTMLVideoElement).srcObject)).toBeNull()

    } finally { await fakeBrowser.close() }
  })
}

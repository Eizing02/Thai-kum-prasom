import { expect, test } from '@playwright/test'

test('mobile supports touch dragging and result at 360 CSS pixels', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  const page = await context.newPage()
  try {
    await page.goto('/teacher')
    await page.getByLabel('ค้นหาคำ').fill('รถไฟ')
    await page.getByRole('button', { name: 'ดูตัวอย่าง รถไฟ', exact: true }).tap()
    const board = page.getByTestId('board')
    const source = board.getByRole('button', { name: 'ไฟ', exact: true })
    const target = board.getByRole('button', { name: 'รถ', exact: true })
    await expect(source).toBeVisible()
    const from = (await source.boundingBox())!
    const to = (await target.boundingBox())!
    const cdp = await context.newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x + from.width / 2, y: from.y + from.height / 2 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: to.x + to.width / 2, y: to.y + to.height / 2 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    const popup = page.getByRole('dialog', { name: 'รถไฟ' })
    await popup.getByRole('button', { name: 'ถัดไป' }).tap()
    await expect(page.getByRole('heading', { name: 'คลังคำสำหรับครู' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally { await context.close() }
})

test('all entry pages fit narrow, tablet, and desktop viewports', async ({ page }) => {
  for (const width of [320, 600, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const path of ['/', '/setup', '/help', '/calibration', '/teacher', '/diagnostics', '/settings', '/result']) {
      await page.goto(path)
      await expect(page.locator('main h1')).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path + ' width ' + width).toBe(true)
    }
  }
})

test('pause, mute and keyboard controls work in test mode without showing definitions in the board', async ({ page }) => {
  await page.goto('/setup')
  await page.getByRole('radio', { name: 'ทดสอบ' }).check()
  await page.getByRole('button', { name: 'เข้าสนาม' }).click()
  await page.getByRole('button', { name: 'ปิดเสียง' }).click()
  await expect(page.getByRole('button', { name: 'เปิดเสียง' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'คำใบ้' })).toHaveCount(0)
  await page.getByRole('button', { name: 'พักเกม' }).click()
  await page.getByRole('button', { name: 'เล่นต่อ' }).click()
  const fixed = page.locator('[data-fixed=true]')
  const target = await fixed.getAttribute('data-card-id')
  await page.locator(`[data-card-id="${target?.replace(/-0$/, '-1')}"]`).press('Enter')
  await fixed.press('Enter')
  await expect(page.getByText('ด่าน 2 จาก 10', { exact: false })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('the game brand links home and the about page shows the credited creator', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 })
  await page.goto('/')
  await expect(page).toHaveTitle(/เกมคำชนคำ/)
  await expect(page.getByRole('heading', { level: 1, name: /เกม\s*คำชนคำ/ })).toBeVisible()
  const brand = page.getByRole('link', { name: 'เกมคำชนคำ กลับหน้าแรก' })
  await expect.poll(() => brand.locator('img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)

  await page.getByRole('link', { name: 'เกี่ยวกับ', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'เกี่ยวกับเกมคำชนคำ' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'ครูจันทร์เพ็ญ สังข์วงค์' })).toBeVisible()
  await expect(page.getByText('สาขาวิชาภาษาไทย มหาวิทยาลัยราชภัฏเลย')).toBeVisible()
  await page.reload()
  await expect.poll(() => page.getByRole('img', { name: /ครูแจน/ }).evaluate(img => (img as HTMLImageElement).naturalWidth)).toBe(720)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await brand.click()
  await expect(page).toHaveURL(/\/$/)
})

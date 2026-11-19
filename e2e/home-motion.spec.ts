import { expect, test } from '@playwright/test'

test('the homepage rotates examples every ten seconds, pauses, and lets the player start', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.clock.install()
  await page.goto('/')
  const stage = page.locator('.lab-art')
  const caption = stage.locator('figcaption')
  await expect(caption).toContainText('รถ + ไฟ → รถไฟ')
  const height = (await stage.boundingBox())!.height
  const yellow = await stage.locator('.tile-one').evaluate(tile => getComputedStyle(tile).backgroundImage)

  await page.clock.runFor(9_000)
  await expect(caption).toContainText('คำประสม')
  await page.clock.runFor(2_000)
  await expect(caption).toContainText('ใหญ่ + โต → ใหญ่โต')
  await expect(page.locator('.home-copy [data-current=true]')).toHaveText('คำซ้อน')
  expect(await stage.locator('.tile-one').evaluate(tile => getComputedStyle(tile).backgroundImage)).not.toBe(yellow)
  expect((await stage.boundingBox())!.height).toBe(height)

  await page.getByRole('button', { name: 'พักการสลับตัวอย่าง' }).click()
  await page.clock.runFor(21_000)
  await expect(stage).toHaveAttribute('data-turn', 'still')
  await expect(caption).toContainText('ใหญ่ + โต → ใหญ่โต')
  await page.getByRole('button', { name: 'เล่นตัวอย่างต่อ' }).press('Enter')
  await page.clock.runFor(11_000)
  await expect(caption).toContainText('รถ + ไฟ → รถไฟ')
  await page.clock.runFor(8_950)
  await expect(stage).toHaveAttribute('data-turn', 'close')
  await page.getByRole('button', { name: 'เริ่มเล่น' }).click()
  await expect(page).toHaveURL(/\/setup$/)
})

test('reduced motion provides a manual example switch that fits a 320-pixel display', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install()
  await page.goto('/')
  const stage = page.locator('.lab-art')
  await page.clock.runFor(21_000)
  await expect(stage.locator('figcaption')).toContainText('รถ + ไฟ → รถไฟ')
  await page.getByRole('button', { name: 'สลับตัวอย่าง' }).press('Enter')
  await expect(stage.locator('figcaption')).toContainText('ใหญ่ + โต → ใหญ่โต')
  await expect(stage).toHaveAttribute('data-turn', 'still')
  await expect(stage.locator('.tile-one')).toHaveCSS('animation-name', 'none')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('the examples wait offscreen and in a hidden tab, then resume', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 310 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.clock.install()
  await page.goto('/')
  const stage = page.locator('.lab-art')
  await page.clock.runFor(21_000)
  await expect(stage).toHaveAttribute('data-example', '0')
  await stage.scrollIntoViewIfNeeded()
  await stage.evaluate(element => new Promise<void>(resolve => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.intersectionRatio >= .25) { observer.disconnect(); resolve() }
    }, { threshold: .25 })
    observer.observe(element)
  }))
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.clock.runFor(21_000)
  await expect(stage).toHaveAttribute('data-example', '0')
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    document.dispatchEvent(new Event('visibilitychange'))
    // Let the resumed effect arm its interval before advancing the virtual clock.
    return new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })
  await page.clock.runFor(11_000)
  await expect(stage).toHaveAttribute('data-example', '1')
})

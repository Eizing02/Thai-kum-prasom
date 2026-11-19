import { expect, test } from '@playwright/test'

test('plays an entire mouse session with repulsion, merge, explanations and CSV', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'เริ่มเล่น' }).click()
  await page.getByRole('button', { name: 'เข้าสนาม' }).click()
  await expect(page).toHaveURL(/\/play$/)
  const fixed = page.locator('[data-fixed=true]')
  const board = page.getByTestId('board')
  await board.evaluate(element => {
    const observer = new MutationObserver(() => {
      if (element.getAttribute('data-feedback') === 'wrong') {
        element.setAttribute('data-observed-wrong', 'true')
        observer.disconnect()
      }
    })
    observer.observe(element, { attributes: true, attributeFilter: ['data-feedback'] })
  })
  await page.locator('[data-card-id="decoy-0"]').dragTo(fixed)
  await expect(board).toHaveAttribute('data-observed-wrong', 'true')
  await expect(board).toHaveAttribute('data-feedback', 'none')
  for (let round = 1; round <= 5; round++) {
    await expect(page.getByText(`ด่าน ${round} จาก 5`, { exact: false })).toBeVisible()
    const target = await fixed.getAttribute('data-card-id')
    await page.locator(`[data-card-id="${target?.replace(/-0$/, '-1')}"]`).dragTo(fixed)
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('ความหมาย')).toBeVisible()
    await expect(dialog.getByText('ประโยคตัวอย่าง')).toBeVisible()
    await dialog.getByRole('button', { name: 'ถัดไป' }).click()
  }
  await expect(page.getByRole('heading', { name: 'สรุปผลการเล่น' })).toBeVisible()
  await expect(page.getByText('490', { exact: true })).toBeVisible()
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'ดาวน์โหลด CSV' }).click()])
  expect(file.suggestedFilename()).toBe('thai-word-magnet.csv')
  expect(errors).toEqual([])
})

test('plays teacher previews by keyboard and reads each word at its category speed', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: class { constructor(readonly text: string) {} },
    })
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        getVoices: () => [{ lang: 'th-TH', localService: true }],
        cancel: () => {},
        speak(message: SpeechSynthesisUtterance) {
          document.documentElement.dataset.spoken = JSON.stringify({ text: message.text, rate: message.rate, lang: message.lang })
        },
      },
    })
  })
  for (const [word, first, second, label, rate] of [
    ['รถไฟ', 'รถ', 'ไฟ', 'คำประสม', 0.8],
    ['ใหญ่โต', 'ใหญ่', 'โต', 'คำซ้อนเพื่อความหมาย · ใกล้เคียง', 0.45],
    ['งอแง', 'งอ', 'แง', 'คำซ้อนเพื่อเสียง', 0.45],
  ] as const) {
    await page.goto('/teacher')
    await page.getByRole('button', { name: 'ดูตัวอย่าง ' + word, exact: true }).click()
    await page.getByRole('button', { name: second, exact: true }).press('Enter')
    await page.getByRole('button', { name: first, exact: true }).press('Enter')
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(label, { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'อ่านออกเสียง' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-spoken', JSON.stringify({ text: word, rate, lang: 'th-TH' }))
  }
})

test('teacher rejects invalid JSON and imports a validated round-trip without losing data', async ({ page }) => {
  await page.goto('/teacher')
  await expect(page.getByText('30 รายการ · พร้อมเล่น 30 รายการ')).toBeVisible()
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'ส่งออก JSON' }).click()])
  const input = page.locator('input[type=file]')
  await input.setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('[{"id":"incomplete"}]') })
  await expect(page.getByRole('alert')).toBeVisible()
  await input.setInputFiles((await file.path())!)
  await page.getByRole('button', { name: 'ยืนยัน' }).click()
  await expect(page.getByText('อัปเดตคลังคำแล้ว')).toBeVisible()
  await page.reload()
  await expect(page.getByText('30 รายการ · พร้อมเล่น 30 รายการ')).toBeVisible()
})

test('webgl scene draws a canvas or retains the playable fallback', async ({ page }) => {
  await page.goto('/teacher')
  await page.getByRole('button', { name: 'ดูตัวอย่าง รถไฟ', exact: true }).click()
  const board = page.getByTestId('board')
  await expect(board.getByRole('button', { name: 'รถ', exact: true })).toBeVisible()
  const webgl = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))
  if (webgl) await expect(board).toHaveAttribute('data-webgl', 'true')
  await board.getByRole('button', { name: 'ไฟ', exact: true }).dragTo(board.getByRole('button', { name: 'รถ', exact: true }))
  await expect(page.getByRole('dialog', { name: 'รถไฟ' })).toBeVisible()
})

test('teacher can add a pending word, preview it, approve it, and delete it', async ({ page }) => {
  await page.goto('/teacher')
  await page.getByRole('button', { name: 'เพิ่มคำ' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('ส่วนที่ 1').fill('สวน')
  await dialog.getByLabel('ส่วนที่ 2').fill('สัตว์')
  await dialog.getByLabel('ความหมาย', { exact: true }).fill('สถานที่จัดแสดงสัตว์ชนิดต่าง ๆ')
  await dialog.getByLabel('เหตุผล', { exact: true }).fill('สวนกับสัตว์ใช้เรียกสถานที่จัดแสดงสัตว์')
  await dialog.getByLabel('ประโยคตัวอย่าง').fill('ฉันไปสวนสัตว์กับครอบครัว')
  await dialog.getByLabel('คำใบ้').fill('สถานที่ที่ไปชมสัตว์ได้')
  await dialog.getByRole('button', { name: 'บันทึกคำ' }).click()
  await page.getByLabel('ค้นหาคำ').fill('สวนสัตว์')
  await expect(page.getByText('รอตรวจทาน', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'ดูตัวอย่าง สวนสัตว์' }).click()
  await expect(page.getByText('ตัวอย่างโจทย์', { exact: false })).toBeVisible()
  await expect(page.getByTestId('board').getByRole('button', { name: 'สวน', exact: true })).toBeVisible()
  await page.goto('/teacher')
  await page.getByLabel('ค้นหาคำ').fill('สวนสัตว์')
  await page.getByRole('button', { name: 'แก้ไข สวนสัตว์' }).click()
  await dialog.getByRole('checkbox', { name: 'อนุมัติให้ใช้ในเกม' }).check()
  await dialog.getByRole('button', { name: 'บันทึกคำ' }).click()
  await expect(page.getByText('พร้อมเล่น', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'ลบ สวนสัตว์' }).click()
  await dialog.getByRole('button', { name: 'ยืนยัน' }).click()
  await expect(page.getByText('ไม่พบคำในรายการนี้')).toBeVisible()
})

test('the whole-game timer ends the test and adds unanswered words to review', async ({ page }) => {
  await page.goto('/setup')
  await page.getByRole('radio', { name: 'ทดสอบ' }).check()
  await page.getByLabel('จับเวลา').selectOption('game')
  await page.getByLabel('เวลา (วินาที)').fill('10')
  await page.getByRole('button', { name: 'เข้าสนาม' }).click()
  await expect(page.getByRole('heading', { name: 'สรุปผลการเล่น' })).toBeVisible({ timeout: 15000 })
  await expect(page.locator('.review-list details')).toHaveCount(5)
})

import { copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

// GitHub Pages serves directories as static pages, including on a direct request.
const routes = ['about', 'help', 'setup', 'play', 'result', 'teacher', 'calibration', 'diagnostics', 'settings']
const dist = 'dist'
const entry = join(dist, 'index.html')

await Promise.all(routes.map(async route => {
  const directory = join(dist, route)
  await mkdir(directory, { recursive: true })
  await copyFile(entry, join(directory, 'index.html'))
}))
await copyFile(entry, join(dist, '404.html'))

import type { Card } from './engine'

export type Point = { x: number; y: number }
export type Size = { width: number; height: number }
export type BoardLayout = { width: number; height: number; cardWidth: number; cardHeight: number; places: Record<string, Point> }
export type VisualCard = Point & { lift: number; rotation: number }
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function layoutCards(cards: Card[], { width, height }: Size): BoardLayout {
  const easy = cards.some(card => card.fixed)
  const columns = easy ? Math.max(1, cards.length - 1) : width >= 520 ? 4 : width >= 300 && height < 360 ? 3 : 2
  const spread = easy ? .83 : .87
  const rows = Math.max(1, Math.ceil(cards.length / columns))
  const rowGap = height * (easy ? .38 : .82 / rows)
  const cardWidth = Math.max(1, Math.min(156, width * spread / columns - 13))
  const cardHeight = Math.max(1, Math.min(92, Math.max(52, cardWidth * .66), rowGap - 10))
  const places: Record<string, Point> = {}
  for (const [index, card] of cards.entries()) {
    if (easy) {
      places[card.id] = card.fixed
        ? { x: width / 2, y: height * .38 }
        : { x: width * (.5 + (index - 1 - (columns - 1) / 2) * (spread / columns)), y: height * .76 }
    } else {
      const row = Math.floor(index / columns)
      const columnsHere = Math.min(columns, cards.length - row * columns)
      places[card.id] = {
        x: width * (.5 + (index % columns - (columnsHere - 1) / 2) * (spread / columns)),
        y: height * (.5 + (row - (rows - 1) / 2) * (.82 / rows)),
      }
    }
  }
  return { width, height, cardWidth, cardHeight, places }
}

export function targetAt(point: Point, cards: Card[], layout: BoardLayout, radius: number, ignore?: string): Card | undefined {
  let nearest: Card | undefined
  let maxDistance = radius * radius
  for (const card of cards) {
    if (card.id === ignore) continue
    const center = layout.places[card.id]
    const dx = (point.x - center.x) / layout.cardWidth
    const dy = (point.y - center.y) / layout.cardHeight
    const distance = dx * dx + dy * dy
    if (distance > maxDistance || (nearest && distance === maxDistance)) continue
    nearest = card
    maxDistance = distance
  }
  return nearest
}

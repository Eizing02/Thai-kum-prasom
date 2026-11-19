import { useState } from 'react'
import { Volume2 } from 'lucide-react'
import type { Word } from '../content/schema'
import { speakThai } from '../game/audio'
import { Button } from './ui'

export function WordSpeech({ word, label = 'อ่านออกเสียง' }: { word: Word; label?: string }) {
  const [unavailable, setUnavailable] = useState(false)
  return <>
    <Button aria-label={label} onClick={() => setUnavailable(!speakThai(word.pronunciation ?? word.displayWord, word.mode))}>
      <Volume2 size={17} /> อ่านออกเสียง
    </Button>
    {unavailable && <p role="status">อุปกรณ์นี้ไม่มีเสียงอ่านภาษาไทยแบบออฟไลน์</p>}
  </>
}

export function AdditionalMeanings({ word }: { word: Word }) {
  return <>
    {word.pronunciation && <p>คำอ่าน {word.pronunciation}</p>}
    {word.additionalMeanings?.map(({ meaning, exampleSentence }) => <p key={meaning}>
      <strong>อีกความหมาย</strong> {meaning} เช่น “{exampleSentence}”
    </p>)}
  </>
}

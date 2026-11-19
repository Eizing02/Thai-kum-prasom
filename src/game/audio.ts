import type { Mode } from '../content/schema'

let audio: AudioContext | undefined

export function unlockAudio() {
  if (!window.AudioContext) return
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume().catch(() => {})
  } catch { /* The game also works with no audio device. */ }
}

export function chime(correct: boolean) {
  if (!audio || audio.state !== 'running') return
  const context = audio
  const frequencies = correct ? [523.25, 659.25, 783.99] : [240, 155]
  for (const [index, frequency] of frequencies.entries()) {
    const start = context.currentTime + index * .075
    const oscillator = context.createOscillator()
    const volume = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    volume.gain.setValueAtTime(.001, start)
    volume.gain.exponentialRampToValueAtTime(.075, start + .025)
    volume.gain.exponentialRampToValueAtTime(.001, start + .23)
    oscillator.connect(volume).connect(context.destination)
    oscillator.start(start)
    oscillator.stop(start + .24)
    oscillator.onended = () => { oscillator.disconnect(); volume.disconnect() }
  }
}

export function speakThai(text: string, mode: Mode) {
  if (!('speechSynthesis' in window)) return false
  const voice = speechSynthesis.getVoices().find(voice => voice.localService && voice.lang.toLowerCase().startsWith('th'))
  if (!voice) return false
  speechSynthesis.cancel()
  const message = new SpeechSynthesisUtterance(text)
  message.voice = voice
  message.lang = voice.lang
  message.rate = mode === 'double' ? 0.45 : 0.8
  speechSynthesis.speak(message)
  return true
}

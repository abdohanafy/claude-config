// Writes the board's alert sounds as 16-bit mono WAVs beside this file.
// Synthesised here, so there is no licence to track. Run: node sounds/make.mjs
//
// Each sound has its own family of timbre, so they cannot be mistaken for each other:
//   done    a short brass "ta-da" fanfare        (finished, celebrate)
//   landed  an 8-bit coin "bling"                (one small win collected)
//   needs   a knock-knock on a wooden door, x2   (someone needs you)
//   failed  a low error buzzer, "bzzt bzzt"      (something broke)
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RATE = 44100
const here = dirname(fileURLToPath(import.meta.url))
const hz = n => 440 * 2 ** ((n - 69) / 12) // MIDI note to Hz
const TAU = 2 * Math.PI

/** Band-limited-enough saw and square from a few harmonics, so nothing aliases harshly. */
function saw(phase, harmonics = 12) {
  let s = 0
  for (let k = 1; k <= harmonics; k++) s += Math.sin(phase * k) / k
  return s * 0.6
}
function square(phase, harmonics = 9) {
  let s = 0
  for (let k = 1; k <= harmonics; k += 2) s += Math.sin(phase * k) / k
  return s * 0.9
}

/** Attack, hold, release envelope in seconds. */
function ahr(t, a, h, r) {
  if (t < a) return t / a
  if (t < a + h) return 1
  return Math.max(0, 1 - (t - a - h) / r)
}

/** A brass-like note: saw with a slow attack, slight vibrato and brightness that opens up. */
function brass(buf, at, midi, len, gain) {
  const f = hz(midi)
  const start = Math.floor(at * RATE)
  let phase = 0
  for (let i = 0; i < len * RATE && start + i < buf.length; i++) {
    const t = i / RATE
    const vib = 1 + 0.004 * Math.sin(TAU * 5.5 * t) * Math.min(1, t / 0.3)
    phase += (TAU * f * vib) / RATE
    const bright = Math.round(3 + 7 * Math.min(1, t / 0.08))
    buf[start + i] += gain * ahr(t, 0.03, len - 0.25, 0.22) * saw(phase, bright)
  }
}

/** A square-wave chip note with a hard start and a quick decay. */
function chip(buf, at, midi, len, gain) {
  const f = hz(midi)
  const start = Math.floor(at * RATE)
  for (let i = 0; i < len * RATE && start + i < buf.length; i++) {
    const t = i / RATE
    buf[start + i] += gain * Math.min(1, t / 0.002) * Math.exp(-5 * t) * square(TAU * f * t)
  }
}

/** A knuckle on wood: a damped low body tone plus a short filtered noise click. */
function knock(buf, at, gain) {
  const start = Math.floor(at * RATE)
  // Two-pole resonator on white noise gives the woody "tok".
  const f0 = 190
  const r = 0.995
  const c = 2 * r * Math.cos((TAU * f0) / RATE)
  let y1 = 0
  let y2 = 0
  for (let i = 0; i < 0.16 * RATE && start + i < buf.length; i++) {
    const t = i / RATE
    const noise = (Math.random() * 2 - 1) * Math.exp(-90 * t)
    const y = noise + c * y1 - r * r * y2
    y2 = y1
    y1 = y
    const body = Math.sin(TAU * 110 * t) * Math.exp(-35 * t)
    const click = (Math.random() * 2 - 1) * Math.exp(-400 * t) * 0.4
    buf[start + i] += gain * (0.05 * y + 0.8 * body + click)
  }
}

/** A buzzer: a low square with a fast tremolo, gated on and off. */
function buzz(buf, at, len, gain) {
  const start = Math.floor(at * RATE)
  for (let i = 0; i < len * RATE && start + i < buf.length; i++) {
    const t = i / RATE
    const trem = 0.75 + 0.25 * Math.sin(TAU * 32 * t)
    const tone = square(TAU * 116 * t, 15) * 0.7 + square(TAU * 117.5 * t, 15) * 0.3
    buf[start + i] += gain * ahr(t, 0.005, len - 0.03, 0.025) * trem * tone
  }
}

function wav(name, seconds, draw) {
  const buf = new Float32Array(Math.ceil(seconds * RATE))
  draw(buf)
  const peak = buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1
  const out = Buffer.alloc(44 + buf.length * 2)
  out.write('RIFF', 0)
  out.writeUInt32LE(36 + buf.length * 2, 4)
  out.write('WAVEfmt ', 8)
  out.writeUInt32LE(16, 16)
  out.writeUInt16LE(1, 20)
  out.writeUInt16LE(1, 22)
  out.writeUInt32LE(RATE, 24)
  out.writeUInt32LE(RATE * 2, 28)
  out.writeUInt16LE(2, 32)
  out.writeUInt16LE(16, 34)
  out.write('data', 36)
  out.writeUInt32LE(buf.length * 2, 40)
  const level = 0.8 / peak
  for (let i = 0; i < buf.length; i++) {
    const fade = Math.min(1, (buf.length - i) / (0.02 * RATE))
    out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i] * level * fade)) * 32767), 44 + i * 2)
  }
  writeFileSync(join(here, `${name}.wav`), out)
}

// Ta-da: two quick pickup notes, then a held major chord.
wav('done', 1.6, b => {
  brass(b, 0.0, 67, 0.14, 0.7) // G4
  brass(b, 0.15, 67, 0.14, 0.7) // G4
  for (const m of [60, 64, 67, 72]) brass(b, 0.3, m, 1.25, 0.45) // C major, held
})

// Coin: B5 then a longer E6, like collecting a coin in an old game.
wav('landed', 0.5, b => {
  chip(b, 0, 83, 0.08, 0.6)
  chip(b, 0.08, 88, 0.42, 0.6)
})

// Knock-knock, pause, knock-knock.
wav('needs', 1.5, b => {
  for (const at of [0, 0.17, 0.75, 0.92]) knock(b, at, 1)
})

// Error buzzer: two short buzzes.
wav('failed', 0.75, b => {
  buzz(b, 0, 0.28, 1)
  buzz(b, 0.4, 0.32, 1)
})

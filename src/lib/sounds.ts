/**
 * Timer alert sounds. Built-in sounds are synthesized with Web Audio (no files to load,
 * so they work offline); a custom sound is an audio file the person picked, kept in a
 * small device-level database shared by every profile. Volume above 100% is boosted
 * through a compressor so it can cut through music without harsh clipping.
 */
import Dexie, { type EntityTable } from 'dexie';

export type BuiltInSoundId = 'beep' | 'triple' | 'bell' | 'chime' | 'alarm' | 'whistle';
export type SoundId = BuiltInSoundId | 'custom';

export const BUILT_IN_SOUNDS: { id: BuiltInSoundId; label: string }[] = [
  { id: 'beep', label: 'Double beep' },
  { id: 'triple', label: 'Triple beep' },
  { id: 'bell', label: 'Bell' },
  { id: 'chime', label: 'Chime' },
  { id: 'alarm', label: 'Alarm' },
  { id: 'whistle', label: 'Whistle' },
];

/** Longest custom sound that gets played, and the largest file accepted. */
export const CUSTOM_MAX_SECONDS = 8;
export const CUSTOM_MAX_BYTES = 3 * 1024 * 1024;

let ctx: AudioContext | null = null;

/** Create/resume the audio context during a user tap so a later alert is allowed to play. */
export function primeAudio(): AudioContext | null {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

type Note = { at: number; freq: number; dur: number; type?: OscillatorType; level?: number; slideTo?: number };

/** Each built-in sound as a list of notes (seconds from the start). */
const NOTES: Record<BuiltInSoundId, Note[]> = {
  beep: [
    { at: 0, freq: 880, dur: 0.18 },
    { at: 0.22, freq: 1175, dur: 0.18 },
  ],
  triple: [
    { at: 0, freq: 1046, dur: 0.12, type: 'square', level: 0.5 },
    { at: 0.18, freq: 1046, dur: 0.12, type: 'square', level: 0.5 },
    { at: 0.36, freq: 1568, dur: 0.22, type: 'square', level: 0.5 },
  ],
  bell: [
    { at: 0, freq: 1318, dur: 1.4 },
    { at: 0, freq: 2637, dur: 0.9, level: 0.35 },
    { at: 0, freq: 3951, dur: 0.5, level: 0.15 },
  ],
  chime: [
    { at: 0, freq: 784, dur: 0.6, type: 'triangle' },
    { at: 0.2, freq: 988, dur: 0.6, type: 'triangle' },
    { at: 0.4, freq: 1175, dur: 0.6, type: 'triangle' },
    { at: 0.6, freq: 1568, dur: 0.9, type: 'triangle' },
  ],
  alarm: [0, 0.25, 0.5, 0.75].map((at, i) => ({ at, freq: i % 2 ? 660 : 880, dur: 0.22, type: 'sawtooth' as const, level: 0.45 })),
  whistle: [
    { at: 0, freq: 1800, dur: 0.25, slideTo: 2600 },
    { at: 0.32, freq: 1800, dur: 0.35, slideTo: 2600 },
  ],
};

const LENGTH: Record<BuiltInSoundId, number> = { beep: 0.45, triple: 0.65, bell: 1.4, chime: 1.5, alarm: 1.0, whistle: 0.7 };

/** Output chain for one alert: volume gain into a compressor, so boosts stay clean. */
function output(c: AudioContext, volumePct: number): AudioNode {
  const gain = c.createGain();
  gain.gain.value = Math.max(0, volumePct) / 100;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.ratio.value = 12;
  comp.attack.value = 0.002;
  comp.release.value = 0.1;
  gain.connect(comp).connect(c.destination);
  return gain;
}

function playNotes(c: AudioContext, out: AudioNode, notes: Note[], start: number) {
  for (const n of notes) {
    const osc = c.createOscillator();
    const env = c.createGain();
    const t = start + n.at;
    const peak = 0.6 * (n.level ?? 1);
    osc.type = n.type ?? 'sine';
    osc.frequency.setValueAtTime(n.freq, t);
    if (n.slideTo) osc.frequency.exponentialRampToValueAtTime(n.slideTo, t + n.dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + n.dur);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + n.dur + 0.02);
  }
}

// ---- Custom sound (device-level storage) ----

interface StoredSound {
  key: 'custom';
  name: string;
  type: string;
  data: ArrayBuffer;
}

class SoundDB extends Dexie {
  sounds!: EntityTable<StoredSound, 'key'>;
  constructor() {
    super('liftlog-sounds');
    this.version(1).stores({ sounds: 'key' });
  }
}

let soundDb: SoundDB | null = null;
const sounds = () => (soundDb ??= new SoundDB()).sounds;
let decoded: { name: string; buffer: AudioBuffer } | null | undefined;

async function decode(c: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  // decodeAudioData detaches its input, so hand it a copy.
  return c.decodeAudioData(data.slice(0));
}

/** Name of the saved custom sound, if there is one. */
export async function customSoundName(): Promise<string | null> {
  try {
    return (await sounds().get('custom'))?.name ?? null;
  } catch {
    return null;
  }
}

/** Validates and saves an audio file as the custom sound. Throws a readable message on failure. */
export async function saveCustomSound(file: File): Promise<string> {
  if (file.size > CUSTOM_MAX_BYTES) throw new Error('That file is too big. Pick a short sound under 3 MB.');
  const data = await file.arrayBuffer();
  const c = primeAudio();
  if (!c) throw new Error("This device can't play sounds.");
  let buffer: AudioBuffer;
  try {
    buffer = await decode(c, data);
  } catch {
    throw new Error("Couldn't read that file. Try an MP3, M4A, OGG, or WAV sound.");
  }
  const name = file.name.replace(/\.[^.]+$/, '') || 'My sound';
  await sounds().put({ key: 'custom', name, type: file.type, data });
  decoded = { name, buffer };
  return name;
}

export async function deleteCustomSound(): Promise<void> {
  await sounds().delete('custom');
  decoded = null;
}

async function customBuffer(c: AudioContext): Promise<AudioBuffer | null> {
  if (decoded !== undefined) return decoded?.buffer ?? null;
  try {
    const rec = await sounds().get('custom');
    decoded = rec ? { name: rec.name, buffer: await decode(c, rec.data) } : null;
  } catch {
    decoded = null;
  }
  return decoded?.buffer ?? null;
}

/**
 * Plays an alert `repeat` times at `volumePct` (100 = normal, up to 300).
 * Falls back to the double beep if the custom sound is missing.
 */
export async function playSound(id: SoundId, volumePct: number, repeat = 1): Promise<void> {
  const c = primeAudio();
  if (!c) return;
  try {
    const out = output(c, volumePct);
    const start = c.currentTime + 0.03;
    const times = Math.min(Math.max(1, Math.round(repeat)), 5);
    if (id === 'custom') {
      const buffer = await customBuffer(c);
      if (buffer) {
        const len = Math.min(buffer.duration, CUSTOM_MAX_SECONDS);
        for (let i = 0; i < times; i++) {
          const src = c.createBufferSource();
          src.buffer = buffer;
          src.connect(out);
          src.start(start + i * (len + 0.25), 0, len);
        }
        return;
      }
      id = 'beep';
    }
    const gap = LENGTH[id] + 0.35;
    for (let i = 0; i < times; i++) playNotes(c, out, NOTES[id], start + i * gap);
  } catch {
    /* ignore: an alert sound must never break the app */
  }
}

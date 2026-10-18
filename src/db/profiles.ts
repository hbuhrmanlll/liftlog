/**
 * Profiles on this device. Each person has a unique username and a PIN, and
 * their data lives in a separate IndexedDB database. The PIN is stored only as
 * a salted PBKDF2 hash. This keeps people's logs apart on a shared phone; it is
 * not a substitute for real account security (there is no server).
 */
import Dexie, { type EntityTable } from 'dexie';
import type { Profile } from '../types';
import { LEGACY_DB_NAME, LiftLogDB } from './db';

class ProfilesDB extends Dexie {
  profiles!: EntityTable<Profile, 'id'>;
  constructor() {
    super('liftlog-profiles');
    this.version(1).stores({ profiles: 'id, &usernameKey, lastLoginAt' });
  }
}

export const profilesDb = new ProfilesDB();

const SESSION_KEY = 'liftlog.activeProfile';
const ATTEMPTS_KEY = 'liftlog.pinAttempts';
const PBKDF2_ITERATIONS = 150_000;
export const PROFILE_COLORS = ['#c6f432', '#3b82f6', '#e8650f', '#10a374', '#a855f7', '#ec4899', '#eab308', '#06b6d4'];

export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,19}$/i;
export const PIN_RE = /^\d{4,8}$/;

export function normalizeUsername(name: string): string {
  return name.trim().toLowerCase();
}

export function validateUsername(name: string): string | null {
  const n = name.trim();
  if (n.length < 3) return 'Use at least 3 characters.';
  if (n.length > 20) return 'Use 20 characters or fewer.';
  if (!USERNAME_RE.test(n)) return 'Use letters, numbers, dots, dashes, or underscores (start with a letter or number).';
  return null;
}

export function validatePin(pin: string): string | null {
  return PIN_RE.test(pin) ? null : 'PIN must be 4 to 8 digits.';
}

function toHex(buf: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function hashPin(pin: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex) as BufferSource, iterations: PBKDF2_ITERATIONS }, key, 256);
  return toHex(bits);
}

function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function randomId(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(8)));
}

/** True when the old single-user database has data that the first profile should keep. */
export async function legacyDataExists(): Promise<boolean> {
  if (!(await Dexie.exists(LEGACY_DB_NAME))) return false;
  const legacy = new LiftLogDB(LEGACY_DB_NAME);
  try {
    const s = await legacy.settings.get('settings');
    return Boolean(s?.onboarded) || (await legacy.workouts.count()) > 0;
  } catch {
    return false;
  } finally {
    legacy.close();
  }
}

export async function listProfiles(): Promise<Profile[]> {
  return (await profilesDb.profiles.toArray()).sort((a, b) => (b.lastLoginAt ?? b.createdAt) - (a.lastLoginAt ?? a.createdAt));
}

export class ProfileError extends Error {}

export async function createProfile(input: { username: string; displayName?: string; pin: string }): Promise<Profile> {
  const usernameError = validateUsername(input.username);
  if (usernameError) throw new ProfileError(usernameError);
  const pinError = validatePin(input.pin);
  if (pinError) throw new ProfileError(pinError);
  const usernameKey = normalizeUsername(input.username);
  if (await profilesDb.profiles.where('usernameKey').equals(usernameKey).count()) throw new ProfileError('That username is taken on this device. Pick another.');

  const existing = await profilesDb.profiles.count();
  // The first profile inherits any data logged before profiles existed.
  const takeLegacy = existing === 0;
  const id = randomId();
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const profile: Profile = {
    id,
    username: input.username.trim(),
    usernameKey,
    displayName: (input.displayName ?? '').trim() || input.username.trim(),
    dbName: takeLegacy ? LEGACY_DB_NAME : `liftlog-${id}`,
    pinHash: await hashPin(input.pin, salt),
    pinSalt: salt,
    color: PROFILE_COLORS[existing % PROFILE_COLORS.length],
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
  };
  try {
    await profilesDb.profiles.add(profile);
  } catch (err) {
    if (err instanceof Dexie.ConstraintError) throw new ProfileError('That username is taken on this device. Pick another.');
    throw err;
  }
  return profile;
}

interface Attempts {
  count: number;
  until: number;
}

function readAttempts(id: string): Attempts {
  try {
    const all = JSON.parse(localStorage.getItem(ATTEMPTS_KEY) ?? '{}') as Record<string, Attempts>;
    return all[id] ?? { count: 0, until: 0 };
  } catch {
    return { count: 0, until: 0 };
  }
}

function writeAttempts(id: string, a: Attempts | null) {
  try {
    const all = JSON.parse(localStorage.getItem(ATTEMPTS_KEY) ?? '{}') as Record<string, Attempts>;
    if (a) all[id] = a;
    else delete all[id];
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

/** Seconds until another PIN attempt is allowed (after 5 wrong tries, 30s lockout). */
export function lockoutSeconds(profileId: string, now = Date.now()): number {
  const a = readAttempts(profileId);
  return a.until > now ? Math.ceil((a.until - now) / 1000) : 0;
}

export async function verifyPin(profile: Profile, pin: string, now = Date.now()): Promise<boolean> {
  if (lockoutSeconds(profile.id, now) > 0) throw new ProfileError(`Too many tries. Wait ${lockoutSeconds(profile.id, now)} seconds.`);
  const ok = safeEqual(await hashPin(pin, profile.pinSalt), profile.pinHash);
  if (ok) {
    writeAttempts(profile.id, null);
    return true;
  }
  const a = readAttempts(profile.id);
  const count = a.count + 1;
  writeAttempts(profile.id, count >= 5 ? { count: 0, until: now + 30_000 } : { count, until: 0 });
  return false;
}

export async function signIn(profile: Profile, pin: string): Promise<boolean> {
  if (!(await verifyPin(profile, pin))) return false;
  await profilesDb.profiles.update(profile.id, { lastLoginAt: Date.now() });
  setActiveProfileId(profile.id);
  return true;
}

export function getActiveProfileId(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function setActiveProfileId(id: string | null): void {
  try {
    if (id) localStorage.setItem(SESSION_KEY, id);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export async function getProfile(id: string): Promise<Profile | undefined> {
  return profilesDb.profiles.get(id);
}

export async function changePin(profile: Profile, currentPin: string, newPin: string): Promise<void> {
  if (!(await verifyPin(profile, currentPin))) throw new ProfileError('Current PIN is wrong.');
  const err = validatePin(newPin);
  if (err) throw new ProfileError(err);
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  await profilesDb.profiles.update(profile.id, { pinSalt: salt, pinHash: await hashPin(newPin, salt) });
}

export async function renameProfile(id: string, displayName: string): Promise<void> {
  const name = displayName.trim();
  if (name) await profilesDb.profiles.update(id, { displayName: name.slice(0, 40) });
}

/** Deletes the profile and all of its data. Requires the PIN. */
export async function deleteProfile(profile: Profile, pin: string): Promise<void> {
  if (!(await verifyPin(profile, pin))) throw new ProfileError('PIN is wrong.');
  await profilesDb.profiles.delete(profile.id);
  await Dexie.delete(profile.dbName);
  if (getActiveProfileId() === profile.id) setActiveProfileId(null);
}

import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, LEGACY_DB_NAME, LiftLogDB, switchToProfileDb } from './db';
import { changePin, createProfile, deleteProfile, getActiveProfileId, legacyDataExists, listProfiles, lockoutSeconds, ProfileError, profilesDb, signIn, validateUsername, verifyPin } from './profiles';
import { addBodyweight, ensureSeeded, getSettings, updateSettings } from './repo';

// Minimal localStorage for the session + lockout bookkeeping.
const store = new Map<string, string>();
(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

beforeEach(async () => {
  store.clear();
  await profilesDb.profiles.clear();
  for (const name of await Dexie.getDatabaseNames()) if (name.startsWith('liftlog') && name !== 'liftlog-profiles') await Dexie.delete(name);
  switchToProfileDb(LEGACY_DB_NAME);
});

describe('profiles', () => {
  it('validates usernames', () => {
    expect(validateUsername('ab')).toMatch(/at least 3/);
    expect(validateUsername('has space')).toBeTruthy();
    expect(validateUsername('-lead')).toBeTruthy();
    expect(validateUsername('Mike_92')).toBeNull();
  });

  it('requires unique usernames (case-insensitive)', async () => {
    await createProfile({ username: 'Mike', pin: '1234' });
    await expect(createProfile({ username: 'mike', pin: '9999' })).rejects.toBeInstanceOf(ProfileError);
    await expect(createProfile({ username: 'MIKE', pin: '9999' })).rejects.toThrow(/taken/);
    expect((await listProfiles()).length).toBe(1);
  });

  it('stores only a salted hash of the PIN', async () => {
    const p = await createProfile({ username: 'sam', pin: '2468' });
    expect(JSON.stringify(p)).not.toContain('2468');
    expect(p.pinHash).toMatch(/^[0-9a-f]{64}$/);
    const q = await createProfile({ username: 'sam2', pin: '2468' });
    expect(q.pinHash).not.toBe(p.pinHash); // different salts
  });

  it('signs in with the right PIN only, and locks out after 5 misses', async () => {
    const p = await createProfile({ username: 'lee', pin: '1357' });
    expect(await signIn(p, '0000')).toBe(false);
    expect(await signIn(p, '1357')).toBe(true);
    expect(getActiveProfileId()).toBe(p.id);
    for (let i = 0; i < 5; i++) await verifyPin(p, '0000');
    expect(lockoutSeconds(p.id)).toBeGreaterThan(0);
    await expect(verifyPin(p, '1357')).rejects.toThrow(/Too many tries/);
  });

  it('changes the PIN', async () => {
    const p = await createProfile({ username: 'kim', pin: '1111' });
    await changePin(p, '1111', '2222');
    const updated = (await profilesDb.profiles.get(p.id))!;
    expect(await verifyPin(updated, '2222')).toBe(true);
    expect(await verifyPin(updated, '1111')).toBe(false);
    await expect(changePin(updated, '9999', '3333')).rejects.toThrow(/Current PIN/);
  });

  it('the first profile keeps data logged before profiles existed; others get their own database', async () => {
    await ensureSeeded();
    await updateSettings({ onboarded: true });
    expect(await legacyDataExists()).toBe(true);
    const first = await createProfile({ username: 'owner', pin: '1234' });
    const second = await createProfile({ username: 'guest', pin: '1234' });
    expect(first.dbName).toBe(LEGACY_DB_NAME);
    expect(second.dbName).not.toBe(LEGACY_DB_NAME);
  });

  it("keeps each person's data separate", async () => {
    const a = await createProfile({ username: 'alex', pin: '1234' });
    const b = await createProfile({ username: 'blake', pin: '1234' });
    switchToProfileDb(a.dbName);
    await ensureSeeded();
    await updateSettings({ units: 'kg', onboarded: true });
    await addBodyweight(80);
    switchToProfileDb(b.dbName);
    await ensureSeeded();
    expect((await getSettings()).units).toBe('lb');
    expect(await db.bodyweight.count()).toBe(0);
    switchToProfileDb(a.dbName);
    expect(await db.bodyweight.count()).toBe(1);
  });

  it('deleting a profile removes its database and requires the PIN', async () => {
    await createProfile({ username: 'first', pin: '1234' });
    const p = await createProfile({ username: 'temp', pin: '4321' });
    const pdb = new LiftLogDB(p.dbName);
    await pdb.settings.put({ id: 'settings' } as never);
    pdb.close();
    await expect(deleteProfile(p, '0000')).rejects.toThrow(/PIN/);
    await deleteProfile(p, '4321');
    expect(await Dexie.exists(p.dbName)).toBe(false);
    expect((await listProfiles()).map((x) => x.username)).toEqual(['first']);
  });
});

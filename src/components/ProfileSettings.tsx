import { KeyRound, LogOut, Pencil, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { changePin, deleteProfile, ProfileError, renameProfile } from '../db/profiles';
import { useProfile } from '../hooks/profile';
import { useToast } from '../hooks/toast';
import { latestBodyweight, useBodyweight, useSettings } from '../hooks/useData';
import { ageFromBirthYear, bmr, bodyStats } from '../lib/calories';
import { formatNumber } from '../lib/format';
import { BodyStatsForm } from './BodyStatsForm';
import { Button, Card, Sheet, TextField } from './ui';

export function ProfileSettings() {
  const { profile, signOut, refresh } = useProfile();
  const settings = useSettings();
  const bodyweight = useBodyweight();
  const toast = useToast();
  const [statsOpen, setStatsOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(profile.displayName);
  const latest = latestBodyweight(bodyweight);
  const stats = bodyStats(settings, latest);
  const age = ageFromBirthYear(settings.birthYear);
  const heightLabel = settings.heightCm
    ? settings.units === 'kg'
      ? `${Math.round(settings.heightCm)} cm`
      : `${Math.floor(Math.round(settings.heightCm / 2.54) / 12)}'${Math.round(settings.heightCm / 2.54) % 12}"`
    : null;
  const summary = [settings.sex !== 'unspecified' ? settings.sex : null, age ? `${age} yrs` : null, heightLabel, latest ? `${latest} ${settings.units}` : null].filter(Boolean).join(' · ');

  return (
    <section id="profile" className="scroll-mt-6">
      <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wider text-ink-3">Profile</h2>
      <Card className="divide-y divide-line px-4">
        <div className="flex items-center gap-3 py-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-black" style={{ background: profile.color }} aria-hidden>
            {profile.displayName.charAt(0).toUpperCase()}
          </span>
          {renaming ? (
            <form
              className="flex min-w-0 flex-1 gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                await renameProfile(profile.id, name);
                await refresh();
                setRenaming(false);
              }}
            >
              <TextField label="Name" className="flex-1" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              <Button type="submit" variant="primary" size="sm" className="mt-[22px] h-12">
                Save
              </Button>
            </form>
          ) : (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-semibold">{profile.displayName}</p>
                <p className="truncate text-[13px] text-ink-3">@{profile.username} · signed in on this phone</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setRenaming(true)} aria-label="Change your name">
                <Pencil className="size-4" aria-hidden />
              </Button>
            </>
          )}
        </div>

        <button type="button" onClick={() => setStatsOpen(true)} className="flex w-full items-center gap-3 py-3.5 text-left">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">About you</span>
            <span className="block text-[13px] text-ink-3">{summary || 'Add age, height, and weight for calorie estimates'}</span>
            {bmr(stats) !== null && <span className="block text-[12px] text-ink-3">Resting burn about {formatNumber(bmr(stats)!)} kcal/day</span>}
          </span>
          <Pencil className="size-4 text-ink-3" aria-hidden />
        </button>

        <div className="flex flex-wrap gap-2 py-3.5">
          <Button size="sm" onClick={() => setPinOpen(true)}>
            <KeyRound className="size-4" aria-hidden /> Change PIN
          </Button>
          <Button size="sm" onClick={signOut}>
            <Users className="size-4" aria-hidden /> Switch profile
          </Button>
          <Button size="sm" variant="ghost" onClick={signOut}>
            <LogOut className="size-4" aria-hidden /> Sign out
          </Button>
        </div>
        <div className="py-3.5">
          <Button size="sm" variant="danger" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-4" aria-hidden /> Delete this profile
          </Button>
        </div>
      </Card>

      <Sheet open={statsOpen} onClose={() => setStatsOpen(false)} title="About you">
        <BodyStatsForm
          settings={settings}
          latestWeight={latest}
          onSaved={() => {
            setStatsOpen(false);
            toast('Saved');
          }}
        />
      </Sheet>
      <Sheet open={pinOpen} onClose={() => setPinOpen(false)} title="Change PIN">
        <ChangePinForm onDone={() => setPinOpen(false)} />
      </Sheet>
      <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete profile?">
        <DeleteProfileForm onCancel={() => setDeleteOpen(false)} onDeleted={signOut} />
      </Sheet>
    </section>
  );
}

function ChangePinForm({ onDone }: { onDone: () => void }) {
  const { profile, refresh } = useProfile();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 8);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await changePin(profile, current, next);
          await refresh();
          toast('PIN changed');
          onDone();
        } catch (err) {
          setError(err instanceof ProfileError ? err.message : 'Could not change the PIN.');
        }
      }}
    >
      <TextField label="Current PIN" type="password" inputMode="numeric" autoComplete="current-password" value={current} onChange={(e) => setCurrent(digits(e.target.value))} />
      <TextField label="New PIN (4-8 digits)" type="password" inputMode="numeric" autoComplete="new-password" value={next} onChange={(e) => setNext(digits(e.target.value))} />
      {error && (
        <p className="text-[14px] text-danger" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" className="w-full" disabled={current.length < 4 || next.length < 4}>
        Change PIN
      </Button>
    </form>
  );
}

function DeleteProfileForm({ onCancel, onDeleted }: { onCancel: () => void; onDeleted: () => void }) {
  const { profile } = useProfile();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await deleteProfile(profile, pin);
          onDeleted();
        } catch (err) {
          setError(err instanceof ProfileError ? err.message : 'Could not delete the profile.');
        }
      }}
    >
      <p className="text-[15px] leading-relaxed text-ink-2">
        This permanently deletes <strong className="text-ink">@{profile.username}</strong> and all of its workouts, weigh-ins, and coach chats from this phone. Export a backup first if you might want them.
      </p>
      <TextField label="Enter your PIN to confirm" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} />
      {error && (
        <p className="text-[14px] text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" className="flex-1" disabled={pin.length < 4}>
          Delete profile
        </Button>
      </div>
    </form>
  );
}

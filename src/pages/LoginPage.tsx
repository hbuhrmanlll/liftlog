import { ArrowLeft, ChevronRight, KeyRound, Lock, Plus, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { LogoMark } from '../components/Logo';
import { Button, cx, TextField } from '../components/ui';
import { createProfile, legacyDataExists, listProfiles, lockoutSeconds, ProfileError, signIn, validatePin, validateUsername } from '../db/profiles';
import type { Profile } from '../types';

function Avatar({ profile, size = 'md' }: { profile: Pick<Profile, 'displayName' | 'color'>; size?: 'md' | 'lg' }) {
  return (
    <span
      className={cx('flex shrink-0 items-center justify-center rounded-2xl font-bold text-black', size === 'lg' ? 'size-16 text-2xl' : 'size-12 text-lg')}
      style={{ background: profile.color }}
      aria-hidden
    >
      {profile.displayName.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

export function LoginPage({ onSignedIn }: { onSignedIn: (p: Profile) => void }) {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [legacy, setLegacy] = useState(false);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void listProfiles().then(setProfiles);
    void legacyDataExists().then(setLegacy);
  }, []);

  if (!profiles) return <div className="min-h-dvh bg-bg" aria-busy="true" />;

  const showCreate = creating || profiles.length === 0;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10 pt-[calc(env(safe-area-inset-top)+2rem)]">
      <div className="mb-8 flex items-center gap-2.5">
        <LogoMark className="size-9" />
        <span className="text-lg font-bold tracking-tight">LiftLog</span>
      </div>

      {selected ? (
        <PinEntry profile={selected} onBack={() => setSelected(null)} onSignedIn={onSignedIn} />
      ) : showCreate ? (
        <CreateProfile
          first={profiles.length === 0}
          legacy={legacy && profiles.length === 0}
          onBack={profiles.length ? () => setCreating(false) : undefined}
          onCreated={onSignedIn}
        />
      ) : (
        <div className="animate-fade-up">
          <h1 className="text-[30px] font-bold leading-tight tracking-tight">Who's lifting?</h1>
          <p className="mt-1.5 text-[15px] text-ink-2">Each person's workouts, weight, and coach chats are kept separate.</p>
          <ul className="mt-6 space-y-2.5">
            {profiles.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setSelected(p)} className="flex w-full items-center gap-3.5 rounded-2xl border border-line bg-surface p-3.5 text-left transition-colors hover:bg-surface-2">
                  <Avatar profile={p} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[17px] font-semibold">{p.displayName}</span>
                    <span className="block truncate text-[13px] text-ink-3">@{p.username}</span>
                  </span>
                  <ChevronRight className="size-5 text-ink-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <Button size="lg" className="mt-4 w-full" onClick={() => setCreating(true)}>
            <Plus className="size-5" aria-hidden /> Add a profile
          </Button>
        </div>
      )}
    </div>
  );
}

function PinEntry({ profile, onBack, onSignedIn }: { profile: Profile; onBack: () => void; onSignedIn: (p: Profile) => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lock, setLock] = useState(() => lockoutSeconds(profile.id));

  useEffect(() => {
    if (lock <= 0) return;
    const t = window.setTimeout(() => setLock(lockoutSeconds(profile.id)), 1000);
    return () => window.clearTimeout(t);
  }, [lock, profile.id]);

  const submit = async () => {
    if (busy || !pin) return;
    setBusy(true);
    setError(null);
    try {
      if (await signIn(profile, pin)) onSignedIn(profile);
      else {
        setPin('');
        setLock(lockoutSeconds(profile.id));
        setError('Wrong PIN. Try again.');
      }
    } catch (err) {
      setPin('');
      setLock(lockoutSeconds(profile.id));
      setError(err instanceof ProfileError ? err.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="animate-fade-up"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <button type="button" onClick={onBack} className="mb-5 inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> All profiles
      </button>
      <div className="flex flex-col items-center text-center">
        <Avatar profile={profile} size="lg" />
        <h1 className="mt-3 text-2xl font-bold">{profile.displayName}</h1>
        <p className="text-[14px] text-ink-3">@{profile.username}</p>
      </div>
      <label htmlFor="pin" className="mt-8 block text-[13px] font-medium text-ink-2">
        PIN
      </label>
      <input
        id="pin"
        type="password"
        inputMode="numeric"
        autoComplete="current-password"
        autoFocus
        maxLength={8}
        value={pin}
        disabled={lock > 0}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        className="tnum mt-1.5 h-14 w-full rounded-2xl border border-line bg-surface-2 px-4 text-center text-2xl tracking-[0.5em] text-ink outline-none focus:border-accent/60 disabled:opacity-50"
      />
      {error && (
        <p className="mt-2 text-center text-[14px] text-danger" role="alert">
          {error}
        </p>
      )}
      {lock > 0 && <p className="mt-2 text-center text-[14px] text-down">Too many tries. Wait {lock}s.</p>}
      <Button type="submit" variant="primary" size="xl" className="mt-5 w-full" disabled={busy || pin.length < 4 || lock > 0}>
        <Lock className="size-5" aria-hidden /> Sign in
      </Button>
      <p className="mt-4 text-center text-[12px] text-ink-3">Forgot your PIN? It can't be recovered. Data stays on this phone only.</p>
    </form>
  );
}

function CreateProfile({ first, legacy, onBack, onCreated }: { first: boolean; legacy: boolean; onBack?: () => void; onCreated: (p: Profile) => void }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const userErr = username ? validateUsername(username) : null;
  const pinErr = pin ? validatePin(pin) : null;
  const mismatch = pin2.length > 0 && pin !== pin2;
  const valid = !validateUsername(username) && !validatePin(pin) && pin === pin2;

  const submit = async () => {
    setTouched(true);
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      onCreated(await createProfile({ username, displayName, pin }));
    } catch (err) {
      setError(err instanceof ProfileError ? err.message : 'Could not create the profile.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="animate-fade-up space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {onBack && (
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> All profiles
        </button>
      )}
      <div>
        <h1 className="text-[30px] font-bold leading-tight tracking-tight">{first ? 'Create your profile' : 'Add a profile'}</h1>
        <p className="mt-1.5 text-[15px] text-ink-2">Pick a unique username and a PIN. Anyone else using this phone can add their own profile.</p>
      </div>
      {legacy && (
        <p className="flex gap-2 rounded-xl bg-accent-soft p-3 text-[14px] text-ink-2">
          <UserPlus className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> The workouts already logged on this phone will be kept in this first profile.
        </p>
      )}
      <TextField
        label="Username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        value={username}
        onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
        hint={userErr ? <span className="text-danger">{userErr}</span> : 'Unique on this phone. Letters, numbers, . _ -'}
        required
      />
      <TextField label="Your name (optional)" autoComplete="nickname" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Shown on your profile" />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="PIN (4-8 digits)"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          hint={pinErr ? <span className="text-danger">{pinErr}</span> : undefined}
        />
        <TextField
          label="Confirm PIN"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={8}
          value={pin2}
          onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))}
          hint={mismatch ? <span className="text-danger">PINs don't match.</span> : undefined}
        />
      </div>
      {error && (
        <p className="text-[14px] text-danger" role="alert">
          {error}
        </p>
      )}
      {touched && !valid && !error && <p className="text-[14px] text-danger">Check the fields above.</p>}
      <Button type="submit" variant="primary" size="xl" className="w-full" disabled={busy}>
        <KeyRound className="size-5" aria-hidden /> Create profile
      </Button>
    </form>
  );
}

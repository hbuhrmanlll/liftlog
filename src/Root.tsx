import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { switchToProfileDb } from './db/db';
import { getActiveProfileId, getProfile, setActiveProfileId } from './db/profiles';
import { ensureSeeded } from './db/repo';
import { ProfileContext } from './hooks/profile';
import { LoginPage } from './pages/LoginPage';
import type { Profile } from './types';

type State = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; profile: Profile };

/** Picks the signed-in profile, opens that person's database, then renders the app. */
export function Root() {
  const [state, setState] = useState<State>({ status: 'loading' });

  const open = useCallback(async (profile: Profile) => {
    // Stay signed in across reloads and app restarts until Sign out.
    setActiveProfileId(profile.id);
    switchToProfileDb(profile.dbName);
    await ensureSeeded();
    setState({ status: 'signedIn', profile });
  }, []);

  useEffect(() => {
    const id = getActiveProfileId();
    (id ? getProfile(id) : Promise.resolve(undefined))
      .then((p) => (p ? open(p) : setState({ status: 'signedOut' })))
      .catch((err: unknown) => {
        console.error('Could not open profile', err);
        setState({ status: 'signedOut' });
      });
  }, [open]);

  const signOut = useCallback(() => {
    setActiveProfileId(null);
    // A full reload clears every in-memory query, timer and cache of the previous person.
    window.location.assign('/');
  }, []);

  if (state.status === 'loading') return <div className="min-h-dvh bg-bg" aria-busy="true" />;
  if (state.status === 'signedOut') return <LoginPage onSignedIn={(p) => void open(p)} />;

  const { profile } = state;
  return (
    <ProfileContext.Provider
      value={{
        profile,
        signOut,
        refresh: async () => {
          const p = await getProfile(profile.id);
          if (p) setState({ status: 'signedIn', profile: p });
        },
      }}
    >
      <BrowserRouter>
        <App key={profile.id} />
      </BrowserRouter>
    </ProfileContext.Provider>
  );
}

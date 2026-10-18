import { createContext, useContext } from 'react';
import type { Profile } from '../types';

export interface ProfileApi {
  profile: Profile;
  /** Sign out and return to the profile picker. */
  signOut: () => void;
  /** Re-read the profile after a change (e.g. rename). */
  refresh: () => Promise<void>;
}

export const ProfileContext = createContext<ProfileApi | null>(null);

export function useProfile(): ProfileApi {
  const v = useContext(ProfileContext);
  if (!v) throw new Error('useProfile must be used inside ProfileContext');
  return v;
}

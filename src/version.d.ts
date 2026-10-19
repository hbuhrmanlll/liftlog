/** Build id injected by vite.config.ts: short commit + build time. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Full URL of the coach function when the app is hosted without one (GitHub Pages, Android app). */
  readonly VITE_COACH_URL?: string;
}

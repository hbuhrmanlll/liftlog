import type { CapacitorConfig } from '@capacitor/cli';

// Android app: packages the built web app (dist/) into an APK. Build it with the
// "Android app" GitHub Action, or locally with `npm run android:sync` and Android Studio.
const config: CapacitorConfig = {
  appId: 'io.github.hbuhrmanlll.liftlog',
  appName: 'LiftLog',
  webDir: 'dist',
  backgroundColor: '#0a0b0d',
  // Keep the app below the status bar and above the navigation bar on every Android version.
  android: { allowMixedContent: false, adjustMarginsForEdgeToEdge: 'force' },
  plugins: {
    LocalNotifications: { smallIcon: 'ic_stat_liftlog', iconColor: '#C6F432' },
  },
};

export default config;

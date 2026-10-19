import { Capacitor } from '@capacitor/core';

/** True inside the installed Android app (Capacitor), false in a browser. */
export const isNativeApp = Capacitor.isNativePlatform();

/**
 * Saves a text file. Browsers download it; the Android app has no downloads
 * folder for web pages, so it writes the file and opens the share sheet
 * (save to Files or Drive, or open it in Calendar).
 */
export async function saveTextFile(name: string, content: string, type: string): Promise<void> {
  if (isNativeApp) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const { uri } = await Filesystem.writeFile({ path: name, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: name, files: [uri] });
    return;
  }
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Where the app lives, for links in reminders. */
export function appUrl(): string {
  return isNativeApp ? 'the LiftLog app' : new URL(import.meta.env.BASE_URL, window.location.origin).href;
}

/** Always the newest APK built by the "Android app" GitHub Action. */
export const ANDROID_APK_URL = 'https://github.com/hbuhrmanlll/liftlog/releases/latest/download/LiftLog.apk';

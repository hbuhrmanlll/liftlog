/**
 * Android notifications (Capacitor). The web app can't run timers while the phone's
 * screen is off, so the installed app hands timer alerts and the weekly weigh-in
 * reminder to Android. In a browser every function here does nothing.
 */
import { isNativeApp } from './platform';

const REST_ID = 1;
const WEIGH_IN_ID = 2;
const SET_ID = 3;

type Plugin = (typeof import('@capacitor/local-notifications'))['LocalNotifications'];
let plugin: Promise<Plugin | null> | null = null;

function load(): Promise<Plugin | null> {
  if (!isNativeApp) return Promise.resolve(null);
  plugin ??= import('@capacitor/local-notifications')
    .then(async ({ LocalNotifications }) => {
      await LocalNotifications.createChannel({ id: 'timer', name: 'Rest and set timer', description: 'Alerts when rest or a set is over', importance: 5, vibration: true, visibility: 1 });
      await LocalNotifications.createChannel({ id: 'weighin', name: 'Weekly weigh-in', description: 'Reminder to log your bodyweight', importance: 3 });
      return LocalNotifications;
    })
    .catch(() => null);
  return plugin;
}

/** Asks for notification permission once (Android 13+). Returns whether notifications can be shown. */
export async function ensureNotificationPermission(): Promise<boolean> {
  const n = await load();
  if (!n) return false;
  try {
    let { display } = await n.checkPermissions();
    if (display === 'prompt' || display === 'prompt-with-rationale') display = (await n.requestPermissions()).display;
    return display === 'granted';
  } catch {
    return false;
  }
}

async function schedule(id: number, at: number, title: string, body: string): Promise<void> {
  const n = await load();
  if (!n || at <= Date.now()) return;
  try {
    await n.cancel({ notifications: [{ id }] });
    await n.schedule({ notifications: [{ id, title, body, channelId: 'timer', autoCancel: true, schedule: { at: new Date(at), allowWhileIdle: true } }] });
  } catch {
    /* permission denied or plugin unavailable */
  }
}

async function cancel(...ids: number[]): Promise<void> {
  const n = await load();
  if (!n) return;
  try {
    await n.cancel({ notifications: ids.map((id) => ({ id })) });
  } catch {
    /* ignore */
  }
}

export const scheduleRestAlert = (at: number, label: string) => schedule(REST_ID, at, 'Rest is over', `Time for your next set${label ? ` of ${label}` : ''}.`);
export const scheduleSetAlert = (at: number, label: string) => schedule(SET_ID, at, 'Set time is up', label || 'Target time reached.');
export const cancelTimerAlerts = () => cancel(REST_ID, SET_ID);

/** Keeps a repeating weekly notification in step with the weigh-in settings (8:00 on the chosen day). */
export async function syncWeighInNotification(enabled: boolean, weekday: number): Promise<void> {
  const n = await load();
  if (!n) return;
  try {
    await n.cancel({ notifications: [{ id: WEIGH_IN_ID }] });
    if (!enabled || !(await ensureNotificationPermission())) return;
    await n.schedule({
      notifications: [
        {
          id: WEIGH_IN_ID,
          title: 'Weekly weigh-in',
          body: 'Weigh yourself (same time, before eating) and log it in LiftLog.',
          channelId: 'weighin',
          // Capacitor counts weekdays from 1 = Sunday.
          schedule: { on: { weekday: weekday + 1, hour: 8, minute: 0 }, allowWhileIdle: true },
        },
      ],
    });
  } catch {
    /* ignore */
  }
}

/**
 * Android notifications (Capacitor). The web app can't run timers while the phone's
 * screen is off, so the installed app hands timer alerts, the weekly weigh-in and
 * workout reminders to Android. In a browser every function here does nothing.
 */
import { isNativeApp } from './platform';

const REST_ID = 1;
const WEIGH_IN_ID = 2;
const SET_ID = 3;
/** Workout reminders use one-off notifications 100-113 (the next two weeks). */
const WORKOUT_BASE_ID = 100;
const WORKOUT_DAYS_AHEAD = 14;

type Plugin = (typeof import('@capacitor/local-notifications'))['LocalNotifications'];
let plugin: Promise<Plugin | null> | null = null;

function load(): Promise<Plugin | null> {
  if (!isNativeApp) return Promise.resolve(null);
  plugin ??= import('@capacitor/local-notifications')
    .then(async ({ LocalNotifications }) => {
      await LocalNotifications.createChannel({ id: 'timer', name: 'Rest and set timer', description: 'Alerts when rest or a set is over', importance: 5, vibration: true, visibility: 1 });
      await LocalNotifications.createChannel({ id: 'weighin', name: 'Weekly weigh-in', description: 'Reminder to log your bodyweight', importance: 3 });
      await LocalNotifications.createChannel({ id: 'workout', name: 'Workout reminders', description: 'A nudge on your training days', importance: 4 });
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

const MESSAGES: ((day: string) => string)[] = [
  (d) => `${d} day is waiting. Show up for 10 minutes and the rest takes care of itself.`,
  (d) => `Consistency beats intensity. Time for ${d} day.`,
  (d) => `Your future self will thank you. ${d} day today.`,
  (d) => `Can't get to the gym? Open LiftLog and do the home version of ${d} day.`,
  (d) => `Small wins add up. ${d} day is next.`,
  (d) => `You don't have to feel like it, you just have to start. ${d} day.`,
  (d) => `Every rep counts toward your next PR. ${d} day is on.`,
];

export interface WorkoutReminderPlan {
  at: number;
  title: string;
  body: string;
}

/**
 * The reminders for the next two weeks: one per training day at the chosen time,
 * skipping today if you already trained or the time has passed. Each one names the
 * day that's next in the rotation (assuming you train on the days before it). Pure.
 */
export function planWorkoutReminders(opts: { trainingDays: number[]; time: string; nextDayLabels: string[]; trainedToday: boolean; now: number; name?: string }): WorkoutReminderPlan[] {
  const [h, m] = opts.time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m) || opts.trainingDays.length === 0) return [];
  const out: WorkoutReminderPlan[] = [];
  const base = new Date(opts.now);
  for (let i = 0; i < WORKOUT_DAYS_AHEAD; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, h, m);
    if (!opts.trainingDays.includes(d.getDay())) continue;
    if (i === 0 && (opts.trainedToday || d.getTime() <= opts.now)) continue;
    const label = opts.nextDayLabels[out.length % opts.nextDayLabels.length];
    const msg = MESSAGES[(d.getDate() + d.getMonth()) % MESSAGES.length];
    out.push({ at: d.getTime(), title: opts.name ? `Time to train, ${opts.name}` : 'Time to train', body: msg(label) });
  }
  return out;
}

/** Replaces the scheduled workout reminders with a fresh two-week plan (Android app only). */
export async function syncWorkoutReminders(enabled: boolean, plan: WorkoutReminderPlan[]): Promise<void> {
  const n = await load();
  if (!n) return;
  try {
    await n.cancel({ notifications: Array.from({ length: WORKOUT_DAYS_AHEAD }, (_, i) => ({ id: WORKOUT_BASE_ID + i })) });
    if (!enabled || plan.length === 0 || !(await ensureNotificationPermission())) return;
    await n.schedule({
      notifications: plan.map((p, i) => ({ id: WORKOUT_BASE_ID + i, title: p.title, body: p.body, channelId: 'workout', autoCancel: true, schedule: { at: new Date(p.at), allowWhileIdle: true } })),
    });
  } catch {
    /* ignore */
  }
}

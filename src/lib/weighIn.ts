/** Weekly weigh-in reminders. Pure functions. */
import type { BodyweightLog } from '../types';
import { DAY_MS, startOfDay } from './calculations';

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The most recent occurrence of `weekday` (0 = Sunday) at 00:00, today included. */
export function lastWeighInDay(weekday: number, now: number): number {
  const today = new Date(startOfDay(now));
  const back = (today.getDay() - weekday + 7) % 7;
  return startOfDay(today.getTime() - back * DAY_MS + 12 * 3600_000);
}

/**
 * Due when there's no entry since the most recent weigh-in day (and none in
 * the 2 days before it, so weighing in a day early still counts).
 */
export function weighInDue(entries: BodyweightLog[], weekday: number, now: number): boolean {
  const since = lastWeighInDay(weekday, now) - 2 * DAY_MS;
  return !entries.some((e) => e.date >= since && e.date <= now);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * A calendar file with a weekly repeating reminder, so the phone's own
 * calendar sends the notification (web apps can't schedule them reliably).
 */
export function weighInIcs(weekday: number, appUrl: string, now = new Date()): string {
  const start = new Date(lastWeighInDay(weekday, now.getTime()) + 7 * DAY_MS);
  start.setHours(8, 0, 0, 0);
  const end = new Date(start.getTime() + 10 * 60_000);
  const fmt = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][weekday];
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LiftLog//Weigh-in//EN',
    'BEGIN:VEVENT',
    `UID:liftlog-weighin-${day}@liftlog`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${day}`,
    'SUMMARY:LiftLog weekly weigh-in',
    `DESCRIPTION:Weigh yourself (same time\\, before eating) and log it in LiftLog: ${appUrl}`,
    'BEGIN:VALARM',
    'TRIGGER:PT0M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Time for your weekly weigh-in',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

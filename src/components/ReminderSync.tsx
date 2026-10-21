import { useEffect } from 'react';
import { useProfile } from '../hooks/profile';
import { useSettings, useWorkouts } from '../hooks/useData';
import { planWorkoutReminders, syncWeighInNotification, syncWorkoutReminders } from '../lib/notifications';
import { isNativeApp } from '../lib/platform';
import { DAY_LABEL, nextDay } from '../lib/schedule';
import { DAY_TYPES } from '../types';

/**
 * Android app: keeps the weekly weigh-in and the next two weeks of workout reminders
 * in step with settings and the rotation. Runs on start and whenever a workout is
 * finished, so today's reminder is skipped once you've trained. Renders nothing.
 */
export function ReminderSync() {
  const settings = useSettings();
  const workouts = useWorkouts();
  const { profile } = useProfile();

  const weighIn = settings.onboarded ? `${settings.weighInReminders}:${settings.weighInDay}` : null;
  useEffect(() => {
    if (!isNativeApp || !weighIn) return;
    const [on, day] = weighIn.split(':');
    void syncWeighInNotification(on === 'true', Number(day));
  }, [weighIn]);

  const done = workouts.filter((w) => w.status === 'completed');
  const today = new Date().toDateString();
  const trainedToday = done.some((w) => new Date(w.startedAt).toDateString() === today);
  const next = nextDay(workouts);
  const key = settings.onboarded
    ? JSON.stringify([settings.workoutReminders, settings.trainingDays, settings.reminderTime, next, trainedToday, today, profile.displayName || profile.username])
    : null;
  useEffect(() => {
    if (!isNativeApp || !key) return;
    const [enabled, trainingDays, time, nextUp, trained, , name] = JSON.parse(key) as [boolean, number[], string, (typeof DAY_TYPES)[number], boolean, string, string];
    const start = DAY_TYPES.indexOf(nextUp);
    const labels = [0, 1, 2].map((k) => DAY_LABEL[DAY_TYPES[(start + k) % 3]]);
    void syncWorkoutReminders(enabled, planWorkoutReminders({ trainingDays, time, nextDayLabels: labels, trainedToday: trained, now: Date.now(), name }));
  }, [key]);

  return null;
}

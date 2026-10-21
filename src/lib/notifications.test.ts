import { describe, expect, it } from 'vitest';
import { planWorkoutReminders } from './notifications';

// Wednesday 21 Oct 2026, 09:00 local time.
const NOW = new Date(2026, 9, 21, 9, 0).getTime();
const base = { trainingDays: [1, 3, 5], time: '17:30', nextDayLabels: ['Pull', 'Legs', 'Push'], trainedToday: false, now: NOW };

describe('workout reminders', () => {
  it('plans one per training day for two weeks at the chosen time, following the rotation', () => {
    const plan = planWorkoutReminders(base);
    expect(plan).toHaveLength(6);
    const first = new Date(plan[0].at);
    expect([first.getDay(), first.getHours(), first.getMinutes()]).toEqual([3, 17, 30]);
    expect(plan.map((p) => new Date(p.at).getDay())).toEqual([3, 5, 1, 3, 5, 1]);
    expect(plan[0].body).toContain('Pull');
    expect(plan[1].body).toContain('Legs');
    expect(plan[2].body).toContain('Push');
  });
  it("skips today once you've trained or the time has passed", () => {
    expect(new Date(planWorkoutReminders({ ...base, trainedToday: true })[0].at).getDay()).toBe(5);
    expect(new Date(planWorkoutReminders({ ...base, now: new Date(2026, 9, 21, 18, 0).getTime() })[0].at).getDay()).toBe(5);
  });
  it('greets by name and plans nothing without training days', () => {
    expect(planWorkoutReminders({ ...base, name: 'Alex' })[0].title).toBe('Time to train, Alex');
    expect(planWorkoutReminders({ ...base, trainingDays: [] })).toEqual([]);
  });
});

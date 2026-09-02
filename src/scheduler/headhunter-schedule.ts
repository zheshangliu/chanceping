import type { Schedule } from "./types";
import type { Scheduler } from "./scheduler";

export const HEADHUNTER_SCHEDULE_ID = "headhunter-weekly-radar";
export const HEADHUNTER_TIMEZONE = "Asia/Shanghai";

export function createHeadHunterWeeklySchedule(now = new Date()): Schedule {
  return {
    id: HEADHUNTER_SCHEDULE_ID,
    name: "维优猎头 BD 雷达周报",
    mode: "recurring",
    period: { id: `${HEADHUNTER_SCHEDULE_ID}-period`, time: "07:00", day_of_week: 1, job_type: "report", job_params: { vertical: "headhunter", timezone: HEADHUNTER_TIMEZONE, run_kind: "weekly_radar" }, enabled: true },
    created_at: now.toISOString(),
    enabled: true,
  };
}

export function registerHeadHunterWeeklySchedule(scheduler: Scheduler, now = new Date()): Schedule {
  const schedule = createHeadHunterWeeklySchedule(now);
  scheduler.addSchedule(schedule);
  return schedule;
}

export function isHeadHunterWeeklySchedule(schedule: Schedule): boolean {
  return schedule.id === HEADHUNTER_SCHEDULE_ID && schedule.period.day_of_week === 1 && schedule.period.time === "07:00" && schedule.period.job_params.timezone === HEADHUNTER_TIMEZONE;
}

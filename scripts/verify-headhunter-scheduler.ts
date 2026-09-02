import assert from "node:assert/strict";
import { createHeadHunterWeeklySchedule, isHeadHunterWeeklySchedule } from "../src/scheduler/headhunter-schedule";

const schedule = createHeadHunterWeeklySchedule(new Date("2026-09-02T00:00:00Z"));
assert.equal(schedule.mode, "recurring");
assert.equal(schedule.period.day_of_week, 1);
assert.equal(schedule.period.time, "07:00");
assert.equal(schedule.period.job_params.timezone, "Asia/Shanghai");
assert.equal(schedule.period.job_params.vertical, "headhunter");
assert.equal(isHeadHunterWeeklySchedule(schedule), true);
assert.equal(isHeadHunterWeeklySchedule({ ...schedule, period: { ...schedule.period, time: "08:00" } }), false);
console.log("headhunter scheduler verification: PASS");

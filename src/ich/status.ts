import type { IchOpportunity, IchOpportunityStatus } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

function dateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function calendarDaysBetween(fromDateKey: string, toDateKey: string): number {
  return Math.round((Date.parse(`${toDateKey}T00:00:00Z`) - Date.parse(`${fromDateKey}T00:00:00Z`)) / DAY_MS);
}

function validDate(value: string | null): Date | null {
  if (!value || /^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function computeIchOpportunityStatus(
  opportunity: Readonly<IchOpportunity>,
  now: Date,
): IchOpportunityStatus {
  if (opportunity.status === "cancelled" || opportunity.archive_reason === "cancelled") return "cancelled";

  const primarySource = opportunity.sources.find((source) => source.is_primary);
  if (primarySource?.is_accessible === false && opportunity.verification.needs_recheck) return "source_unavailable";

  const eventEnd = validDate(opportunity.dates.event_end_at);
  if (eventEnd && eventEnd.getTime() < now.getTime()) return "ended";

  const timeZone = opportunity.dates.timezone || "Asia/Shanghai";
  const deadlineText = opportunity.dates.deadline_at;
  const dateOnlyDeadline = deadlineText && /^\d{4}-\d{2}-\d{2}$/.test(deadlineText) ? deadlineText : null;
  const deadline = validDate(deadlineText);
  if (dateOnlyDeadline) {
    if (dateKeyInTimeZone(now, timeZone) > dateOnlyDeadline) return "expired";
  } else if (deadline && deadline.getTime() < now.getTime()) {
    return "expired";
  }

  if (
    opportunity.verification.verification_status === "pending_verification" ||
    opportunity.verification.verification_status === "conflicting" ||
    opportunity.verification.source_conflict ||
    opportunity.dates.date_status === "conflicting"
  ) return "pending_confirmation";

  const applicationStart = validDate(opportunity.dates.application_start_at);
  if (applicationStart && applicationStart.getTime() > now.getTime()) return "opening_soon";
  if (opportunity.dates.is_long_term) return "long_term";
  if (!deadlineText || opportunity.dates.date_status === "unknown") return "pending_confirmation";

  const daysRemaining = dateOnlyDeadline
    ? calendarDaysBetween(dateKeyInTimeZone(now, timeZone), dateOnlyDeadline)
    : Math.ceil(((deadline as Date).getTime() - now.getTime()) / DAY_MS);
  return daysRemaining <= 14 ? "closing_soon" : "active";
}

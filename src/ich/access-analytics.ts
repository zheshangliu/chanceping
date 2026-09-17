import fs from "fs";

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_TIME_ZONE = "Asia/Shanghai";
const BOT_PATTERN = /bot|crawler|spider|slurp|headless|lighthouse|curl|wget|python|monitor|uptime|preview/i;

interface AccessEntry {
  ip: string;
  occurredAt: Date;
  method: string;
  path: string;
  status: number;
  referrer: string;
  userAgent: string;
}

export interface IchAnalyticsDay {
  date: string;
  page_views: number;
  visitors: number;
}

export interface IchAccessAnalytics {
  generated_at: string;
  source_available: boolean;
  source: "nginx_access_log";
  measurement_note: string;
  today: { page_views: number; visitors: number };
  last_7_days: { page_views: number; visitors: number };
  daily: IchAnalyticsDay[];
  top_pages: Array<{ path: string; views: number }>;
  devices: { desktop: number; mobile: number; tablet: number };
  latest_seen_at: string | null;
}

export interface ReadIchAccessAnalyticsOptions {
  now?: Date;
  timeZone?: string;
  maxBytes?: number;
}

function parseNginxDate(value: string): Date | null {
  const match = value.match(/^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/);
  if (!match) return null;
  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const month = months[match[2]];
  if (month === undefined) return null;
  const offsetMinutes = (Number(match[8]) * 60 + Number(match[9])) * (match[7] === "+" ? 1 : -1);
  const utc = Date.UTC(Number(match[3]), month, Number(match[1]), Number(match[4]), Number(match[5]), Number(match[6]));
  const parsed = new Date(utc - offsetMinutes * 60_000);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseLine(line: string): AccessEntry | null {
  const match = line.match(/^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) ([^ ]+) [^"]*" (\d{3}) \S+ "([^"]*)" "([^"]*)"/);
  if (!match) return null;
  const occurredAt = parseNginxDate(match[2]);
  if (!occurredAt) return null;
  let pathname: string;
  try {
    pathname = new URL(match[4], "https://ich.chanceping.com").pathname;
  } catch {
    return null;
  }
  return {
    ip: match[1],
    occurredAt,
    method: match[3],
    path: pathname === "/ich/" ? "/ich" : pathname,
    status: Number(match[5]),
    referrer: match[6],
    userAgent: match[7],
  };
}

function dateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function recentDateKeys(now: Date, days: number, timeZone: string): string[] {
  return Array.from({ length: days }, (_, index) => dateKey(new Date(now.getTime() - (days - 1 - index) * 86_400_000), timeZone));
}

function isIchPage(entry: AccessEntry): boolean {
  if (entry.method !== "GET" || entry.status < 200 || entry.status >= 400) return false;
  if (!(entry.path === "/ich" || entry.path.startsWith("/ich/"))) return false;
  return !entry.path.startsWith("/ich/admin") &&
    !entry.path.startsWith("/ich/assets/") &&
    !["/ich/robots.txt", "/ich/sitemap.xml", "/ich/favicon.ico"].includes(entry.path) &&
    !BOT_PATTERN.test(entry.userAgent);
}

function deviceFor(userAgent: string): keyof IchAccessAnalytics["devices"] {
  if (/ipad|tablet|kindle/i.test(userAgent)) return "tablet";
  if (/mobile|iphone|android/i.test(userAgent)) return "mobile";
  return "desktop";
}

function emptyAnalytics(now: Date, timeZone: string, sourceAvailable: boolean): IchAccessAnalytics {
  return {
    generated_at: now.toISOString(),
    source_available: sourceAvailable,
    source: "nginx_access_log",
    measurement_note: "访问人数按 IP 与浏览器标识组合估算，已排除常见机器人及后台访问。",
    today: { page_views: 0, visitors: 0 },
    last_7_days: { page_views: 0, visitors: 0 },
    daily: recentDateKeys(now, 7, timeZone).map((date) => ({ date, page_views: 0, visitors: 0 })),
    top_pages: [],
    devices: { desktop: 0, mobile: 0, tablet: 0 },
    latest_seen_at: null,
  };
}

function readTail(filePath: string, maxBytes: number): string | null {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  const length = Math.min(stat.size, maxBytes);
  if (length === 0) return "";
  const descriptor = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    fs.readSync(descriptor, buffer, 0, length, stat.size - length);
    const value = buffer.toString("utf8");
    return stat.size > length ? value.slice(value.indexOf("\n") + 1) : value;
  } finally {
    fs.closeSync(descriptor);
  }
}

export function readIchAccessAnalytics(filePath: string, options: ReadIchAccessAnalyticsOptions = {}): IchAccessAnalytics {
  const now = options.now ?? new Date();
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  let content: string | null;
  try {
    content = readTail(filePath, options.maxBytes ?? DEFAULT_MAX_BYTES);
  } catch {
    return emptyAnalytics(now, timeZone, false);
  }
  if (content === null) return emptyAnalytics(now, timeZone, false);

  const result = emptyAnalytics(now, timeZone, true);
  const keys = recentDateKeys(now, 7, timeZone);
  const dayMap = new Map(keys.map((key) => [key, { views: 0, visitors: new Set<string>() }]));
  const pageCounts = new Map<string, number>();
  const sevenDayVisitors = new Set<string>();
  let latest: Date | null = null;

  for (const line of content.split("\n")) {
    const entry = parseLine(line);
    if (!entry || !isIchPage(entry)) continue;
    const key = dateKey(entry.occurredAt, timeZone);
    const day = dayMap.get(key);
    if (!day) continue;
    const visitor = `${entry.ip}\u0000${entry.userAgent}`;
    day.views += 1;
    day.visitors.add(visitor);
    sevenDayVisitors.add(visitor);
    pageCounts.set(entry.path, (pageCounts.get(entry.path) ?? 0) + 1);
    result.devices[deviceFor(entry.userAgent)] += 1;
    if (!latest || entry.occurredAt > latest) latest = entry.occurredAt;
  }

  result.daily = keys.map((date) => ({
    date,
    page_views: dayMap.get(date)?.views ?? 0,
    visitors: dayMap.get(date)?.visitors.size ?? 0,
  }));
  const today = result.daily[result.daily.length - 1];
  result.today = { page_views: today.page_views, visitors: today.visitors };
  result.last_7_days = {
    page_views: result.daily.reduce((total, item) => total + item.page_views, 0),
    visitors: sevenDayVisitors.size,
  };
  result.top_pages = [...pageCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([path, views]) => ({ path, views }));
  result.latest_seen_at = latest?.toISOString() ?? null;
  return result;
}

export function defaultIchAccessLogPath(): string {
  return process.env.CHANCEPING_ICH_ACCESS_LOG_PATH || "/var/log/nginx/access.log";
}

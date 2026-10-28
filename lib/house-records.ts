export type HouseKind = "filter" | "propane" | "electricity";
export type HouseRecord = {
  id: string; kind: HouseKind; date: string; label: string; cost: number | null;
  percentage: number | null; gallons: number | null; kwh: number | null;
  nextDue: string | null; notes: string; createdAt: string; updatedAt: string; addedBy: string; sourceUrl?: string;
};
export function validHouseDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}(-\d{2})?$/.test(value)) return false;
  const full = value.length === 7 ? `${value}-01` : value;
  const date = new Date(`${full}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === full;
}
export function houseMonthlyTotals(records: HouseRecord[], year: string) {
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    const rows = records.filter((record) => record.date.startsWith(month));
    const total = (kind: HouseKind) => rows.filter((row) => row.kind === kind && row.cost !== null).reduce((sum, row) => sum + (row.cost ?? 0), 0);
    const reading = rows.filter((row) => row.kind === "propane" && row.percentage !== null).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0];
    return { month, propane: total("propane"), electricity: total("electricity"), filters: total("filter"), percentage: reading?.percentage ?? null, count: rows.length };
  });
}
export type HouseMetric = "electricity" | "propane" | "percentage" | "kwh";
export function houseTrendValues(records: HouseRecord[], year: string, metric: HouseMetric) {
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    const kind = metric === "percentage" ? "propane" : metric === "kwh" ? "electricity" : metric;
    const field = metric === "percentage" ? "percentage" : metric === "kwh" ? "kwh" : "cost";
    const rows = records.filter((row) => row.kind === kind && row.date.startsWith(month) && row[field] !== null);
    if (!rows.length) return { month, value: null as number | null };
    const value = metric === "percentage" ? [...rows].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0].percentage! : rows.reduce((sum, row) => sum + (row[field] ?? 0), 0);
    return { month, value };
  });
}
export type MaintenanceReminder = {
  id: string; title: string; dueDate: string | null; repeatMonths: number; notes: string;
  completedAt: string | null; completions: string[]; updatedAt: string;
};
export function houseDateToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (name: string) => parts.find((row) => row.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function nextMaintenanceDate(date: string, months: number) {
  const [year, month, day] = date.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1 + months, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

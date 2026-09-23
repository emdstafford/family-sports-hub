"use client";

import { useEffect, useMemo, useState } from "react";

type TableRow = {
  position: number;
  team: string;
  abbreviation?: string;
  logo?: string;
  [key: string]: string | number | undefined;
};

type StandingsData = {
  id: string;
  title: string;
  subtitle: string;
  kind: string;
  columns: Array<{ key: string; label: string }>;
  groups: Array<{ name: string; rows: TableRow[] }>;
};

const COMPETITIONS = [
  { id: "premier-league", label: "Premier League", icon: "⚽" },
  { id: "champions-league", label: "Champions League", icon: "🌟" },
  { id: "league-one", label: "League One", icon: "⚽" },
  { id: "college-football", label: "College Football", icon: "🏈" },
  { id: "college-basketball", label: "College Basketball", icon: "🏀" },
  { id: "volleyball", label: "Volleyball", icon: "🏐" },
  { id: "nhl", label: "NHL", icon: "🏒" },
  { id: "mlb", label: "MLB", icon: "⚾" },
];

const FAMILY_TEAM_NAMES = [
  "arsenal",
  "aston villa",
  "liverpool",
  "afc wimbledon",
  "wimbledon",
  "vancouver canucks",
  "kentucky",
  "georgia",
  "atlanta braves",
  "chicago cubs",
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export default function StandingsHub({ favoriteTeamNames }: { favoriteTeamNames: string[] }) {
  const [competition, setCompetition] = useState("premier-league");
  const [data, setData] = useState<StandingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/standings?competition=${encodeURIComponent(competition)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error ?? "Could not load standings.");
        return body as StandingsData;
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load standings.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [competition]);

  const watchedNames = useMemo(
    () => [...new Set([...FAMILY_TEAM_NAMES, ...favoriteTeamNames.map(normalize)])],
    [favoriteTeamNames],
  );

  const isFamilyTeam = (team: string) => {
    const normalized = normalize(team);
    return watchedNames.some((name) => normalized === name || normalized.includes(name));
  };

  const familyRows = data
    ? data.groups.flatMap((group) =>
        group.rows.filter((row) => isFamilyTeam(row.team)).map((row) => ({ ...row, group: group.name })),
      )
    : [];

  const renderRow = (row: TableRow, compact = false) => (
    <div
      key={`${row.team}-${row.position}-${compact ? "watch" : "table"}`}
      className={`grid min-w-[560px] items-center border-b border-slate-100 px-3 py-2 last:border-b-0 ${
        isFamilyTeam(row.team) ? "bg-[#fff7dc]" : "bg-white"
      }`}
      style={{ gridTemplateColumns: `38px minmax(180px, 1fr) repeat(${data?.columns.length ?? 0}, 54px)` }}
    >
      <div className="text-center text-xs font-black text-slate-500">{row.position}</div>
      <div className="flex min-w-0 items-center gap-2 pr-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50">
          {row.logo ? <img src={row.logo} alt="" className="h-7 w-7 object-contain" /> : <span>🏅</span>}
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs font-black text-[#10254a]">{row.team}</div>
          {compact && row.group && <div className="truncate text-[8px] font-bold uppercase text-slate-400">{row.group}</div>}
        </div>
      </div>
      {data?.columns.map((column) => (
        <div key={column.key} className={`text-center text-xs ${column.key === "points" ? "font-black text-[#10254a]" : "font-bold text-slate-600"}`}>
          {row[column.key] ?? "—"}
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {COMPETITIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setCompetition(item.id)}
            className={`shrink-0 rounded-full px-3 py-2 text-[10px] font-black ${
              competition === item.id ? "bg-[#06284a] text-white" : "bg-white text-[#10254a] shadow-sm"
            }`}
          >
            {item.icon} {item.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="rounded-2xl bg-white p-8 text-center text-xs font-black text-slate-500 shadow-sm">
          Loading the latest table…
        </div>
      )}

      {error && !loading && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center text-xs font-bold text-red-700">
          {error}
        </div>
      )}

      {data && !loading && !error && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-[#06284a] p-4 text-white shadow-sm">
            <div className="text-[9px] font-black uppercase tracking-[0.18em] text-[#f3c64f]">Latest table</div>
            <div className="mt-1 text-xl font-black">{data.title}</div>
            <div className="mt-1 text-[10px] font-semibold text-blue-100">{data.subtitle}</div>
          </div>

          {familyRows.length > 0 && (
            <section className="overflow-hidden rounded-2xl border-2 border-[#f3c64f] bg-white shadow-sm">
              <div className="bg-[#fff7dc] px-4 py-3">
                <div className="text-[9px] font-black uppercase tracking-[0.16em] text-[#9b7011]">💙 Family Watch</div>
                <div className="mt-0.5 text-sm font-black text-[#10254a]">Your teams at a glance</div>
              </div>
              <div className="overflow-x-auto">
                {familyRows.map((row) => renderRow(row, true))}
              </div>
            </section>
          )}

          {data.groups.map((group) => (
            <section key={group.name} className="overflow-hidden rounded-2xl bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-3 text-sm font-black text-[#10254a]">{group.name}</div>
              <div className="overflow-x-auto">
                <div
                  className="grid min-w-[560px] bg-slate-50 px-3 py-2 text-[8px] font-black uppercase text-slate-400"
                  style={{ gridTemplateColumns: `38px minmax(180px, 1fr) repeat(${data.columns.length}, 54px)` }}
                >
                  <div className="text-center">#</div>
                  <div>Team</div>
                  {data.columns.map((column) => <div key={column.key} className="text-center">{column.label}</div>)}
                </div>
                {group.rows.map((row) => renderRow(row))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

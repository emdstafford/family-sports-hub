"use client";

import { useEffect, useState } from "react";

type Weather = { location: string; temperature: number; feelsLike: number; humidity: number; wind: number; code: number; high: number; low: number; rainChance: number | null; updatedAt: string };

function describe(code: number) {
  if (code === 0) return ["Sunny", "☀️"];
  if ([1, 2].includes(code)) return ["Partly cloudy", "🌤️"];
  if (code === 3) return ["Cloudy", "☁️"];
  if ([45, 48].includes(code)) return ["Foggy", "🌫️"];
  if ([51, 53, 55, 56, 57].includes(code)) return ["Drizzle", "🌦️"];
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return ["Rain", "🌧️"];
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ["Snow", "🌨️"];
  if ([95, 96, 99].includes(code)) return ["Thunderstorms", "⛈️"];
  return ["Current conditions", "🌡️"];
}

export default function NorthGeorgiaWeatherCard() {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    fetch("/api/weather", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Weather is unavailable.");
      return response.json();
    }).then((data: Weather) => { if (active) setWeather(data); }).catch(() => { if (active) setWeather(null); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const [description, icon] = weather ? describe(weather.code) : ["", ""];
  return <article className="flex flex-col justify-between rounded-2xl border border-[#d7e5ef] bg-gradient-to-br from-[#f1f8fc] to-white p-4 shadow-sm">
    <div>
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#47718e]">Weather around home</div>
      <h2 className="mt-1 text-lg font-black text-[#10254a]">Blairsville, Georgia</h2>
      {loading ? <p className="mt-3 text-sm font-semibold text-slate-500">Checking current conditions…</p>
        : weather ? <div className="mt-2 flex items-center gap-3">
          <div className="text-4xl" aria-hidden="true">{icon}</div>
          <div><div className="text-3xl font-black text-[#10254a]">{weather.temperature}°</div><div className="text-sm font-bold text-slate-600">{description} · feels like {weather.feelsLike}°</div></div>
        </div> : <p className="mt-3 text-sm font-semibold text-slate-500">Quick conditions aren’t available right now.</p>}
      {weather && <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-slate-600"><span>H {weather.high}° / L {weather.low}°</span>{weather.rainChance !== null && <span>Rain {weather.rainChance}%</span>}<span>Wind {weather.wind} mph</span></div>}
      <p className="mt-2 text-[10px] font-medium text-slate-400">Quick snapshot from Open-Meteo</p>
    </div>
    <a href="https://apps.apple.com/us/app/north-georgia-majestic-weather/id6759932925" target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#10254a] px-3 text-center text-xs font-black text-white">Open North Georgia Majestic Weather ↗</a>
  </article>;
}

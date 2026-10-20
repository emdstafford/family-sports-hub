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
  return <details className="group rounded-2xl border border-[#d7e5ef] bg-gradient-to-br from-[#f1f8fc] to-white p-4 shadow-sm">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
      <span className="min-w-0"><span className="block text-[10px] font-black uppercase tracking-[0.18em] text-[#47718e]">Weather around home · Blairsville</span>
        {weather ? <span className="mt-1 flex items-center gap-2 text-base font-black text-[#10254a]"><span aria-hidden="true">{icon}</span>{weather.temperature}° <span className="truncate text-xs font-bold text-slate-600">{description}</span></span> : <span className="mt-1 block text-sm font-semibold text-slate-500">{loading ? "Checking current conditions…" : "Conditions unavailable"}</span>}
      </span>
      <span aria-hidden="true" className="text-lg text-[#10254a] transition-transform group-open:rotate-180">⌄</span>
    </summary>
    {weather && <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-[#d7e5ef] pt-3 text-xs font-bold text-slate-600"><span>Feels like {weather.feelsLike}°</span><span>H {weather.high}° / L {weather.low}°</span>{weather.rainChance !== null && <span>Rain {weather.rainChance}%</span>}<span>Wind {weather.wind} mph</span><span className="w-full text-[10px] font-medium text-slate-400">Quick snapshot from Open-Meteo</span></div>}
  </details>;
}

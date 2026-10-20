import { NextResponse } from "next/server";

export async function GET() {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({
      latitude: "34.8762",
      longitude: "-83.9582",
      current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      temperature_unit: "fahrenheit",
      wind_speed_unit: "mph",
      precipitation_unit: "inch",
      timezone: "America/New_York",
      forecast_days: "1",
    }).toString();
    const response = await fetch(url, { next: { revalidate: 1800 } });
    if (!response.ok) throw new Error(`Weather provider returned ${response.status}.`);
    const data = await response.json();
    return NextResponse.json({
      location: "Blairsville, GA",
      temperature: Math.round(data.current.temperature_2m),
      feelsLike: Math.round(data.current.apparent_temperature),
      humidity: Math.round(data.current.relative_humidity_2m),
      wind: Math.round(data.current.wind_speed_10m),
      code: data.current.weather_code,
      high: Math.round(data.daily.temperature_2m_max[0]),
      low: Math.round(data.daily.temperature_2m_min[0]),
      rainChance: data.daily.precipitation_probability_max[0],
      updatedAt: data.current.time,
    }, { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" } });
  } catch (error) {
    console.error("Weather GET failed:", error);
    return NextResponse.json({ error: "Weather is temporarily unavailable." }, { status: 502 });
  }
}

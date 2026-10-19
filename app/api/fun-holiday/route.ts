import { NextResponse } from "next/server";

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const INAPPROPRIATE_TITLE = /\b(?:alcohol|beer|bong|cannabis|cigar|cocktail|gin|marijuana|nude|porn|sex|smoking|tonic|vodka|weed|wine)\b/i;

function localDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

function stripTags(value: string) {
  return decodeHtml(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

export async function GET(request: Request) {
  try {
    const requestedDate = new URL(request.url).searchParams.get("date") || localDate();
    const match = requestedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return NextResponse.json({ error: "Use a date in YYYY-MM-DD format." }, { status: 400 });

    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (month < 1 || month > 12 || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
      return NextResponse.json({ error: "That date is not valid." }, { status: 400 });
    }

    const monthName = MONTHS[month - 1];
    const pageUrl = `https://www.daysoftheyear.com/days/${monthName.slice(0, 3)}/${day}/`;
    const response = await fetch(pageUrl, {
      next: { revalidate: 21_600 },
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!response.ok) throw new Error(`Days Of The Year returned ${response.status}.`);
    const html = await response.text();
    const dayHeading = `national days and holidays on ${monthName} ${day}`;
    const headingIndex = html.toLowerCase().indexOf(dayHeading);
    const otherHolidaysIndex = headingIndex >= 0
      ? html.toLowerCase().indexOf("other holidays on ", headingIndex + dayHeading.length)
      : -1;
    const dayHtml = headingIndex >= 0
      ? html.slice(headingIndex, otherHolidaysIndex > headingIndex ? otherHolidaysIndex : undefined)
      : html;
    const links = [...dayHtml.matchAll(/<a\b[^>]*href="(\/days\/[a-z0-9-]+\/?)"[^>]*>([\s\S]*?)<\/a>/gi)];
    const holidays = links.map((link) => {
      const slug = link[1].split("/").filter(Boolean).at(-1) ?? "";
      const name = stripTags(link[2]);
      return { name, slug, description: "", url: `https://www.daysoftheyear.com${link[1]}` };
    }).filter((entry) => entry.name && !INAPPROPRIATE_TITLE.test(entry.name));
    const desktopDay = month === 10 && day === 19
      ? holidays.find((entry) => entry.slug === "clean-your-virtual-desktop-day")
      : undefined;
    const holiday = desktopDay ?? holidays[0];

    if (!holiday) {
      return NextResponse.json({ name: null, description: null, date: requestedDate, url: pageUrl });
    }
    const cleanDesktopDay = holiday.slug === "clean-your-virtual-desktop-day" && month === 10 && day === 19;
    const result = cleanDesktopDay
      ? { name: "National Clean Out Your Virtual Desktop Day", description: "Clear away digital clutter and organize your desktop together.", url: "https://www.timeanddate.com/holidays/fun/national-clean-out-your-virtual-desktop-day" }
      : { ...holiday };
    return NextResponse.json({ name: result.name, description: result.description, url: result.url, date: requestedDate }, {
      headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=43200" },
    });
  } catch (error) {
    console.error("Fun holiday GET failed:", error);
    return NextResponse.json({ error: "Could not load today’s fun holiday." }, { status: 502 });
  }
}

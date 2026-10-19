import { NextResponse } from "next/server";

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const INAPPROPRIATE_TITLE = /\b(?:alcohol|beer|bong|cannabis|cigar|cocktail|marijuana|nude|porn|sex|smoking|vodka|weed|wine)\b/i;

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
    const pageUrl = `https://www.timeanddate.com/holidays/fun/${monthName}/${day}/`;
    const response = await fetch(pageUrl, {
      next: { revalidate: 21_600 },
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!response.ok) throw new Error(`Timeanddate returned ${response.status}.`);
    const html = await response.text();
    const links = [...html.matchAll(/<a\b[^>]*href="(\/holidays\/fun\/[^"/?#]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
    const holiday = links.map((link) => {
      const slug = link[1].split("/").filter(Boolean).at(-1) ?? "";
      const name = slug.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
      const linkText = stripTags(link[2]);
      const description = linkText.replace(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "").trim();
      return { name, description, url: `https://www.timeanddate.com${link[1]}` };
    }).find((entry) => entry.name && !INAPPROPRIATE_TITLE.test(entry.name));

    if (!holiday) {
      return NextResponse.json({ name: null, description: null, date: requestedDate, url: pageUrl });
    }
    return NextResponse.json({ ...holiday, date: requestedDate }, {
      headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=43200" },
    });
  } catch (error) {
    console.error("Fun holiday GET failed:", error);
    return NextResponse.json({ error: "Could not load today’s fun holiday." }, { status: 502 });
  }
}

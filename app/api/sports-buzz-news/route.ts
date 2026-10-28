import { NextResponse } from "next/server";

type Story = { title: string; link: string; source: string; publishedAt: string; topic: string };
const feeds = [
  { topic: "Arsenal", q: "Arsenal FC match result cup upset" },
  { topic: "Aston Villa", q: "Aston Villa FC match result" },
  { topic: "Liverpool", q: "Liverpool FC match result" },
  { topic: "AFC Wimbledon", q: "AFC Wimbledon match result" },
  { topic: "Kentucky Wildcats", q: "\"Kentucky Wildcats\" football basketball volleyball -\"Western Kentucky\" -WKU" },
  { topic: "Cinderella Watch", q: "FA Cup non league giant killing upset lower league" },
  { topic: "Canucks", q: "Vancouver Canucks game result" },
  { topic: "Braves", q: "Atlanta Braves baseball game" },
];
function decode(s: string) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}
function field(xml: string, tag: string) {
  const m = xml.match(new RegExp("<" + tag + "(?:\s[^>]*)?>([\s\S]*?)<\/" + tag + ">", "i"));
  return m ? decode(m[1]).trim() : "";
}
export async function GET() {
  const settled = await Promise.allSettled(feeds.map(async ({ topic, q }) => {
    const url = "https://news.google.com/rss/search?q=" + encodeURIComponent(q + " when:7d") + "&hl=en-US&gl=US&ceid=US:en";
    const response = await fetch(url, { next: { revalidate: 900 }, signal: AbortSignal.timeout(9000) });
    if (!response.ok) throw new Error("Feed unavailable");
    const xml = await response.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 5).map(m => {
      const item = m[1];
      const title = field(item, "title").replace(/\s+-\s+[^-]+$/, "");
      const link = field(item, "link");
      const source = field(item, "source") || "Google News";
      const publishedAt = field(item, "pubDate");
      if (!title || !/^https:\/\//.test(link) || !Number.isFinite(Date.parse(publishedAt))) return null;
      return { title, link, source, publishedAt, topic };
    }).filter((s): s is Story => s !== null);
  }));
  const seen = new Set<string>();
  const stories = settled.flatMap(r => r.status === "fulfilled" ? r.value : [])
    .filter(s => !/western kentucky|\bWKU\b|hilltoppers/i.test(s.title))
    .filter(s => { const key = s.title.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; })
    .sort((a,b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 24);
  return NextResponse.json({ stories, updatedAt: new Date().toISOString(), available: settled.some(r => r.status === "fulfilled") });
}

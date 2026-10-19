import { NextResponse } from "next/server";

function decodeXml(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();
}
function plainText(value: string) {
  return decodeXml(value).replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;|&#\d+;|&#x[\da-f]+;/gi, " ").replace(/\s+/g, " ").trim();
}
function field(xml: string, name: string) {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

export async function GET(request: Request) {
  try {
    // Reading the requested date keeps this live feed endpoint request-time rendered.
    const requestedDate = new URL(request.url).searchParams.get("date");
    const response = await fetch("https://www.merriam-webster.com/wotd/feed/rss2", { cache: "no-store", headers: { "user-agent": "FamBam Hub word-of-day card" } });
    if (!response.ok) throw new Error(`Merriam-Webster feed returned ${response.status}.`);
    const xml = await response.text();
    const items = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((match) => {
      const itemXml = match[1];
      const title = field(itemXml, "title");
      const titleText = plainText(title).replace(/^(?:the\s+)?(?:merriam-webster'?s?\s+)?word of the day(?:\s+is)?\s*:?\s*/i, "");
      const word = titleText.match(/^[\p{L}][\p{L}'’-]*/u)?.[0];
      const shortDefinition = plainText(field(itemXml, "shortdef"));
      const description = plainText(field(itemXml, "description"));
      const definition = shortDefinition || description;
      return { title, link: field(itemXml, "link"), date: field(itemXml, "pubDate"), word, definition };
    }).filter((item) => item.word);
    if (!items.length) throw new Error("The Merriam-Webster feed did not include a word.");

    // Merriam-Webster's feed is newest-first, so the first item is today's word.
    const selected = items[0];
    return NextResponse.json({ word: selected.word, definition: selected.definition, date: requestedDate || selected.date, url: selected.link || "https://www.merriam-webster.com/word-of-the-day" });
  } catch (error) {
    console.error("Merriam-Webster word-of-day failed:", error);
    return NextResponse.json({ error: "Could not load Merriam-Webster’s word today." }, { status: 502 });
  }
}

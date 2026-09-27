"use client";

import Link from "next/link";

export default function HubLauncher() {
  return (
    <Link
      href="/gifts"
      className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-violet-700 px-4 py-3 text-sm font-black text-white shadow-xl transition active:scale-95"
      aria-label="Open FamBam Gifts and Birthdays"
    >
      <span aria-hidden>🎁</span>
      <span>Gifts</span>
    </Link>
  );
}

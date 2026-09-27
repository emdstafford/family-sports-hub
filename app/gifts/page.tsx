"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import GiftManager from "@/components/gift-manager";

const birthdays = [
  { name: "Lydia", month: 12, day: 4, date: "December 4" },
  { name: "Granny B", month: 2, day: 12, date: "February 12" },
  { name: "Emily", month: 2, day: 17, date: "February 17" },
  { name: "Kayla", month: 6, day: 12, date: "June 12" },
  { name: "Hazel", month: 6, day: 22, date: "June 22" },
];

type UpcomingBirthday = (typeof birthdays)[number] & { days: number };

function getUpcomingBirthdays(): UpcomingBirthday[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return birthdays
    .map((birthday) => {
      let target = new Date(now.getFullYear(), birthday.month - 1, birthday.day);
      if (target < today) {
        target = new Date(now.getFullYear() + 1, birthday.month - 1, birthday.day);
      }

      return {
        ...birthday,
        days: Math.ceil((target.getTime() - today.getTime()) / 86400000),
      };
    })
    .sort((a, b) => a.days - b.days);
}

export default function GiftsPage() {
  const [upcoming, setUpcoming] = useState<UpcomingBirthday[]>([]);

  useEffect(() => {
    setUpcoming(getUpcomingBirthdays());
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 pb-24 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-slate-600">← Sports</Link>
          <div className="text-center">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-violet-600">FamBam Hub</div>
            <h1 className="text-lg font-black">Gifts & Birthdays</h1>
          </div>
          <div className="w-14" />
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-5 p-4">
        <section className="rounded-3xl bg-gradient-to-br from-violet-700 to-fuchsia-600 p-6 text-white shadow-lg">
          <div className="text-sm font-bold uppercase tracking-wider text-violet-100">🎄 Christmas 2026</div>
          <h2 className="mt-2 text-3xl font-black">Christmas shopping starts here</h2>
          <p className="mt-2 max-w-xl text-sm text-violet-100">
            Wishlists, private gift planning, budgets, purchased gifts and wrapped gifts — without spoiling anyone&apos;s surprises.
          </p>
          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            {["💡 Ideas", "📦 Bought", "🎀 Wrapped"].map((label) => (
              <div key={label} className="rounded-2xl bg-white/15 px-2 py-3 text-xs font-bold">{label}</div>
            ))}
          </div>
        </section>

        <GiftManager />

        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-violet-600">Coming up</div>
              <h2 className="text-2xl font-black">🎂 Birthdays</h2>
            </div>
            <span className="text-xs font-semibold text-slate-500">Everyone sees these</span>
          </div>
          <div className="space-y-3">
            {upcoming.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-500 shadow-sm">
                Loading birthday countdowns…
              </div>
            ) : (
              upcoming.map((birthday) => (
                <article key={birthday.name} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-black">{birthday.name}</h3>
                      <p className="text-sm text-slate-500">{birthday.date}</p>
                    </div>
                    <div className="rounded-2xl bg-violet-50 px-3 py-2 text-right">
                      <div className="text-xl font-black text-violet-700">{birthday.days}</div>
                      <div className="text-[10px] font-bold uppercase text-violet-500">days</div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold">🎁 Wishlist</button>
                    <button className="rounded-xl bg-violet-100 px-3 py-2 text-sm font-bold text-violet-800">💌 Birthday Wall</button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-dashed border-violet-300 bg-violet-50 p-4">
          <h2 className="font-black text-violet-900">🔒 Surprise-safe shopping</h2>
          <p className="mt-1 text-sm text-violet-800">
            Birthday people can see their wishlist and celebration countdown, but claims, purchases, budgets, wrapping status and early Birthday Wall messages stay hidden from them.
          </p>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-lg font-black">Coming to FamBam</h2>
          <p className="mt-1 text-sm text-slate-600">
            ❤️ Our Year reflections and ⏳ Time Capsules will live in Memories after Gifts & Birthdays are settled.
          </p>
        </section>
      </div>
    </main>
  );
}

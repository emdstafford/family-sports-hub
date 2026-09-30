"use client";

import { useEffect, useRef } from "react";

const REOPEN_KEY = "fambam_reopen_challenge_after_refresh";

function isChallengeButton(button: HTMLButtonElement) {
  // The bottom-nav button contains separate emoji + label spans, so its
  // textContent is "🎯Challenge", not exactly "Challenge".
  // Match the visible label instead of requiring an exact textContent value.
  return button.textContent?.includes("Challenge") === true;
}

export default function ChallengeAutoRefresh() {
  const refreshingRef = useRef(false);
  const skipNextChallengeClickRef = useRef(false);

  useEffect(() => {
    function findChallengeButton() {
      return Array.from(document.querySelectorAll("button")).find(
        (button) => isChallengeButton(button),
      ) as HTMLButtonElement | undefined;
    }

    function reopenChallenge() {
      if (window.sessionStorage.getItem(REOPEN_KEY) !== "1") return false;

      const button = findChallengeButton();
      if (!button) return false;

      window.sessionStorage.removeItem(REOPEN_KEY);
      skipNextChallengeClickRef.current = true;
      button.click();
      return true;
    }

    if (!reopenChallenge()) {
      const observer = new MutationObserver(() => {
        if (reopenChallenge()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      window.setTimeout(() => observer.disconnect(), 10000);
    }

    async function handleClick(event: MouseEvent) {
      const button = (event.target as HTMLElement | null)?.closest("button") as HTMLButtonElement | null;
      if (!button || !isChallengeButton(button)) return;

      if (skipNextChallengeClickRef.current) {
        skipNextChallengeClickRef.current = false;
        return;
      }

      if (refreshingRef.current) return;

      const playerId = window.localStorage.getItem("fambam_player_id")?.trim();
      const sessionToken = window.localStorage.getItem("fambam_session_token")?.trim();
      if (!playerId || !sessionToken) return;

      refreshingRef.current = true;

      try {
        const response = await fetch("/api/challenge/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId, sessionToken }),
          cache: "no-store",
        });

        // A 409 means someone has already picked. The Challenge is locked,
        // so simply keep the currently displayed card.
        if (response.status === 409) return;

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          console.error("Challenge refresh failed:", data?.error ?? response.statusText, data?.details ?? "");
          return;
        }

        // The Challenge games are part of the page's initial data load.
        // Reload once after a successful rebuild, then reopen Challenge.
        window.sessionStorage.setItem(REOPEN_KEY, "1");
        window.location.reload();
      } catch (error) {
        console.error("Challenge refresh failed:", error);
      } finally {
        refreshingRef.current = false;
      }
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  return null;
}

"use client";

import { useEffect, useRef } from "react";

const REOPEN_KEY = "fambam_reopen_challenge_after_refresh_v2";
const ATTEMPT_KEY = "fambam_challenge_refresh_attempt_v5";

function isChallengeButton(button: HTMLButtonElement) {
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

    async function refreshChallenge(options?: { reopen?: boolean; force?: boolean }) {
      if (refreshingRef.current) return;
      const playerId = window.localStorage.getItem("fambam_player_id")?.trim();
      const sessionToken = window.localStorage.getItem("fambam_session_token")?.trim();
      if (!playerId || !sessionToken) return;
      if (!options?.force && window.sessionStorage.getItem(ATTEMPT_KEY) === "1") return;
      window.sessionStorage.setItem(ATTEMPT_KEY, "1");
      refreshingRef.current = true;

      try {
        const response = await fetch("/api/challenge/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId, sessionToken }),
          cache: "no-store",
        });
        if (response.status === 409) return;
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          console.error("Challenge refresh failed:", data?.error ?? response.statusText, data?.details ?? "");
          window.sessionStorage.removeItem(ATTEMPT_KEY);
          return;
        }
        if (options?.reopen) window.sessionStorage.setItem(REOPEN_KEY, "1");
        window.location.reload();
      } catch (error) {
        console.error("Challenge refresh failed:", error);
        window.sessionStorage.removeItem(ATTEMPT_KEY);
      } finally {
        refreshingRef.current = false;
      }
    }

    const automaticTimer = window.setTimeout(() => {
      void refreshChallenge();
    }, 1200);

    async function handleClick(event: MouseEvent) {
      const button = (event.target as HTMLElement | null)?.closest("button") as HTMLButtonElement | null;
      if (!button || !isChallengeButton(button)) return;
      if (skipNextChallengeClickRef.current) {
        skipNextChallengeClickRef.current = false;
        return;
      }
      await refreshChallenge({ reopen: true, force: true });
    }

    document.addEventListener("click", handleClick, true);
    return () => {
      window.clearTimeout(automaticTimer);
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  return null;
}

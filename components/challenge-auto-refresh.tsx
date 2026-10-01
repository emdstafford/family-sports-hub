"use client";

import { useEffect, useRef } from "react";

const REOPEN_KEY = "fambam_reopen_challenge_after_refresh_v2";
const ATTEMPT_KEY = "fambam_challenge_refresh_attempt_v6";

function isChallengeButton(button: HTMLButtonElement) {
  return button.textContent?.includes("Challenge") === true;
}

export default function ChallengeAutoRefresh() {
  const refreshingRef = useRef(false);
  const skipNextChallengeClickRef = useRef(false);

  useEffect(() => {
    let stopped = false;

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
      if (refreshingRef.current || stopped) return false;
      const playerId = window.localStorage.getItem("fambam_player_id")?.trim();
      const sessionToken = window.localStorage.getItem("fambam_session_token")?.trim();
      if (!playerId || !sessionToken) return false;
      if (!options?.force && window.sessionStorage.getItem(ATTEMPT_KEY) === "done") return true;

      refreshingRef.current = true;
      try {
        const response = await fetch("/api/challenge/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId, sessionToken }),
          cache: "no-store",
        });

        if (response.status === 409) {
          window.sessionStorage.setItem(ATTEMPT_KEY, "done");
          return true;
        }

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          console.error("Challenge refresh failed:", data?.error ?? response.statusText, data?.details ?? "");
          return false;
        }

        window.sessionStorage.setItem(ATTEMPT_KEY, "done");
        if (options?.reopen) window.sessionStorage.setItem(REOPEN_KEY, "1");
        window.location.reload();
        return true;
      } catch (error) {
        console.error("Challenge refresh failed:", error);
        return false;
      } finally {
        refreshingRef.current = false;
      }
    }

    // The player/session can be restored after the root layout mounts. Keep checking
    // briefly instead of giving up after one early attempt with missing credentials.
    let tries = 0;
    const automaticTimer = window.setInterval(() => {
      tries += 1;
      void refreshChallenge().then((finished) => {
        if (finished || tries >= 20) window.clearInterval(automaticTimer);
      });
    }, 750);

    function handleStorage(event: StorageEvent) {
      if (event.key === "fambam_player_id" || event.key === "fambam_session_token") {
        void refreshChallenge();
      }
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") void refreshChallenge();
    }

    async function handleClick(event: MouseEvent) {
      const button = (event.target as HTMLElement | null)?.closest("button") as HTMLButtonElement | null;
      if (!button || !isChallengeButton(button)) return;
      if (skipNextChallengeClickRef.current) {
        skipNextChallengeClickRef.current = false;
        return;
      }
      await refreshChallenge({ reopen: true, force: true });
    }

    window.addEventListener("storage", handleStorage);
    document.addEventListener("visibilitychange", handleVisibility);
    document.addEventListener("click", handleClick, true);

    return () => {
      stopped = true;
      window.clearInterval(automaticTimer);
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener("visibilitychange", handleVisibility);
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  return null;
}

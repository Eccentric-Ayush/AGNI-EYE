"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { TriageItem } from "@/lib/pipeline/types";

export type TriageState = "ack" | "dismissed";

/**
 * Local fallback store, keyed by the stable triage key ("<date>|<cell>").
 * Used when the shared (database) status is unavailable or the analyst key is missing/rejected.
 */
const KEY = "agni.triage.v2";
const listeners = new Set<() => void>();
let memory: string | null = null; // keeps state working when localStorage is unavailable

function snapshot(): string {
  if (memory !== null) return memory;
  try {
    return window.localStorage.getItem(KEY) ?? "{}";
  } catch {
    return "{}";
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function saveLocal(next: Record<string, TriageState>) {
  memory = JSON.stringify(next);
  try {
    window.localStorage.setItem(KEY, memory);
  } catch {
    /* storage blocked (private window etc.) — status lives in memory for this session */
  }
  listeners.forEach((l) => l());
}

function readLocal(): Record<string, TriageState> {
  try {
    return JSON.parse(snapshot()) as Record<string, TriageState>;
  } catch {
    return {};
  }
}

/* Analyst key: kept for this browser tab only (sessionStorage), never persisted or logged. */
const AK = "agni.analystKey";
let akMemory: string | null = null;
const akListeners = new Set<() => void>();
const akSnapshot = (): string | null => {
  if (akMemory !== null) return akMemory || null;
  try {
    return window.sessionStorage.getItem(AK);
  } catch {
    return null;
  }
};
const akSubscribe = (cb: () => void) => {
  akListeners.add(cb);
  return () => void akListeners.delete(cb);
};
function setAnalystKey(k: string | null) {
  akMemory = k ?? "";
  try {
    if (k) window.sessionStorage.setItem(AK, k);
    else window.sessionStorage.removeItem(AK);
  } catch {
    /* memory only */
  }
  akListeners.forEach((l) => l());
}

/**
 * Acknowledge / dismiss / reopen triage items.
 *  - When the database is available (`sharedAvailable`), the decision is written to the server
 *    (PATCH /api/triage) so every analyst sees it. The server needs the analyst key when configured.
 *  - Otherwise, or if the key is missing/rejected, it is saved in this browser only, and the UI says so.
 */
export function useTriageActions(sharedAvailable: boolean) {
  const qc = useQueryClient();
  const localRaw = useSyncExternalStore(subscribe, snapshot, () => "{}");
  const analystKey = useSyncExternalStore(akSubscribe, akSnapshot, () => null);
  const [needsKey, setNeedsKey] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const local = (() => {
    try {
      return JSON.parse(localRaw) as Record<string, TriageState>;
    } catch {
      return {};
    }
  })();

  /** Server status wins when it is not "open"; otherwise fall back to this browser's own decision. */
  const statusOf = useCallback(
    (t: TriageItem): TriageState | null => (t.status && t.status !== "open" ? t.status : local[t.key] ?? null),
    [local]
  );

  const setStatus = useCallback(
    async (t: TriageItem, state: TriageState | null): Promise<"shared" | "local"> => {
      if (sharedAvailable) {
        try {
          const headers: Record<string, string> = { "content-type": "application/json" };
          if (analystKey) headers["x-admin-secret"] = analystKey;
          const res = await fetch("/api/triage", { method: "PATCH", headers, body: JSON.stringify({ key: t.key, status: state ?? "open" }) });
          if (res.ok) {
            const next = readLocal();
            delete next[t.key];
            saveLocal(next);
            setNeedsKey(false);
            setNotice(null);
            await qc.invalidateQueries({ queryKey: ["agni", "triage"] });
            return "shared";
          }
          if (res.status === 401 || res.status === 403) {
            setNeedsKey(true);
            if (analystKey) setAnalystKey(null);
            setNotice("The shared list needs the analyst key. Saved in this browser only for now.");
          } else {
            setNotice(`The server answered ${res.status}. Saved in this browser only.`);
          }
        } catch {
          setNotice("Could not reach the server. Saved in this browser only.");
        }
      }
      const next = readLocal();
      if (state) next[t.key] = state;
      else delete next[t.key];
      saveLocal(next);
      return "local";
    },
    [sharedAvailable, analystKey, qc]
  );

  return {
    statusOf,
    setStatus,
    needsKey,
    notice,
    hasKey: !!analystKey,
    saveKey: (k: string) => {
      setAnalystKey(k.trim() || null);
      setNeedsKey(false);
      setNotice(null);
    },
  };
}

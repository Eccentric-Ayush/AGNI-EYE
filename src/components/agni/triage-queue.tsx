"use client";

import { useState } from "react";
import { Check, Undo2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, useTriage } from "@/hooks/use-agni";
import type { TriageItem } from "@/lib/pipeline/types";
import { ClassGlyph } from "./class-glyph";
import { CONFIDENCE_LABEL, SITE_CATEGORY_LABEL } from "./class-meta";
import { EmptyState, ErrorState, NoSnapshot } from "./states";
import { useTriageActions, type TriageState } from "./triage-status";

const MAX_SHOWN = 40;

function TriageCard({
  t,
  st,
  selected,
  onSelect,
  onSet,
}: {
  t: TriageItem;
  st: TriageState | null | undefined;
  selected: boolean;
  onSelect: (item: TriageItem) => void;
  onSet: (item: TriageItem, v: TriageState | null) => void;
}) {
  return (
    <li
                key={t.id}
                className={`rounded-md border bg-card ${selected ? "border-foreground ring-2 ring-foreground/30" : "border-border"} ${st ? "opacity-70" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(t)}
                  className="flex w-full items-start gap-3 rounded-t-md p-3 text-left hover:bg-secondary/60"
                  aria-label={`${t.headline}. ${t.frp.toFixed(1)} megawatts, ${t.confidence} confidence. Open evidence.`}
                >
                  <ClassGlyph cls={t.class} size={22} className="mt-0.5 shrink-0" />
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block text-sm font-semibold leading-snug">{t.headline}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t.siteCategory ? (SITE_CATEGORY_LABEL[t.siteCategory] ?? t.siteCategory) : "Industrial site"}
                      {t.distanceM !== null && ` · ${t.distanceM < 1 ? "inside boundary" : `${t.distanceM} m away`}`}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span className="font-mono">{t.frp.toFixed(1)} MW</span>
                      <span className="font-mono text-muted-foreground">
                        {t.acqDate} {t.acqTime.slice(0, 2)}:{t.acqTime.slice(2)} UTC
                      </span>
                      <Badge variant="outline" className="px-1.5 py-0 text-xs font-normal">
                        {CONFIDENCE_LABEL[t.confidence]}
                      </Badge>
                      {t.detections > 1 && <span className="text-muted-foreground">{t.detections} detections</span>}
                      {st && (
                        <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                          {st === "ack" ? "Acknowledged" : "Dismissed"}
                        </Badge>
                      )}
                    </span>
                  </span>
                </button>
                <div className="flex gap-2 border-t border-border/60 px-3 py-2">
                  {st ? (
                    <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2 text-xs" onClick={() => onSet(t, null)} aria-label={`Undo for ${t.headline}`}>
                      <Undo2 className="h-3.5 w-3.5" aria-hidden /> Undo
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" className="h-8 gap-1.5 px-2.5 text-xs" onClick={() => onSet(t, "ack")} aria-label={`Acknowledge ${t.headline}`}>
                        <Check className="h-3.5 w-3.5" aria-hidden /> Acknowledge
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2.5 text-xs" onClick={() => onSet(t, "dismissed")} aria-label={`Dismiss ${t.headline}`}>
                        <X className="h-3.5 w-3.5" aria-hidden /> Dismiss
                      </Button>
                    </>
                  )}
                </div>
              </li>
  );
}

export function TriageQueue({
  days,
  selectedId,
  onSelect,
  onWiden,
}: {
  days: number;
  selectedId: string | null;
  onSelect: (item: TriageItem) => void;
  onWiden: () => void;
}) {
  const { data, error, isLoading, isError, refetch } = useTriage(days);
  const act = useTriageActions(!!data?.sharedStatus);
  const [showHandled, setShowHandled] = useState(false);
  const [showWatch, setShowWatch] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading triage queue">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-md" />
        ))}
      </div>
    );
  }
  if (isError && !data) {
    return error instanceof ApiError && error.status === 503 ? (
      <NoSnapshot />
    ) : (
      <ErrorState message={error?.message ?? "Unknown error"} onRetry={() => refetch()} compact />
    );
  }
  const items = data?.items ?? [];
  const review = items.filter((i) => i.priority === "review");
  const watch = items.filter((i) => i.priority === "watch");
  const open = review.filter((i) => !act.statusOf(i));
  const handled = review.filter((i) => act.statusOf(i));
  const list = (showHandled ? review : open).slice(0, MAX_SHOWN);
  const watchOpen = watch.filter((i) => !act.statusOf(i));

  return (
    <div className="space-y-3">
      {isError && (
        <p role="status" className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs">
          Couldn’t refresh the queue — showing the last data received.
        </p>
      )}
      <div className="flex items-center justify-between gap-2 text-sm">
        <p aria-live="polite">
          <span className="font-semibold">{open.length}</span> open
          {handled.length > 0 && <span className="text-muted-foreground"> · {handled.length} handled</span>}
        </p>
        {handled.length > 0 && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setShowHandled((v) => !v)} aria-pressed={showHandled}>
            {showHandled ? "Hide handled" : "Show handled"}
          </Button>
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState
          title={review.length === 0 ? "No medium or high confidence items in this window" : "Everything in this window is handled"}
          hint={
            review.length === 0
              ? watch.length > 0
                ? "Only low-confidence items were found — see “Lower priority” below. Routine sources are in the Register tab."
                : "Nothing new or unusual at mapped industrial sites. Routine sources are listed in the Register tab."
              : "Nice work. Show handled items to review or undo."
          }
          action={days < 3 && items.length === 0 ? { label: "Widen to 3 days", onClick: onWiden } : undefined}
        />
      ) : (
        <ul className="space-y-2">
          {list.map((t) => (
            <TriageCard key={t.id} t={t} st={act.statusOf(t)} selected={t.id === selectedId} onSelect={onSelect} onSet={act.setStatus} />
          ))}
        </ul>
      )}
      {(showHandled ? review : open).length > MAX_SHOWN && (
        <p className="text-xs text-muted-foreground">Showing the top {MAX_SHOWN}, ranked by confidence and fire power.</p>
      )}
      {watch.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-full justify-between px-3 text-xs"
            onClick={() => setShowWatch((v) => !v)}
            aria-expanded={showWatch}
          >
            <span>Lower priority · {watchOpen.length} low-confidence</span>
            <span aria-hidden>{showWatch ? "Hide" : "Show"}</span>
          </Button>
          {showWatch && (
            <>
              <p className="text-xs text-muted-foreground">
                Low confidence means little history at the site, a generic industrial zone, or a satellite low-confidence flag. Check these when the main list is clear.
              </p>
              <ul className="space-y-2">
                {watch.slice(0, MAX_SHOWN).map((t) => (
                  <TriageCard key={t.id} t={t} st={act.statusOf(t)} selected={t.id === selectedId} onSelect={onSelect} onSet={act.setStatus} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      <div className="space-y-2 text-xs text-muted-foreground">
        <p>
          {data?.sharedStatus
            ? "Acknowledgements are shared with all analysts (stored in the database)."
            : "Acknowledgements are saved in this browser only (no database connected)."}
        </p>
        {act.notice && (
          <p role="status" className="rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1.5 text-foreground">
            {act.notice}
          </p>
        )}
        {data?.sharedStatus && (act.needsKey || !act.hasKey) && (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = new FormData(e.currentTarget).get("analystKey");
              if (typeof v === "string" && v.trim()) act.saveKey(v);
            }}
          >
            <label htmlFor="analyst-key" className="sr-only">
              Analyst key
            </label>
            <input
              id="analyst-key"
              name="analystKey"
              type="password"
              autoComplete="off"
              placeholder="Analyst key (to share decisions)"
              className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            />
            <Button type="submit" size="sm" variant="outline" className="h-8 px-2.5 text-xs">
              Use key
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

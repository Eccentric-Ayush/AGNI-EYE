"use client";

import { AlertTriangle, DatabaseZap, Inbox, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** 503 from the read API: no classified snapshot has been generated yet. */
export function NoSnapshot() {
  return (
    <Alert className="border-amber-500/50">
      <DatabaseZap className="h-4 w-4" aria-hidden />
      <AlertTitle>No classified data yet</AlertTitle>
      <AlertDescription>
        <p>The classification pipeline has not produced a snapshot. Generate one, then reload:</p>
        <pre className="mt-2 overflow-x-auto rounded bg-muted px-3 py-2 font-mono text-xs">npm run ingest &amp;&amp; npm run build:snapshot</pre>
      </AlertDescription>
    </Alert>
  );
}

export function ErrorState({ message, onRetry, compact = false }: { message: string; onRetry?: () => void; compact?: boolean }) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-md border border-destructive/50 bg-destructive/10 ${compact ? "p-3" : "p-4"} text-sm`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Couldn’t load this data</p>
        <p className="break-words text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} className="shrink-0 gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retry
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-xs text-sm text-muted-foreground">{hint}</p>}
      {action && (
        <Button size="sm" variant="outline" onClick={action.onClick} className="mt-1">
          {action.label}
        </Button>
      )}
    </div>
  );
}

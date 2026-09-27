"use client";

import { useState } from "react";
import { ExternalLink, KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useSaveMapKey, useSettings, useValidateMapKey } from "@/hooks/use-nasa";
import { useToast } from "@/hooks/use-toast";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { data: settings } = useSettings();
  const saveKey = useSaveMapKey();
  const validate = useValidateMapKey();
  const { toast } = useToast();
  const [keyInput, setKeyInput] = useState("");
  const [validation, setValidation] = useState<{ valid: boolean | null; reachable: boolean | null; text: string } | null>(null);

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setValidation(null);
      setKeyInput("");
    }
    onOpenChange(v);
  };

  const handleSave = () => {
    const key = keyInput.trim();
    if (!key) return;
    saveKey.mutate(
      { mapKey: key },
      {
        onSuccess: () => {
          toast({ title: "MAP_KEY saved", description: "Stored in the app database (masked in UI)." });
          setKeyInput("");
        },
        onError: (e) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
      }
    );
  };

  const handleValidate = () => {
    setValidation({ valid: null, reachable: null, text: "Probing FIRMS API…" });
    validate.mutate(keyInput.trim(), {
      onSuccess: (d) => {
        if (d.valid === true) {
          setValidation({ valid: true, reachable: true, text: d.message ?? "MAP_KEY is valid and active." });
        } else if (d.valid === false) {
          setValidation({ valid: false, reachable: true, text: d.error ?? "MAP_KEY rejected by FIRMS." });
        } else {
          setValidation({ valid: null, reachable: false, text: d.hint ?? d.error ?? "FIRMS unreachable from this server." });
        }
      },
      onError: (e) => setValidation({ valid: false, reachable: null, text: e.message }),
    });
  };

  const handleClear = () => {
    saveKey.mutate(
      { action: "clear" },
      {
        onSuccess: () => toast({ title: "MAP_KEY removed" }),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg border-border/60 bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <SettingsGlyph /> DATA SOURCE SETTINGS
          </DialogTitle>
          <DialogDescription className="text-xs">
            Agni Eye Command runs on 100% live NASA data. Configure optional integrations below — the core feed
            needs no keys.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Live core sources */}
          <div className="rounded-lg border border-border/50 bg-secondary/30 p-3 text-xs">
            <div className="mb-2 font-semibold tracking-wider text-emerald-400">CORE LIVE FEEDS — ALWAYS ON</div>
            <ul className="space-y-1.5 text-muted-foreground">
              <li className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5 px-1 py-0 text-[9px] text-emerald-400">GIBS</Badge>
                <span>
                  NASA GIBS active-fire <span className="text-foreground">vector tiles</span> — VIIRS S-NPP /
                  NOAA-20 / NOAA-21 & MODIS Terra / Aqua / Combined hotspots with brightness, FRP, acquisition
                  time. Real-time, no key.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5 px-1 py-0 text-[9px] text-cyan-400">EONET</Badge>
                <span>NASA Earth Observatory event feed for named wildfire incidents. Real-time, no key.</span>
              </li>
              <li className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5 px-1 py-0 text-[9px] text-amber-400">IMAGERY</Badge>
                <span>NASA GIBS VIIRS true-color satellite imagery basemap, updated daily.</span>
              </li>
            </ul>
          </div>

          <Separator />

          {/* FIRMS MAP_KEY */}
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold tracking-wider text-muted-foreground">
                <KeyRound className="h-3.5 w-3.5 text-orange-500" /> OPTIONAL: FIRMS API MAP_KEY
              </div>
              {settings?.firmsMapKey.configured ? (
                <Badge variant="outline" className="gap-1 px-1 py-0 text-[9px] text-emerald-400">
                  <ShieldCheck className="h-3 w-3" /> {settings.firmsMapKey.masked}
                </Badge>
              ) : (
                <Badge variant="outline" className="px-1 py-0 text-[9px] text-muted-foreground">
                  not configured
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              The MAP_KEY (free) enables the classic <span className="font-mono text-foreground">firms.modaps.eosdis.nasa.gov</span>{" "}
              CSV API as an additional backend. Get one at{" "}
              <a
                href={settings?.registerUrl ?? "https://firms.modaps.eosdis.nasa.gov/api/map_key/"}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-orange-400 hover:underline"
              >
                firms.modaps.eosdis.nasa.gov/api/map_key <ExternalLink className="h-2.5 w-2.5" />
              </a>
              . If this server cannot reach FIRMS, the app automatically keeps using GIBS hotspots.
            </p>
            <div className="flex gap-1.5">
              <Input
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="Paste MAP_KEY…"
                className="h-8 font-mono text-[11px]"
                type="password"
                autoComplete="off"
              />
              <Button size="sm" variant="outline" onClick={handleValidate} disabled={!keyInput.trim() || validate.isPending} className="h-8 text-[10px]">
                {validate.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "VALIDATE"}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={!keyInput.trim() || saveKey.isPending} className="h-8 bg-orange-600 text-[10px] text-white hover:bg-orange-500">
                SAVE
              </Button>
              {settings?.firmsMapKey.configured && (
                <Button size="sm" variant="ghost" onClick={handleClear} className="h-8 px-2 text-muted-foreground" title="Remove stored key">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            {validation && (
              <p
                className={`rounded-md border px-2 py-1.5 text-[11px] ${
                  validation.valid === true
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                    : validation.valid === false
                      ? "border-red-500/40 bg-red-500/10 text-red-400"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-400"
                }`}
              >
                {validation.text}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsGlyph() {
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-md border border-orange-500/40 bg-orange-500/10">
      <ShieldCheck className="h-3.5 w-3.5 text-orange-500" />
    </div>
  );
}

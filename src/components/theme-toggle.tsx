"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setTheme(isDark ? "light" : "dark");
              // Recharts' ResponsiveContainer doesn't repaint on a class-only
              // theme swap; nudge it so charts don't sit blank momentarily.
              setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
            }}
            className="h-8 w-8 border-border/60 px-0"
            aria-label="Toggle light / dark theme"
          >
            {mounted && (isDark ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />)}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          Switch to {isDark ? "light" : "dark"} mode
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

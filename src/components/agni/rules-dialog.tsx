"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClassGlyph } from "./class-glyph";
import { CLASS_META, ORDERED_CLASSES } from "./class-meta";

/** Plain-language summary of the rule-based classifier (mirrors docs/MVP_SPEC.md §8 and src/lib/classify). */
export function RulesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>How is a hotspot classified?</DialogTitle>
          <DialogDescription>
            Every NASA VIIRS detection over India is labelled by transparent rules — no black box. Each label comes with its
            confidence and the evidence behind it.
          </DialogDescription>
        </DialogHeader>

        <section aria-labelledby="rules-classes" className="space-y-2">
          <h3 id="rules-classes" className="text-sm font-semibold">
            The six classes
          </h3>
          <ul className="space-y-2">
            {ORDERED_CLASSES.map((c) => (
              <li key={c} className="flex items-start gap-3 text-sm">
                <ClassGlyph cls={c} size={20} className="mt-0.5 shrink-0" />
                <span>
                  <span className="font-medium">{CLASS_META[c].label}</span>
                  <span className="text-muted-foreground"> — {CLASS_META[c].definition}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="rules-order" className="space-y-2">
          <h3 id="rules-order" className="text-sm font-semibold">
            Evidence, in order
          </h3>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>
              <span className="text-foreground">Known static sources</span> (e.g. the Barren Island volcano) are labelled first.
            </li>
            <li>
              <span className="text-foreground">Nearby mapped facility</span> (OpenStreetMap industrial, energy, mining and
              landfill features, within a few hundred metres). Mines and landfills are “other static”, never industrial fires.
            </li>
            <li>
              <span className="text-foreground">Recurrence</span>: on how many of the previous ~30 days the same place was
              active (distinct days, not detections). Routine flares and kilns repeat; accidents do not.
            </li>
            <li>
              <span className="text-foreground">Baseline</span>: fire power compared with that place’s own normal level. A large
              jump is flagged as unusual.
            </li>
            <li>
              <span className="text-foreground">Land cover</span> (ESA WorldCover): cropland → agricultural burn, trees or
              grass → vegetation fire — only when no industrial site is nearby.
            </li>
            <li>
              <span className="text-foreground">Otherwise: Unclassified.</span> AGNI-EYE never forces a label.
            </li>
          </ol>
        </section>

        <section aria-labelledby="rules-limits" className="space-y-2">
          <h3 id="rules-limits" className="text-sm font-semibold">
            Limits you should know
          </h3>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Only VIIRS 375 m detections are classified; satellites see heat, not cause.</li>
            <li>Facilities missing from OpenStreetMap can’t be matched; cloud and monsoon gaps reduce recurrence counts.</li>
            <li>With fewer than 14 days of history, “new activity” is shown with low confidence.</li>
            <li>Thresholds are starting values being tuned on a small verified set — see the Validation tab for measured results.</li>
          </ul>
        </section>
      </DialogContent>
    </Dialog>
  );
}

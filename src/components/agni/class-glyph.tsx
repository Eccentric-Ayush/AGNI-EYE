import type { ClassId } from "@/lib/classify/types";
import { CLASS_META, RAW_COLOR, type Shape } from "./class-meta";

function ShapeSvg({ shape, color }: { shape: Shape; color: string }) {
  switch (shape) {
    case "triangle":
      return <polygon points="10,2 18.5,17 1.5,17" fill={color} />;
    case "square":
      return <rect x="3" y="3" width="14" height="14" rx="1" fill={color} />;
    case "diamond":
      return <polygon points="10,1 19,10 10,19 1,10" fill={color} />;
    case "circle":
      return <circle cx="10" cy="10" r="7.5" fill={color} />;
    case "hexagon":
      return <polygon points="10,1.5 17.5,5.75 17.5,14.25 10,18.5 2.5,14.25 2.5,5.75" fill={color} />;
    case "ring":
      return <circle cx="10" cy="10" r="6.5" fill="none" stroke={color} strokeWidth="2.5" />;
  }
}

/** Small SVG marker: class is encoded by colour AND shape. `raw` draws a neutral dot (Raw view). */
export function ClassGlyph({
  cls,
  size = 16,
  raw = false,
  className,
}: {
  cls: ClassId;
  size?: number;
  raw?: boolean;
  className?: string;
}) {
  const meta = CLASS_META[cls];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      className={className}
      role="img"
      aria-label={`${meta.label} (${meta.shapeName})`}
      focusable="false"
    >
      <ShapeSvg shape={raw ? "circle" : meta.shape} color={raw ? RAW_COLOR : meta.color} />
    </svg>
  );
}

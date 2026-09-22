import { Chart, type ChartConfiguration, registerables } from "chart.js";
import { useEffect, useRef, useSyncExternalStore } from "react";

Chart.register(...registerables);

export type ChartCanvasProps = {
  config: ChartConfiguration;
  ariaLabel: string;
  className?: string;
};

/** Thin chart.js wrapper: one Chart per canvas, destroyed on unmount. */
export function ChartCanvas({ config, ariaLabel, className }: ChartCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const chart = new Chart(canvas, config);
    return () => chart.destroy();
  }, [config]);

  return (
    <div className={className ?? "relative h-56"}>
      <canvas ref={canvasRef} role="img" aria-label={ariaLabel} />
    </div>
  );
}

export type ChartColors = {
  accent: string;
  accentFill: string;
  grid: string;
  text: string;
};

const DARK_QUERY = "(prefers-color-scheme: dark)";

// The effective theme is the `data-theme` attribute (header toggle) or, when
// absent, the OS preference. Both are watched directly: `useTheme()` keeps
// per-component state, so the toggle in the header never reaches this page.
function themeKey(): string {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "light" || explicit === "dark") return explicit;
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function subscribeTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const mql = window.matchMedia(DARK_QUERY);
  mql.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    mql.removeEventListener("change", onChange);
  };
}

let probe: CanvasRenderingContext2D | null | undefined;

/**
 * Theme tokens are oklch(); chart.js's color helper only understands
 * hex/rgb/hsl, so hover shades and alpha fills break. Paint the token onto a
 * 1×1 canvas and read it back as rgba.
 */
function toRgba(color: string, alpha = 1): string {
  probe ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!probe || color === "") return color;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "#000";
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = probe.getImageData(0, 0, 1, 1).data;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const colorCache = new Map<string, ChartColors>();

function colorsFor(key: string): ChartColors {
  let colors = colorCache.get(key);
  if (!colors) {
    const accent = cssVar("--color-accent-500");
    colors = {
      accent: toRgba(accent),
      accentFill: toRgba(accent, 0.75),
      grid: toRgba(cssVar("--color-border")),
      text: toRgba(cssVar("--color-fg-muted")),
    };
    colorCache.set(key, colors);
  }
  return colors;
}

/** Chart colors for the effective theme; a new object whenever it flips. */
export function useChartColors(): ChartColors {
  const key = useSyncExternalStore(subscribeTheme, themeKey, () => "light");
  return colorsFor(key);
}

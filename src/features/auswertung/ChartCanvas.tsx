import { Chart, type ChartConfiguration, registerables } from "chart.js";
import { useEffect, useRef } from "react";

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

/** Resolve a theme CSS variable so charts follow light/dark mode. */
export function themeColor(variable: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
}

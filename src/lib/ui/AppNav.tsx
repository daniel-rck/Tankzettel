import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

export type NavItem = {
  to: string;
  label: string;
  icon: ReactNode;
};

export type AppNavProps = {
  items: NavItem[];
  variant: "sidebar" | "bottom";
};

export function AppNav({ items, variant }: AppNavProps) {
  if (variant === "sidebar") {
    return (
      <nav className="w-full p-3 space-y-1" aria-label="Hauptnavigation">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) =>
              [
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors min-w-0",
                isActive
                  ? "bg-accent-100 text-accent-700 dark:bg-accent-900/40 dark:text-accent-200"
                  : "text-fg-muted hover:bg-surface-sunken hover:text-fg",
              ].join(" ")
            }
          >
            <span aria-hidden="true">{item.icon}</span>
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex h-16 items-stretch px-2" aria-label="Hauptnavigation">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end
          className="group flex-1 min-w-0 flex flex-col items-center justify-center gap-1 py-1.5 text-xs font-medium"
        >
          {({ isActive }) => (
            <>
              {/* The active state is a pill behind the icon rather than a color
                  change on both icon and label: at this size a tint alone is
                  easy to miss, and the pill keeps the touch target legible. */}
              <span
                aria-hidden="true"
                className={[
                  "grid h-8 min-w-14 place-items-center rounded-full",
                  "transition-[background-color,color] duration-[var(--duration-base)] ease-[var(--ease-out-quart)]",
                  isActive
                    ? "bg-accent-100 text-accent-700 dark:bg-accent-900/40 dark:text-accent-200"
                    : "text-fg-muted group-hover:text-fg",
                ].join(" ")}
              >
                {item.icon}
              </span>
              <span
                className={[
                  "max-w-full truncate",
                  isActive ? "text-accent-600 dark:text-accent-300" : "text-fg-muted",
                ].join(" ")}
              >
                {item.label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

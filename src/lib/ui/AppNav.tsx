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
    <nav className="flex h-16" aria-label="Hauptnavigation">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end
          className={({ isActive }) =>
            [
              "flex-1 min-w-0 flex flex-col items-center justify-center gap-1 text-xs transition-colors",
              isActive ? "text-accent-600" : "text-fg-muted",
            ].join(" ")
          }
        >
          <span aria-hidden="true">{item.icon}</span>
          <span className="max-w-full truncate">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

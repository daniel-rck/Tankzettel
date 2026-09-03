import type { ReactNode } from "react";
import { AppHeader } from "./AppHeader.tsx";
import { AppNav, type NavItem } from "./AppNav.tsx";
import { InstallButton } from "./InstallButton.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";

export type AppShellProps = {
  title: string;
  logo?: ReactNode;
  navItems: NavItem[];
  headerActions?: ReactNode;
  /**
   * Replaces the built-in theme toggle. The default is labelled in German;
   * an app with i18n passes its own translated toggle here rather than
   * shipping a second control somewhere else.
   */
  themeToggle?: ReactNode;
  children: ReactNode;
};

export function AppShell({
  title,
  logo,
  navItems,
  headerActions,
  themeToggle,
  children,
}: AppShellProps) {
  return (
    <div className="min-h-screen flex flex-col bg-surface text-fg">
      <AppHeader
        title={title}
        logo={logo}
        actions={
          <>
            {themeToggle ?? <ThemeToggle />}
            <InstallButton />
            {headerActions}
          </>
        }
      />
      <div className="flex flex-1 min-h-0">
        <aside className="hidden md:block w-56 shrink-0 border-r border-border bg-surface-muted">
          {/* The aside spans the full content height for its border and
              background; the nav inside sticks below the header as you scroll. */}
          <div className="sticky top-14">
            <AppNav items={navItems} variant="sidebar" />
          </div>
        </aside>
        {/* The window is the scroll container — the shell is min-h-screen and
            grows with content. Deliberately no `overflow-y-auto` here: an
            overflow container captures every descendant `position: sticky`
            without ever scrolling itself, which silently breaks sticky headers
            and toolbars anywhere in the page. `min-w-0` stops wide content
            (tables, code blocks) from stretching this flex item past the
            viewport. */}
        <main className="flex-1 min-w-0 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
          <div className="container mx-auto max-w-4xl px-4 py-6">{children}</div>
        </main>
      </div>
      {/* pb-[env(safe-area-inset-bottom)] keeps the bar clear of the iOS home
          indicator; the translucent background needs the blur to stay legible. */}
      <div className="md:hidden fixed bottom-0 inset-x-0 border-t border-border bg-surface/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
        <AppNav items={navItems} variant="bottom" />
      </div>
    </div>
  );
}

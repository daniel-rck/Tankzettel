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
  children: ReactNode;
};

export function AppShell({ title, logo, navItems, headerActions, children }: AppShellProps) {
  return (
    <div className="min-h-screen flex flex-col bg-surface text-fg">
      <AppHeader
        title={title}
        logo={logo}
        actions={
          <>
            <ThemeToggle />
            <InstallButton />
            {headerActions}
          </>
        }
      />
      <div className="flex flex-1 min-h-0">
        <aside className="hidden md:flex w-56 shrink-0 border-r border-border bg-surface-muted">
          <AppNav items={navItems} variant="sidebar" />
        </aside>
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          <div className="container mx-auto max-w-4xl px-4 py-6">{children}</div>
        </main>
      </div>
      <div className="md:hidden fixed bottom-0 inset-x-0 border-t border-border bg-surface">
        <AppNav items={navItems} variant="bottom" />
      </div>
    </div>
  );
}

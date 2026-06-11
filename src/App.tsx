import { Camera, ChartLine, ReceiptText, Settings } from "lucide-react";
import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { startQueueProcessor } from "./lib/queue/processor.ts";
import { ROUTES } from "./lib/routes.ts";
import { AppShell, type NavItem } from "./lib/ui/index.ts";

const NAV_ITEMS: NavItem[] = [
  { to: ROUTES.erfassen, label: "Erfassen", icon: <Camera size={20} /> },
  { to: ROUTES.belege, label: "Belege", icon: <ReceiptText size={20} /> },
  { to: ROUTES.auswertung, label: "Auswertung", icon: <ChartLine size={20} /> },
  { to: ROUTES.einstellungen, label: "Einstellungen", icon: <Settings size={20} /> },
];

export function App() {
  useEffect(() => {
    startQueueProcessor();
  }, []);

  return (
    <AppShell title="Tankzettel" navItems={NAV_ITEMS}>
      <Outlet />
    </AppShell>
  );
}

import { AlertTriangle } from "lucide-react";
import { Card, Spinner } from "./ui/index.ts";

/**
 * Loading / error placeholder for pages backed by `useLiveQuery`, so an empty
 * state never flashes before the first result and a failing IndexedDB is not
 * mistaken for "no data". Renders nothing once data is there.
 */
export function QueryFallback({ loading, error }: { loading: boolean; error: Error | undefined }) {
  if (error) {
    return (
      <Card role="alert" className="flex items-start gap-2 text-sm text-danger">
        <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
        <span>
          Die lokalen Daten konnten nicht gelesen werden. Seite neu laden; hilft das nicht, ist der
          Browser-Speicher evtl. blockiert (z. B. privater Modus).
        </span>
      </Card>
    );
  }
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="Daten werden geladen …" />
      </div>
    );
  }
  return null;
}

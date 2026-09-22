import { AlertTriangle, MapPinOff, RotateCcw } from "lucide-react";
import { Link, isRouteErrorResponse, useRouteError } from "react-router-dom";
import { ROUTES } from "./routes.ts";
import { Button, EmptyState, PageHeader, Spinner } from "./ui/index.ts";

/** Catch-all route: German 404 instead of React Router's English default. */
export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Seite nicht gefunden" />
      <EmptyState
        icon={<MapPinOff size={40} aria-hidden="true" />}
        title="Diese Seite gibt es nicht"
        description="Der Link ist veraltet oder falsch geschrieben."
        action={
          <Link
            to={ROUTES.erfassen}
            className="text-sm font-medium text-accent-600 underline underline-offset-2"
          >
            Zur Startseite
          </Link>
        }
      />
    </>
  );
}

/**
 * Route error boundary. The common case after an update is a lazy page chunk
 * that no longer exists (the new service worker cleaned up the old hashes) —
 * a reload fetches the current build.
 */
export function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  return (
    <>
      <PageHeader title="Etwas ist schiefgelaufen" />
      <EmptyState
        icon={<AlertTriangle size={40} aria-hidden="true" />}
        title="Die Seite konnte nicht geladen werden"
        description="Vermutlich wurde die App gerade aktualisiert. Neu laden holt die aktuelle Version — deine Daten bleiben erhalten."
        action={
          <Button onClick={() => window.location.reload()}>
            <RotateCcw size={16} aria-hidden="true" />
            Neu laden
          </Button>
        }
      />
    </>
  );
}

/** Shown while the first lazy route chunk loads. */
export function RouteFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner size="lg" label="App wird geladen …" />
    </div>
  );
}

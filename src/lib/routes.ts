export const ROUTES = {
  erfassen: "/",
  belege: "/belege",
  auswertung: "/auswertung",
  einstellungen: "/einstellungen",
} as const;

export type RouteKey = keyof typeof ROUTES;

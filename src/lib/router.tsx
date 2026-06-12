import { createBrowserRouter } from "react-router-dom";
import { App } from "../App.tsx";
import { ROUTES } from "./routes.ts";

export const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      {
        path: ROUTES.erfassen,
        lazy: async () => {
          const { ErfassenPage } = await import("../features/erfassen/ErfassenPage.tsx");
          return { Component: ErfassenPage };
        },
      },
      {
        path: ROUTES.belege,
        lazy: async () => {
          const { BelegePage } = await import("../features/belege/BelegePage.tsx");
          return { Component: BelegePage };
        },
      },
      {
        path: ROUTES.auswertung,
        lazy: async () => {
          const { AuswertungPage } = await import("../features/auswertung/AuswertungPage.tsx");
          return { Component: AuswertungPage };
        },
      },
      {
        path: ROUTES.einstellungen,
        lazy: async () => {
          const { EinstellungenPage } = await import(
            "../features/einstellungen/EinstellungenPage.tsx"
          );
          return { Component: EinstellungenPage };
        },
      },
    ],
  },
]);

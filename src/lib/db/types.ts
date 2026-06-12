export type EntrySource = "scan" | "manual";

export type FuelEntry = {
  id: string; // crypto.randomUUID()
  date: string | null; // ISO "YYYY-MM-DD" (from receipt, editable)
  time: string | null; // "HH:MM"
  station: string; // e.g. "V-Markt"
  location: string; // e.g. "Türkheim"
  fuelType: string; // verbatim from receipt, e.g. "Super E10"
  liters: number | null;
  pricePerLiter: number | null; // EUR, typically 3 decimals
  total: number | null; // EUR gross
  odometer: number | null; // km, manual input, optional
  source: EntrySource;
  createdAt: number; // Date.now()
  updatedAt: number; // Date.now(), bump on every edit
};

export type ScanJobStatus = "pending" | "processing" | "review" | "failed";

export type ScanJob = {
  id: string;
  createdAt: number;
  image: Blob; // downscaled JPEG (the only photo we keep)
  status: ScanJobStatus;
  attempts: number;
  lastError: string | null; // user-displayable German message
  result: ExtractionResult | null; // set when status === "review"
};

export type ExtractionResult = {
  date: string | null;
  time: string | null;
  station: string | null;
  location: string | null;
  fuelType: string | null;
  liters: number | null;
  pricePerLiter: number | null;
  total: number | null;
};

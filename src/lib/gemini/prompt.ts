// German on purpose — the receipts are German.
export const EXTRACTION_PROMPT = `Du siehst das Foto eines deutschen Tankbelegs (Tankstellen-Quittung).
Extrahiere die Tankdaten in das vorgegebene JSON-Schema.
Regeln:
- Zahlen mit Punkt als Dezimaltrenner, keine Tausendertrenner, keine Einheiten.
- "station": Name der Tankstelle bzw. Kette (z.B. "V-Markt", "Feneberg", "Aral").
- "location": Ort der Tankstelle.
- "fuelType": Kraftstoffsorte wie auf dem Beleg gedruckt (z.B. "Super E10").
- "liters": getankte Menge in Litern.
- "pricePerLiter": Preis pro Liter in EUR (oft 3 Nachkommastellen).
- "total": Brutto-Gesamtbetrag in EUR.
- Nicht sicher erkennbare Werte: null.`;

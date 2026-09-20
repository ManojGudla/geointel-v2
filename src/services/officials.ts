import { apiGet } from "@/services/apiClient";
import type { Location } from "@/types/location";

export type OfficialLevel = "country" | "state" | "district" | "city";

export interface OfficialEntry {
  level: OfficialLevel;
  levelLabel: string;
  role: string;
  name: string | null;
  status: "verified" | "unavailable";
  since: string | null;
  sourceUrl: string | null;
  sourceLabel: string;
  note?: string;
}

// Wikidata lookups (esp. the label-matching city/district queries) can take
// longer than the app's default request budget - same lesson as the AI
// agent timeout fix: give this its own honest, longer allowance instead of
// racing the generic default and reporting a false "failed to load".
const OFFICIALS_REQUEST_TIMEOUT_MS = 30_000;

export async function fetchOfficials(address: Location["address"], signal?: AbortSignal): Promise<OfficialEntry[]> {
  const { officials } = await apiGet<{ officials: OfficialEntry[] }>(
    "/api/officials",
    {
      country: address.country,
      countryCode: address.countryCode,
      state: address.state,
      stateCode: address.stateCode,
      district: address.district,
      city: address.city,
    },
    signal,
    OFFICIALS_REQUEST_TIMEOUT_MS
  );
  return officials;
}

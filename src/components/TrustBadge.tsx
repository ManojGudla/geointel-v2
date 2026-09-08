import type { EvidenceTrust } from "@/types/location";
import "./TrustBadge.css";

const LABELS: Record<EvidenceTrust, string> = {
  verified: "VERIFIED",
  inferred: "INFERRED",
  unavailable: "UNAVAILABLE",
};

/**
 * The spec is explicit that inference must never be presented as verified
 * fact. Every evidence-bearing panel (GIS, property, AI answers) renders
 * this badge so the distinction is always visible, not just documented.
 */
export function TrustBadge({ trust }: { trust: EvidenceTrust }) {
  return <span className={`trust-badge trust-badge--${trust}`}>{LABELS[trust]}</span>;
}

import { apiGet, apiPost } from "@/services/apiClient";

export type MaintenanceType = "scheduled" | "emergency";

export interface MaintenanceState {
  enabled: boolean;
  type: MaintenanceType;
  title: string;
  message: string;
  estimatedEnd: string | null;
  supportInfo: string | null;
  showStatus: boolean;
  showCountdown: boolean;
  startedAt: string | null;
  updatedAt: string | null;
}

export interface MaintenanceAuditEntry {
  id: string;
  action: "enabled" | "disabled" | "settings_updated";
  maintenance_type: string | null;
  admin_label: string | null;
  created_at: string;
}

export interface MaintenanceUpdateInput {
  action: "enable" | "disable" | "update";
  type?: MaintenanceType;
  title?: string;
  message?: string;
  estimatedEnd?: string;
  supportInfo?: string;
  showStatus?: boolean;
  showCountdown?: boolean;
  adminLabel?: string;
}

const ADMIN_HEADER = "x-geointel-admin-key";

/**
 * Public read — every visitor's browser calls this (no key) to know whether
 * to show the maintenance page. Passing an admin key additionally asks the
 * server to confirm whether that key is valid and, if so, include the
 * recent audit log — used by the /admin dashboard to verify a passphrase
 * without a separate endpoint.
 */
export function fetchMaintenanceState(adminKey?: string, signal?: AbortSignal) {
  return apiGet<{ maintenance: MaintenanceState; adminKeyValid?: boolean; auditLog?: MaintenanceAuditEntry[] }>(
    "/api/admin/maintenance",
    undefined,
    signal,
    undefined,
    adminKey ? { [ADMIN_HEADER]: adminKey } : undefined
  );
}

export function updateMaintenance(adminKey: string, input: MaintenanceUpdateInput, signal?: AbortSignal) {
  return apiPost<{ maintenance: MaintenanceState }>("/api/admin/maintenance", input, signal, undefined, { [ADMIN_HEADER]: adminKey });
}

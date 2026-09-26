import { apiGet } from "@/services/apiClient";
import { adminKeyHeaders } from "@/services/adminKeyHeader";

export interface FeedbackSubmission {
  id: string;
  device_id: string;
  rating: number;
  category: string;
  message: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface TeamApplicationSubmission {
  id: string;
  name: string;
  email: string;
  interest: string;
  message: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}


export function fetchAdminSubmissions(adminKey: string, signal?: AbortSignal) {
  return apiGet<{ feedback: FeedbackSubmission[]; teamApplications: TeamApplicationSubmission[] }>(
    "/api/admin/submissions",
    undefined,
    signal,
    undefined,
    adminKeyHeaders(adminKey)
  );
}

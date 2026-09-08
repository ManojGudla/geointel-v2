import { apiPost } from "@/services/apiClient";

export interface TeamApplicationSubmission {
  name: string;
  email: string;
  interest: string;
  message: string;
}

export async function submitTeamApplication(submission: TeamApplicationSubmission): Promise<{ saved: true }> {
  return apiPost<{ saved: true }>("/api/team-apply", submission);
}

import { apiPost } from "@/services/apiClient";
import { getDeviceId } from "@/services/deviceId";

export interface FeedbackSubmission {
  rating: number;
  category: string;
  message: string;
  pageContext?: Record<string, unknown>;
}

export async function submitFeedback(submission: FeedbackSubmission): Promise<{ saved: true }> {
  return apiPost<{ saved: true }>("/api/feedback", {
    deviceId: getDeviceId(),
    rating: submission.rating,
    category: submission.category,
    message: submission.message,
    pageContext: submission.pageContext,
  });
}

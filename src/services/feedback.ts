import { apiPost } from "@/services/apiClient";
import { getDeviceId } from "@/services/deviceId";
import { track } from "@/services/analytics";

export interface FeedbackSubmission {
  rating: number;
  category: string;
  message: string;
  pageContext?: Record<string, unknown>;
}

export async function submitFeedback(submission: FeedbackSubmission): Promise<{ saved: true }> {
  const saved = await apiPost<{ saved: true }>("/api/feedback", {
    deviceId: getDeviceId(),
    rating: submission.rating,
    category: submission.category,
    message: submission.message,
    pageContext: submission.pageContext,
  });
  // Rating and category only - the message is free text and never leaves in an event.
  track("feedback_submitted", { rating: submission.rating, category: submission.category });
  return saved;
}

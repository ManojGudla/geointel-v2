import { create } from "zustand";
import type { AgentKind, AgentResult, CopilotMessage } from "@/types/ai";

// "queued" is distinct from "running" on purpose: AI calls now pass through
// a concurrency gate (src/services/aiRequestQueue.ts) so a burst of agent
// clicks can't trip the provider's rate limit, which means a card can be
// waiting its turn without a request actually being in flight yet. Showing
// "Running…" for that would be a small lie about what the app is doing.
type AgentRunState = { status: "idle" | "queued" | "running" | "done" | "error"; result?: AgentResult; error?: string };

interface AiState {
  isCopilotOpen: boolean;
  messages: CopilotMessage[];
  isAsking: boolean;
  agentRuns: Record<AgentKind, AgentRunState>;
  openCopilot: () => void;
  closeCopilot: () => void;
  toggleCopilot: () => void;
  addMessage: (message: CopilotMessage) => void;
  setAsking: (asking: boolean) => void;
  clearConversation: () => void;
  setAgentRun: (kind: AgentKind, state: AgentRunState) => void;
}

const EMPTY_AGENT_RUNS: Record<AgentKind, AgentRunState> = {
  search: { status: "idle" },
  gis: { status: "idle" },
  property: { status: "idle" },
  navigation: { status: "idle" },
  travel: { status: "idle" },
  makeMyTrip: { status: "idle" },
};

export const useAiStore = create<AiState>((set) => ({
  isCopilotOpen: false,
  messages: [],
  isAsking: false,
  agentRuns: EMPTY_AGENT_RUNS,
  openCopilot: () => set({ isCopilotOpen: true }),
  closeCopilot: () => set({ isCopilotOpen: false }),
  toggleCopilot: () => set((s) => ({ isCopilotOpen: !s.isCopilotOpen })),
  addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),
  setAsking: (isAsking) => set({ isAsking }),
  clearConversation: () => set({ messages: [] }),
  setAgentRun: (kind, state) => set((s) => ({ agentRuns: { ...s.agentRuns, [kind]: state } })),
}));

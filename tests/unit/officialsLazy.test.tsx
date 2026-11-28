import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";

/*
  Added 28 November 2026 (panels reported slow): the folded officials panel
  asks for nothing until it is unfolded. MOCK hook.
*/
const calls = vi.hoisted(() => ({ n: 0 }));
vi.mock("@/features/officials/useOfficials", () => ({
  useOfficials: () => {
    calls.n += 1;
    return { status: "pending", isPending: true, isError: false, isSuccess: false, data: undefined, dataUpdatedAt: 0, fetchStatus: "fetching", refetch: () => {} };
  },
}));

import { OfficialsPanel } from "@/features/officials/OfficialsPanel";

describe("the officials panel", () => {
  it("does not look anything up while folded, and does once unfolded", () => {
    const { container } = render(<OfficialsPanel />);
    expect(calls.n).toBe(0);
    const details = container.querySelector("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(calls.n).toBeGreaterThan(0);
  });
});

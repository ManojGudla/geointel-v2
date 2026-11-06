import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describeDevice, maskIp, relativeTime, toCsv, weekOverWeek, initials } from "@/features/admin/adminFormat";

const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

const maintenanceState = {
  enabled: false,
  type: "scheduled" as const,
  title: "Scheduled Maintenance",
  message: "Back soon.",
  estimatedEnd: "About 30 minutes",
  supportInfo: "support@manowj.com",
  showStatus: true,
  showCountdown: false,
  startedAt: null,
  updatedAt: iso(3_600_000),
};

const updateMaintenance = vi.fn(async (_key: string, input: { action: string }) => ({
  maintenance: { ...maintenanceState, enabled: input.action === "enable" },
}));

vi.mock("@/services/maintenance", () => ({
  fetchMaintenanceState: vi.fn(async () => ({ maintenance: maintenanceState, adminKeyValid: true, auditLog: [] })),
  updateMaintenance: (key: string, input: { action: string }) => updateMaintenance(key, input),
}));

vi.mock("@/services/adminSubmissions", () => ({
  fetchAdminSubmissions: vi.fn(async () => ({
    feedback: [
      { id: "1", device_id: "d", rating: 5, category: "general", message: "Love the map", ip_address: "49.205.1.2", user_agent: "Mozilla/5.0 (iPhone) Safari/604.1", created_at: iso(86_400_000) },
      { id: "2", device_id: "d", rating: 3, category: "bug", message: "Search was slow", ip_address: null, user_agent: null, created_at: iso(9 * 86_400_000) },
    ],
    teamApplications: [
      { id: "a", name: "Ravi Kumar", email: "ravi@example.com", interest: "design", message: null, ip_address: null, user_agent: null, created_at: iso(3_600_000) },
    ],
  })),
}));

vi.mock("@/services/apiClient", async (orig) => {
  const actual = await orig<typeof import("@/services/apiClient")>();
  return {
    ...actual,
    apiGet: vi.fn(async () => ({
      checkedAt: new Date().toISOString(),
      dependencies: [
        { id: "db", name: "Database", status: "operational", latencyMs: 120, detail: "Database responding" },
        { id: "ai", name: "AI", status: "degraded", latencyMs: 900, detail: "Slow" },
      ],
    })),
  };
});

async function renderUnlocked() {
  sessionStorage.setItem("geointel.adminKey", "secret");
  const { AdminDashboard } = await import("@/features/admin/AdminDashboard");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AdminDashboard />
    </QueryClientProvider>
  );
  await screen.findByText("Site is live");
}

describe("admin console", () => {
  beforeEach(() => {
    updateMaintenance.mockClear();
    window.location.hash = "";
  });

  it("shows live status and real numbers on the overview", async () => {
    await renderUnlocked();
    expect(await screen.findByText("4.0")).toBeTruthy(); // (5 + 3) / 2
    expect(await screen.findByText("Database")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Feedback/ })).toBeTruthy();
  });

  it("asks for confirmation before taking the site offline", async () => {
    await renderUnlocked();
    fireEvent.click(screen.getByRole("tab", { name: /Maintenance/ }));
    fireEvent.click(screen.getByRole("button", { name: /Start scheduled maintenance/ }));
    expect(updateMaintenance).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Every visitor");
    fireEvent.click(screen.getByRole("button", { name: "Take site offline" }));
    await waitFor(() => expect(updateMaintenance).toHaveBeenCalledWith("secret", expect.objectContaining({ action: "enable", type: "scheduled" })));
  });

  it("only enables Save when something changed", async () => {
    await renderUnlocked();
    fireEvent.click(screen.getByRole("tab", { name: /Maintenance/ }));
    expect((screen.getByRole("button", { name: "Saved" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "About 1 hour" }));
    expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
  });

  it("filters feedback by rating", async () => {
    await renderUnlocked();
    fireEvent.click(screen.getByRole("tab", { name: /Feedback/ }));
    expect(await screen.findByText("Love the map")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "3 ★" }));
    expect(screen.queryByText("Love the map")).toBeNull();
    expect(screen.getByText("Search was slow")).toBeTruthy();
  });

  it("locks and forgets the key", async () => {
    await renderUnlocked();
    fireEvent.click(screen.getByRole("button", { name: "Lock admin" }));
    expect(await screen.findByLabelText("Admin key")).toBeTruthy();
    expect(sessionStorage.getItem("geointel.adminKey")).toBeNull();
  });
});

describe("admin formatting", () => {
  it("describes devices in plain words", () => {
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit Version/18.0 Mobile/15E148 Safari/604.1")).toBe("iPhone · Safari");
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36")).toBe("Windows · Chrome");
    expect(describeDevice("Mozilla/5.0 (Linux; Android 14) WhatsApp/2.24")).toBe("Android · WhatsApp");
    expect(describeDevice(null)).toBe("Unknown device");
  });

  it("masks IP addresses", () => {
    expect(maskIp("49.205.12.34")).toBe("49.205.x.x");
    expect(maskIp("49.205.12.34, 10.0.0.1")).toBe("49.205.x.x");
    expect(maskIp(null)).toBe("IP hidden");
  });

  it("writes safe CSV", () => {
    const csv = toCsv([{ a: '=HYPERLINK("x")', b: "line\nbreak" }], [
      { key: "a", label: "A" },
      { key: "b", label: "B" },
    ]);
    expect(csv).toBe('A,B\r\n"\'=HYPERLINK(""x"")","line\nbreak"');
  });

  it("counts week over week and formats times", () => {
    const n = Date.UTC(2026, 10, 6);
    const rows = [{ created_at: new Date(n - 86_400_000).toISOString() }, { created_at: new Date(n - 8 * 86_400_000).toISOString() }];
    expect(weekOverWeek(rows, n)).toEqual({ thisWeek: 1, lastWeek: 1 });
    expect(relativeTime(new Date(n - 5 * 60_000).toISOString(), n)).toBe("5 min ago");
    expect(initials("Manoj Kumar Gudla")).toBe("MG");
  });
});

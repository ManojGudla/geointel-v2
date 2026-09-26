import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Recent searches must work from the keyboard, and survive bad storage.
 *
 * The dropdown closed on the input's own blur, so tabbing from the box to a
 * recent search removed the button before focus could reach it. And the
 * stored list was cast rather than checked, so a corrupted value crashed the
 * search box on load.
 */

vi.mock("../../src/services/analytics", () => ({ track: vi.fn() }));

const place = (name: string) => ({ lat: 17.38, lon: 78.48, name, displayName: `${name}, Hyderabad` });

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

afterEach(cleanup);

async function renderSearch() {
  const { SearchBar } = await import("../../src/features/search/SearchBar");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SearchBar />
    </QueryClientProvider>
  );
}

const nextFrame = () => act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));

describe("recent searches", () => {
  it("are reachable with the arrow keys and stay open while focus is in them", async () => {
    localStorage.setItem("geointel.recentSearches.v1", JSON.stringify([place("Charminar"), place("Golconda")]));
    await renderSearch();
    const box = screen.getByRole("combobox", { name: "Search a location" });

    box.focus();
    fireEvent.focus(box);
    fireEvent.keyDown(box, { key: "ArrowDown" });
    await nextFrame();

    const first = screen.getByRole("button", { name: /Charminar/ });
    expect(document.activeElement).toBe(first);

    // Focus moving within the search area must not close the list.
    fireEvent.blur(box, { relatedTarget: first });
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Golconda/ }));
  });

  it("drop unusable stored entries instead of crashing the search box", async () => {
    localStorage.setItem("geointel.recentSearches.v1", JSON.stringify(["junk", { name: 1 }, place("Charminar")]));
    const { useSearchStore } = await import("../../src/stores/searchStore");
    expect(useSearchStore.getState().recentSearches.map((r) => r.name)).toEqual(["Charminar"]);
  });

  it("survive a stored value that is not a list at all", async () => {
    localStorage.setItem("geointel.recentSearches.v1", JSON.stringify("not a list"));
    const { useSearchStore } = await import("../../src/stores/searchStore");
    expect(useSearchStore.getState().recentSearches).toEqual([]);
  });
});

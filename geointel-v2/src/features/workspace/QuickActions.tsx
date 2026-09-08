import { useLocationStore } from "@/stores/locationStore";
import { useRouteStore } from "@/stores/routeStore";
import { useIntelTabStore } from "@/stores/intelTabStore";
import { useMapStore } from "@/stores/mapStore";
import "./QuickActions.css";

/**
 * "Search, Directions, Analyze, Nearby, 3D View" — the quick actions from
 * the spec's Home Workspace, each wired to a real store action rather than
 * a dead button.
 */
export function QuickActions() {
  const location = useLocationStore((s) => s.selectedLocation);
  const openDirections = useRouteStore((s) => s.openPanel);
  const setIntelTab = useIntelTabStore((s) => s.setTab);
  const toggle3D = useMapStore((s) => s.toggle3D);

  const focusSearch = () => {
    const el = document.querySelector<HTMLInputElement>(".search-bar__input");
    el?.focus();
  };

  return (
    <div className="quick-actions">
      <button type="button" onClick={focusSearch}>
        🔍 Search
      </button>
      <button type="button" onClick={() => openDirections(location ?? undefined)} disabled={!location}>
        🧭 Directions
      </button>
      <button type="button" onClick={() => setIntelTab("evidence")} disabled={!location}>
        📊 Analyze
      </button>
      <button type="button" onClick={() => setIntelTab("nearby")} disabled={!location}>
        📍 Nearby
      </button>
      <button type="button" onClick={toggle3D}>
        🧊 3D View
      </button>
    </div>
  );
}

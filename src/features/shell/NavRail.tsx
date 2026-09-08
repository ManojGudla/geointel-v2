import { useShellStore } from "@/stores/shellStore";
import { SECTIONS } from "./sections";
import "./NavRail.css";

/**
 * The single navigation surface for the workspace: a labelled rail on
 * desktop, a bottom tab bar on phones.
 *
 * Every button carries a visible text label, not just an icon. Icon-only
 * rails look tidier and are the reason people ask "where is that?" — the
 * label is the feature that makes the app usable by someone who wasn't given
 * a tour, which is the specific failure this replaces.
 */
export function NavRail() {
  const section = useShellStore((s) => s.section);
  const open = useShellStore((s) => s.open);
  const toggleSection = useShellStore((s) => s.toggleSection);

  return (
    <nav className="nav-rail" aria-label="Workspace sections">
      {SECTIONS.map((item) => {
        const active = open && section === item.id;
        return (
          <button
            key={item.id}
            type="button"
            className={`nav-rail__item${active ? " nav-rail__item--active" : ""}`}
            onClick={() => toggleSection(item.id)}
            aria-pressed={active}
            title={item.hint}
          >
            <span className="nav-rail__icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="nav-rail__label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

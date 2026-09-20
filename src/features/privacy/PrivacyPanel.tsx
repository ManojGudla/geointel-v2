import { useEffect } from "react";
import { usePrivacyStore } from "@/stores/privacyStore";
import { useDialog } from "@/hooks/useDialog";
import { SECTIONS, NOT_YET } from "./privacyFacts";
import "./PrivacyPanel.css";

/**
 * "security people need to use better and understand every thing".
 *
 * A trust page written to be read by someone deciding whether to put real
 * work into this - so it's in plain words, it says where each claim comes
 * from in the code, and it has a section for what ISN'T true yet.
 *
 * That last section is the one that makes the rest believable. Anyone can
 * write "your data is safe"; naming the gaps is what tells a reader the other
 * claims were written honestly too.
 */
export function PrivacyPanel() {
  const isOpen = usePrivacyStore((s) => s.isOpen);
  const close = usePrivacyStore((s) => s.close);

  /*
    This declares aria-modal="true". Escape was already handled below, but
    the other half of that promise - focus moves in, Tab stays inside, focus
    returns on close - was not: a keyboard user could tab straight out of
    this panel into the map it was covering. See hooks/useDialog.ts.
  */
  const dialogRef = useDialog({ open: isOpen, onClose: close });

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [isOpen, close]);

  if (!isOpen) return null;

  return (
    <div ref={dialogRef} className="privacy" role="dialog" aria-modal="true" aria-label="Privacy and security">
      <div className="privacy__sheet">
        <header className="privacy__head">
          <div>
            <h2>
              <span aria-hidden="true">🔒</span> Privacy &amp; security
            </h2>
            <p>What this app does with your data, in plain words, and what it doesn&apos;t.</p>
          </div>
          <button type="button" className="privacy__close" onClick={close} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="privacy__body">
          <p className="privacy__lede">
            The short version: <strong>there is no account, so there is nothing to link to you.</strong> Your searches,
            your selected places, your analysis and your game scores all live in this browser and are sent nowhere. Your
            location is used while you&apos;re using it and then discarded.
          </p>

          {SECTIONS.map((section) => (
            <section key={section.id} className={`privacy__section${section.id === "notyet" ? " privacy__section--gaps" : ""}`}>
              <h3>
                <span aria-hidden="true">{section.icon}</span> {section.title}
              </h3>
              <p className="privacy__intro">{section.intro}</p>
              <ul>
                {section.facts.map((fact) => (
                  <li key={fact.claim}>
                    <strong>{fact.claim}</strong>
                    <span>{fact.detail}</span>
                    <code>{fact.where}</code>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <footer className="privacy__foot">
          Every claim above points at the file or setting that makes it true, so it can be checked rather than taken on
          faith. {NOT_YET.length} things are marked as not yet done. If one of them matters to you, say so through
          Feedback and it moves up the list.
        </footer>
      </div>
    </div>
  );
}

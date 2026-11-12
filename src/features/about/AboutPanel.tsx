import { AnimatePresence, motion } from "framer-motion";
import { useAboutStore } from "@/stores/aboutStore";
import { useMotionPreference } from "@/hooks/useMotionPreference";
import { overlayFade, panelRise } from "@/lib/motionVariants";
import { FEATURE_STATUS } from "@/data/featureStatus";
import { useFeatureStatusStore } from "@/stores/featureStatusStore";
import "./AboutPanel.css";
import { useDialog } from "@/hooks/useDialog";
import { FOUNDER, FOUNDER_SITE_URL } from "@/config/founder";

const LIVE_COUNT = FEATURE_STATUS.flatMap((c) => c.items).filter((i) => i.status === "live").length;
const TOTAL_COUNT = FEATURE_STATUS.flatMap((c) => c.items).length;


/**
 * "About" - who built this and what it is, reached from the header's More
 * menu. Same open/close overlay pattern as JoinTeamForm/SettingsPanel. The
 * feature count is pulled live from featureStatus.ts (the same source of
 * truth the Feature Status page renders) rather than a separate hand-typed
 * number, so it can't quietly drift out of sync with what's actually built.
 */
export function AboutPanel() {
  const isOpen = useAboutStore((s) => s.isOpen);
  const close = useAboutStore((s) => s.close);
  /*
    Makes this behave like the role="dialog" it declares: Escape closes it,
    focus moves in on open and cycles inside, and goes back to whatever opened
    it on close. See hooks/useDialog.ts - none of that was happening before,
    and Tab walked straight out into the map behind this panel.
  */
  const dialogRef = useDialog({ open: isOpen, onClose: close });
  const openFeatureStatus = useFeatureStatusStore((s) => s.open);
  const motionEnabled = useMotionPreference();

  const body = (
    <>
      <div className="about-panel__head">
        <h2>About</h2>
        <button type="button" onClick={close} aria-label="Close about">
          ✕
        </button>
      </div>

      <div className="about-panel__brand">
        <span className="about-panel__mark" aria-hidden="true">
          🌐
        </span>
        <div>
          <p className="about-panel__name">maNOWj GeoIntel</p>
          <p className="about-panel__tagline">Maps, data and sources for any place</p>
        </div>
      </div>

      <p className="about-panel__desc">
        A location-intelligence app combining live GIS evidence, property analysis, routing, weather, and an AI that writes summaries only from
        the data already loaded on screen. It is built with real provider integrations (OpenStreetMap, Overpass, Nominatim, Open-Meteo, Wikidata,
        OpenRouter) rather than mocked or fabricated data.
        {" "}
        <button type="button" className="about-panel__link" onClick={openFeatureStatus}>
          {LIVE_COUNT} of {TOTAL_COUNT} tracked features are live today
        </button>
        .
      </p>

      <div className="about-panel__creator">
        <img className="about-panel__creator-photo" src="/about/creator.jpg" alt="Manoj Kumar Gudla" width={56} height={56} />
        <div className="about-panel__creator-info">
          <span className="about-panel__creator-label">Created &amp; built by</span>
          <span className="about-panel__creator-name">{FOUNDER.name}</span>
          <span className="about-panel__creator-roles">
            {FOUNDER.roles}. {FOUNDER.location}.
          </span>
          <div className="about-panel__creator-links">
            {/* The address comes from config/founder.ts and can be changed without a code edit. */}
            {FOUNDER_SITE_URL && (
              <a href={FOUNDER_SITE_URL} target="_blank" rel="noreferrer">
                Website
              </a>
            )}
            {FOUNDER.links.map((link) => (
              <a key={link.label} href={link.href} target="_blank" rel="noreferrer">
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="about-panel__guides">
        <span className="about-panel__creator-label">Guides and tools</span>
        <div className="about-panel__guide-links">
          <a href="/area-report">Area report</a>
          <a href="/tools/radius-search">Radius search</a>
          <a href="/tools/measure-area">Measure area</a>
          <a href="/tools/satellite-history">Satellite by year</a>
          <a href="/solutions/real-estate">For real estate</a>
          <a href="/solutions/retail-site-selection">For shops</a>
          <a href="/solutions/urban-planning">For planners</a>
        </div>
      </div>

      <p className="about-panel__version">Every provider integration is checked against its live API before each release.</p>
    </>
  );

  if (!motionEnabled) {
    if (!isOpen) return null;
    return (
      <div className="about-overlay" onClick={close}>
        <div ref={dialogRef} className="about-panel" role="dialog" aria-modal="true" aria-label="About maNOWj GeoIntel" onClick={(e) => e.stopPropagation()}>
          {body}
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="about-overlay" onClick={close} {...overlayFade}>
          <motion.div ref={dialogRef} className="about-panel" role="dialog" aria-modal="true" aria-label="About maNOWj GeoIntel" onClick={(e) => e.stopPropagation()} {...panelRise}>
            {body}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

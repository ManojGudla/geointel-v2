import { AnimatePresence, motion } from "framer-motion";
import { useFeatureStatusStore } from "@/stores/featureStatusStore";
import { FEATURE_STATUS, countByStatus, totalFeatureCount, type FeatureStatus } from "@/data/featureStatus";
import { useMotionPreference } from "@/hooks/useMotionPreference";
import { overlayFade, panelRise } from "@/lib/motionVariants";
import "./FeatureStatusPage.css";
import { useDialog } from "@/hooks/useDialog";

const STATUS_LABEL: Record<FeatureStatus, string> = {
  live: "Live",
  partial: "Partial",
  planned: "Planned",
};

function StatusBadge({ status }: { status: FeatureStatus }) {
  return <span className={`feature-status__badge feature-status__badge--${status}`}>{STATUS_LABEL[status]}</span>;
}

/**
 * The honest, real-time answer to "what does GeoIntel actually do" — every
 * feature discussed for this product, organized by category, mapped to
 * Live / Partial / Planned against the real codebase (see
 * src/data/featureStatus.ts). Built specifically so this can be shown to a
 * client, manager, or teammate without overclaiming — it's the same
 * discipline as every "temporarily unavailable" state elsewhere in the app,
 * applied to the product's own feature list.
 */
export function FeatureStatusPage() {
  const isOpen = useFeatureStatusStore((s) => s.isOpen);
  const close = useFeatureStatusStore((s) => s.close);
  /*
    Makes this behave like the role="dialog" it declares: Escape closes it,
    focus moves in on open and cycles inside, and goes back to whatever opened
    it on close. See hooks/useDialog.ts — none of that was happening before,
    and Tab walked straight out into the map behind this panel.
  */
  const dialogRef = useDialog({ open: isOpen, onClose: close });
  const motionEnabled = useMotionPreference();
  const counts = countByStatus();
  const total = totalFeatureCount();

  const content = (
    <>
      <div className="feature-status__head">
        <div>
          <h2>Feature Status</h2>
          <p>What's actually built, right now: not a roadmap dressed up as done.</p>
        </div>
        <button type="button" onClick={close} aria-label="Close feature status">
          ✕
        </button>
      </div>

      <div className="feature-status__summary">
        <div className="feature-status__stat feature-status__stat--live">
          <strong>{counts.live}</strong>
          <span>Live</span>
        </div>
        <div className="feature-status__stat feature-status__stat--partial">
          <strong>{counts.partial}</strong>
          <span>Partial</span>
        </div>
        <div className="feature-status__stat feature-status__stat--planned">
          <strong>{counts.planned}</strong>
          <span>Planned</span>
        </div>
        <div className="feature-status__stat">
          <strong>{total}</strong>
          <span>Total tracked</span>
        </div>
      </div>

      <div className="feature-status__body">
        {FEATURE_STATUS.map((cat) => (
          <section key={cat.category} className="feature-status__category">
            <h3>{cat.category}</h3>
            <ul>
              {cat.items.map((item) => (
                <li key={item.name}>
                  <div className="feature-status__item-head">
                    <span>{item.name}</span>
                    <StatusBadge status={item.status} />
                  </div>
                  {item.note && <p className="feature-status__note">{item.note}</p>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );

  if (!motionEnabled) {
    if (!isOpen) return null;
    return (
      <div className="feature-status-overlay" onClick={close}>
        <div ref={dialogRef} className="feature-status" role="dialog" aria-label="Feature status" onClick={(e) => e.stopPropagation()}>
          {content}
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="feature-status-overlay" onClick={close} {...overlayFade}>
          <motion.div ref={dialogRef} className="feature-status" role="dialog" aria-label="Feature status" onClick={(e) => e.stopPropagation()} {...panelRise}>
            {content}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

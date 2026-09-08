import { AnimatePresence, motion } from "framer-motion";
import { useAiStore } from "@/stores/aiStore";
import { useMotionPreference } from "@/hooks/useMotionPreference";
import "./CopilotLauncher.css";

export function CopilotLauncher() {
  const isOpen = useAiStore((s) => s.isCopilotOpen);
  const open = useAiStore((s) => s.openCopilot);
  const motionEnabled = useMotionPreference();

  if (!motionEnabled) {
    if (isOpen) return null;
    return (
      <button type="button" className="copilot-launcher" onClick={open} aria-label="Open Ask maNOWj">
        ✨ Ask maNOWj
      </button>
    );
  }

  return (
    <AnimatePresence>
      {!isOpen && (
        <motion.button
          type="button"
          className="copilot-launcher"
          onClick={open}
          aria-label="Open Ask maNOWj"
          initial={{ opacity: 0, scale: 0.85, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.85, y: 12 }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
        >
          ✨ Ask maNOWj
        </motion.button>
      )}
    </AnimatePresence>
  );
}

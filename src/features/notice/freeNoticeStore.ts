import { create } from "zustand";

/**
 * The "free for everyone" notice: shown once, on a visitor's first visit, and
 * reopenable from the header's More menu.
 *
 * Why it exists: people Manoj shared the site with were told it was a "third
 * party website" that was not legal to use. It is a free public website built
 * on openly licensed data, and the first screen now says so plainly - along
 * with the one caution that is genuinely true for anyone at work, which is to
 * keep confidential data out of every outside site, this one included.
 */
const SEEN_KEY = "geointel.freeNoticeSeen.v1";

function alreadySeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    // Blocked storage: show it. Seeing it twice is better than never.
    return false;
  }
}

interface FreeNoticeState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useFreeNoticeStore = create<FreeNoticeState>((set) => ({
  isOpen: !alreadySeen(),
  open: () => set({ isOpen: true }),
  close: () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Hidden for this visit only.
    }
    set({ isOpen: false });
  },
}));

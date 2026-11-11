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
/*
  First visit only. For a while this opened on every visit, on request, while
  the site was being promoted. It was then the first thing every returning
  visitor had to get past before reaching the map, every single time, and it
  was the slowest thing on the page to appear. The message has not gone
  anywhere: it is one tap away under More > Free to use.
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

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
  Shown on EVERY visit, by request: the site is being promoted, and the "free
  for everyone" message is the first thing each visit should say - not only
  a first-ever visit. It closes itself after four seconds (see
  FreeToUseNotice.tsx), so a returning visitor loses almost nothing, and the
  ✕ / Cancel close it at once.
*/
interface FreeNoticeState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useFreeNoticeStore = create<FreeNoticeState>((set) => ({
  isOpen: true,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));

import type { ShellSection } from "@/stores/shellStore";

/**
 * The one place that defines what the workspace contains. The rail, the
 * panel header and the mobile tab bar all read from this, so a section can
 * never appear in navigation without a title, or be added to the panel
 * without appearing in navigation.
 *
 * The section IDs are deliberately unchanged from the earlier
 * place/layers/tools/ai/travel naming even though every visible label has
 * moved on. IDs appear in persisted state and in every call site that opens
 * a section; renaming them would buy nothing a user can see and would risk
 * breaking those. What changed is the mental model the labels describe:
 * from "here are our features" to the order someone actually works in -
 * explore a place, bring in data, analyse it, ask about it, act on it.
 *
 * `hint` is written for someone who has never seen the app, and says what
 * the section is FOR rather than what it contains. That sentence is the
 * difference between finding a feature and asking someone where it is.
 */
export interface SectionDef {
  id: ShellSection;
  label: string;
  icon: string;
  title: string;
  hint: string;
}

export const SECTIONS: SectionDef[] = [
  {
    id: "place",
    label: "Explore",
    icon: "📍",
    title: "Explore this place",
    hint: "What's here: an intelligence score, property, mapped evidence, nearby places, weather and news.",
  },
  {
    /*
      Labelled "Data" until people told us otherwise. More than a hundred said
      some version of "where are the images": satellite imagery lives in this
      section, and "Data" reads as datasets and downloads, so nobody opened it
      looking for a picture of their street. "Layers" is the word every mapping
      tool uses for exactly this, and the hint now leads with satellite instead
      of burying it at the end of a list.

      The real fix for that complaint is the basemap button on the map itself
      (see BasemapSwitcher.tsx), because that is where people look first. This
      is the second place they look.
    */
    id: "layers",
    label: "Layers",
    icon: "🗺️",
    title: "Map layers & imagery",
    hint: "Satellite and aerial imagery, map style, 3D buildings, search area, live feeds and sharp past imagery back to 2014.",
  },
  {
    // "Analyse" with an s, matching every other label and hint in the app.
    // It read "Analyze" here and "Analyse" on the toolbar button, which is
    // the kind of inconsistency that makes a reader stop and wonder whether
    // they are looking at two different features.
    id: "tools",
    label: "Analyse",
    icon: "📐",
    title: "Analyse this area",
    hint: "Measure distance and area, find what's nearby or nearest, and score a site for a particular use.",
  },
  {
    // Was "Intelligence", then "Ask". "Ask" collided with the "✨ Ask maNOWj"
    // button floating on the map, which opens the chat rather than this
    // panel, so two different things answered to the same word - and the six
    // agents, the strongest thing in here, were not named anywhere a visitor
    // looks. "AI" is the word people now scan for, and the panel opens with
    // the agents.
    id: "ai",
    label: "AI",
    icon: "🤖",
    title: "AI agents & report",
    hint: "Six AI agents explain this place in plain words. You can also find things on the map, ask a question, or make a report to share.",
  },
  {
    id: "travel",
    label: "Plan",
    icon: "✈️",
    title: "Plan a trip",
    hint: "Search flights, trains, buses, hotels and cinemas for wherever you've selected.",
  },
];

export const SECTION_BY_ID = new Map(SECTIONS.map((section) => [section.id, section]));

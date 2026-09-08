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
 * from "here are our features" to the order someone actually works in —
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
    id: "layers",
    label: "Data",
    icon: "🗺️",
    title: "Map data & style",
    hint: "Choose what the map shows — map style, search area, data layers, live feeds and imagery back to 2012.",
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
    // Was labelled "Intelligence", which is the vaguest word on the rail: it
    // names a category rather than an action, and gives no clue that this is
    // where you type a question. "Ask" says what you do here, and matches the
    // name the feature itself now carries everywhere else.
    id: "ai",
    label: "Ask",
    icon: "🤖",
    // The title stays broader than the label on purpose. This section holds
    // four things — find on the map, Ask maNOWj, the agents, the report — and
    // titling the whole panel after one of them ("Ask maNOWj") put that name
    // twice on one screen, once as a heading over three features it does not
    // cover. The feature keeps its name where the feature actually is.
    title: "Ask & report",
    hint: "Ask a question in plain language, find things on the map, run a specialist agent, or generate a report you can share.",
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

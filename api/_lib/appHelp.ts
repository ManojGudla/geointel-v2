/**
 * Answers that need no AI model: questions about the app itself, greetings,
 * thanks, and who built it.
 *
 * Reported (25 November 2026): with no place selected, Ask maNOWj offers
 * "What can this app do?" as its FIRST suggestion, and tapping it answered
 * "The free AI models are busy (rate limited) right now." The answer to that
 * question never changes and is written down in the app already, yet it was
 * sent to a free model, shared with every other visitor, and failed whenever
 * that model was busy or the day's free allowance was used up. The same was
 * true of "hi" and "thanks", the commonest things a new visitor types.
 *
 * So these are answered here, instantly, every time, without spending any of
 * the AI allowance. Each answer is written from the app's own help text
 * (src/features/help/HelpGuide.tsx, src/features/shell/sections.ts) and code
 * (the score in src/features/intelligence/locationIntelligence.ts, the
 * providers in api/_routes). Change the app, change these.
 *
 * Matching is deliberately narrow: a pattern has to cover the WHOLE question.
 * "What can this app do?" is answered here; "What can I do near Charminar?"
 * is a question about a place and still goes to the model with the evidence.
 */

import { BUILT_IN_HELP_MODEL } from "../../src/types/ai.js";

/** What the Copilot reports as the "model" for these answers. */
export const BUILT_IN_MODEL = BUILT_IN_HELP_MODEL;

export type BuiltInTopic =
  | "greeting"
  | "thanks"
  | "goodbye"
  | "capabilities"
  | "assistant"
  | "getting-started"
  | "data-sources"
  | "score-accuracy"
  | "builder"
  | "co-founder"
  | "founder";

export interface BuiltInAnswer {
  topic: BuiltInTopic;
  answer: string;
}

/** Lower case, no punctuation or emoji, contractions opened up, single spaces. */
export function normaliseQuestion(raw: string): string {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[^\p{L}\p{M}\p{N}'\s-]/gu, " ")
    .replace(/\bwhat's\b/g, "what is")
    .replace(/\bwho's\b/g, "who is")
    .replace(/\bhow's\b/g, "how is")
    .replace(/\bwhere's\b/g, "where is")
    .replace(/\bgeo intel\b/g, "geointel")
    .replace(/(^|\s)-+|-+(\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Words in front of a question that do not change what it asks. */
const LEADING_FILLER = /^(?:(?:hey|hi|hello|ok|okay|so|um|uh|please|pls|plz|can you tell me|could you tell me|can u tell me|tell me|i want to know|i wanna know|i would like to know|do you know)\s+)+/;
// Not "here" or "now": "what can I do here?" is a different question from
// "what can I do?" once a place is selected.
const TRAILING_FILLER = /\s+(?:please|pls|plz|exactly|actually)$/;

/** The ways people name the app (after normaliseQuestion). */
const APP = "(?:(?:this|the) (?:app|application|site|website|web app|webapp|tool|platform|map|thing)|manowj(?: geointel)?|geointel)";

/** Who makes or runs something. */
const ROLE = "(?:developer|developers|creator|creators|maker|makers|founder|founders|owner|owners|builder)";

const GREETING = /^(hi+|hello+|hey+|hai|helo|hiya|howdy|yo|namaste|namaskaram|namaskar|vanakkam|good morning|good afternoon|good evening|gm)(?: (?:there|manowj|team|bot|everyone|all|friend))?$/;
const THANKS = /^(?:ok |okay |great |cool |nice )?(?:thanks|thank you|thank u|thankyou|thx|ty|tq|tnx|thanks a lot|thank you so much|thanks so much|many thanks|dhanyavad|dhanyavadalu|dhanyavaad|shukriya)(?: (?:manowj|bot|a lot|so much))?$/;
const GOODBYE = /^(?:ok |okay )?(?:bye|bye bye|goodbye|good bye|see you|see ya|cya|good night|gn)$/;

const TOPICS: Array<{
  topic: Exclude<BuiltInTopic, "greeting" | "thanks" | "goodbye">;
  patterns: RegExp[];
  /**
   * Questions that are about the app only while no place is selected. With
   * a place picked, "what is this?" means "what is this place?" and "what
   * can I do here?" means "what is there to do around it", and both belong
   * to the model and the evidence.
   */
  noPlaceOnly?: RegExp[];
}> = [
  // Most specific first: "co-founder" before anything that mentions "founder".
  {
    topic: "co-founder",
    patterns: [
      new RegExp(`^who (?:is|are) (?:the |your |its )?co[ -]?founders?(?: of ${APP})?$`),
      new RegExp(`^(?:does|do) (?:${APP}|it|you) have (?:a |any )?co[ -]?founders?$`),
      /^is there (?:a |any )?co[ -]?founders?$/,
    ],
  },
  {
    topic: "founder",
    patterns: [/^who is manoj(?: kumar)?(?: gudla)?$/, /^about manoj(?: kumar)?(?: gudla)?$/],
  },
  {
    topic: "builder",
    patterns: [
      new RegExp(`^who (?:built|made|created|developed|designed|coded|programmed|owns|runs|started|founded) (?:${APP}|you)$`),
      new RegExp(`^who (?:is|are) (?:your|its) ${ROLE}$`),
      new RegExp(`^who (?:is|are) the ${ROLE} of ${APP}$`),
      new RegExp(`^who is behind (?:${APP}|you)$`),
    ],
    // With a monument or a building selected, "who built this?" and "who is
    // the owner?" are about that place, not about the app.
    noPlaceOnly: [
      /^who (?:built|made|created|developed|designed|owns|runs|started|founded) (?:it|this)$/,
      /^who is behind (?:it|this)$/,
      new RegExp(`^who (?:is|are) the ${ROLE}$`),
    ],
  },
  {
    topic: "assistant",
    patterns: [/^(?:who|what) are you$/, /^(?:tell me )?about yourself$/],
  },
  {
    topic: "capabilities",
    patterns: [
      new RegExp(`^what (?:can|does|do) (?:${APP}|you) do(?: for me)?$`),
      new RegExp(`^what (?:${APP}|you) can do$`),
      new RegExp(`^what (?:is|are) ${APP}$`),
      new RegExp(`^what (?:is|are) (?:the |your |its )?(?:main |key )?features(?: of ${APP})?$`),
      new RegExp(`^(?:what|which) (?:all )?(?:things|stuff) can (?:${APP}|you) do$`),
      new RegExp(`^how does (?:${APP}|it) work$`),
      new RegExp(`^about ${APP}$`),
      /^(?:features|help|how can you help(?: me)?|(?:can|could) you help(?: me)?|what do you do)$/,
      new RegExp(`^what can i do with (?:${APP}|it)$`),
    ],
    noPlaceOnly: [/^what is this$/, /^what can i do(?: here)?$/, /^(?:what|which) (?:all )?(?:things|stuff) can i do(?: here)?$/],
  },
  {
    topic: "getting-started",
    patterns: [
      /^how (?:do|can|should) (?:i|we) (?:analy[sz]e|study|check|evaluate|research|explore|assess) (?:an|a|this|my|the|any) (?:area|place|location|site|neighbou?rhood|spot|locality|region)$/,
      /^how to (?:analy[sz]e|study|check|evaluate|research|explore|assess) (?:an|a|this|the|any) (?:area|place|location|site|neighbou?rhood|spot|locality|region)$/,
      new RegExp(`^how (?:to|do i|can i|should i) (?:use|start using|get started with) (?:${APP}|it|this)$`),
      /^how (?:to|do i|can i) (?:start|begin|get started)$/,
      /^where (?:do|should) i (?:start|begin)$/,
      /^(?:getting started|how to use)$/,
    ],
  },
  {
    topic: "data-sources",
    patterns: [
      new RegExp(`^(?:what|which) (?:data )?sources? (?:does|do|did) (?:${APP}|it|you|this) use$`),
      /^(?:what|which) (?:data )?sources? (?:are|is) used$/,
      /^where (?:does|do|did) (?:the|this|your|its|all the|all this) (?:data|information|info) come from$/,
      /^where do you get (?:the|your|this|all this) (?:data|information|info)(?: from)?$/,
      new RegExp(`^(?:what|which) data (?:does|do) (?:${APP}|it|you) use$`),
      /^(?:data sources?|sources)$/,
      /^is (?:the|this|your) data (?:real|live|real time|realtime|up to date|current)$/,
    ],
  },
  {
    topic: "score-accuracy",
    patterns: [
      /^how (?:accurate|reliable|good|trustworthy|correct|exact|precise) (?:is|are) (?:the|this|your|these) (?:location intelligence |intelligence |location )?(?:score|scores|rating|ratings)$/,
      /^how (?:is|are) (?:the|this|these) (?:location intelligence |intelligence |location )?(?:score|scores) (?:calculated|computed|worked out|made|measured|decided|given)$/,
      /^what (?:is|does) (?:the|this) (?:location )?intelligence score(?: mean)?$/,
      /^how (?:accurate|reliable|trustworthy|correct) (?:is|are) (?:the|this|your) (?:data|information|info|results|analysis)$/,
      new RegExp(`^how (?:accurate|reliable|trustworthy|correct) is ${APP}$`),
    ],
  },
];

function greetingWord(match: string): string {
  if (/^(namaste|namaskaram|namaskar|vanakkam)/.test(match)) return match.split(" ")[0]!.replace(/^./, (c) => c.toUpperCase());
  const timed = /^good (morning|afternoon|evening)/.exec(match);
  if (timed) return `Good ${timed[1]}`;
  return "Hi";
}

function answerFor(topic: BuiltInTopic, hasPlace: boolean, greeting = "Hi"): string {
  switch (topic) {
    case "greeting":
      return hasPlace
        ? `${greeting}! Ask me anything about the place you've picked: what's there, what the area is like, the weather, or how to get around. You can also ask how the app works.`
        : `${greeting}! I'm Ask maNOWj. Search for a place or tap the map, then ask me anything about it: what's there, what the area is like, the weather, or how to get around. You can also ask how the app works.`;
    case "thanks":
      return hasPlace ? "You're welcome! Ask me anything else about this place or the app." : "You're welcome! Pick a place on the map whenever you like, and ask me about it.";
    case "goodbye":
      return "Bye! Come back any time.";
    case "assistant":
      return "I'm Ask maNOWj, the assistant inside maNOWj GeoIntel. I answer questions about the place you pick on the map, using real map data the app fetches for it, and questions about how the app works.";
    case "capabilities":
      return [
        "maNOWj GeoIntel shows you what any place is really like, using real, public map data.",
        "Search for a place or tap the map. Explore then shows its intelligence score, its property type with the evidence behind it, nearby places, weather and news. You can also get directions by car, on foot or by bike.",
        "Analyse measures distances and areas, finds what's nearby or nearest, and scores a site for a use such as a shop, a school or a clinic. Layers adds satellite imagery, 3D buildings and data layers.",
        "In the AI tab, six AI agents explain the place in plain words, and Make My Trip plans a trip from real, mapped places nearby. Plan opens real booking sites for flights, trains, buses, hotels and cinemas.",
        hasPlace ? "Ask me anything about the place you've picked." : "Pick a place, then ask me anything about it.",
      ].join("\n\n");
    case "getting-started":
      return [
        hasPlace
          ? "You've already picked a place, so the Explore panel has its intelligence score, the property type and its evidence, nearby places and the weather."
          : "Pick the area first: search for a place or tap a spot on the map. The Explore panel then fills in by itself with the intelligence score, the property type and its evidence, nearby places and the weather.",
        "Layers sets how far around the point to look and which data shows on the map. Analyse has the tools: measure distance or area, find what's nearby or nearest, and score the site for a use you choose, such as a shop, a school or a clinic. For a reading in plain words, open the AI tab and run an agent, or ask me about the place.",
      ].join("\n\n");
    case "data-sources":
      return [
        "Everything comes from free, public sources, fetched live by the app's own server.",
        "Place search: OpenStreetMap, through Nominatim and Photon. Buildings, shops, amenities and other mapped features: OpenStreetMap, through Overpass. Routes: OSRM. Weather and air quality: Open-Meteo, with rain radar from RainViewer. News: Google News. Population and government officials: Wikidata. Earthquakes: USGS. Satellite imagery: Esri, including its archive of past imagery, and NASA.",
        "The AI explains these facts; it is not a source of its own. It is told to use only them, and any sentence with a number that isn't in them is removed before you see it.",
      ].join("\n\n");
    case "score-accuracy":
      return [
        "It is as good as the map data behind it, and it tells you how good that is.",
        "The score counts what is mapped in OpenStreetMap around the point: public transport, shops and offices, amenities, buildings, and parks and water, plus air quality when a reading is available. Each part is scored from those counts, and the overall number is a weighted average of only the parts that had data. Nothing is filled in by guessing: flood, crime and earthquake risk are not scored at all, because there is no free data for them.",
        "Where little is mapped, the card says its confidence is low, and a zero can mean 'not mapped yet' rather than 'not there'. So use it to compare places quickly, not as an official rating. Tap Why next to the score to see what pushed it up or down.",
      ].join("\n\n");
    case "builder":
      return "maNOWj GeoIntel was built by Manoj Kumar Gudla, its founder and developer.";
    case "co-founder":
      return "maNOWj doesn't have a co-founder right now. If you'd like to join the team, open More at the top of the app and choose Join Our Team.";
    case "founder":
      return "Manoj Kumar Gudla is the founder and developer of maNOWj GeoIntel. You can reach him through Feedback or Join Our Team, both under More at the top of the app.";
  }
}

/**
 * The built-in answer to `question`, or null when it needs the model.
 * `hasPlace` is whether a place is selected, which changes a few answers.
 */
export function builtInAnswer(question: string, hasPlace: boolean): BuiltInAnswer | null {
  const base = normaliseQuestion(question);
  if (!base) return null;

  const greeting = GREETING.exec(base);
  if (greeting) return { topic: "greeting", answer: answerFor("greeting", hasPlace, greetingWord(greeting[1]!)) };
  if (THANKS.test(base)) return { topic: "thanks", answer: answerFor("thanks", hasPlace) };
  if (GOODBYE.test(base)) return { topic: "goodbye", answer: answerFor("goodbye", hasPlace) };

  const asked = base.replace(LEADING_FILLER, "").replace(TRAILING_FILLER, "").trim();
  for (const { topic, patterns, noPlaceOnly = [] } of TOPICS) {
    const matches = patterns.some((p) => p.test(asked)) || (!hasPlace && noPlaceOnly.some((p) => p.test(asked)));
    if (matches) return { topic, answer: answerFor(topic, hasPlace) };
  }
  return null;
}

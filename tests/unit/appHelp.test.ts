import { describe, expect, it } from "vitest";
import { builtInAnswer, normaliseQuestion } from "../../api/_lib/appHelp";
import { copilotSuggestions } from "../../src/features/ai/copilotSuggestions";

/**
 * Reported 25 November 2026: "What can this app do?", the first suggestion
 * Ask maNOWj offers, answered "The free AI models are busy (rate limited)".
 * Questions about the app itself now have built-in answers, so they work
 * whatever state the free AI is in.
 */
const topic = (question: string, hasPlace = false) => builtInAnswer(question, hasPlace)?.topic ?? null;

describe("built-in answers", () => {
  it("answer every suggestion offered before a place is picked, without the AI", () => {
    const chips = copilotSuggestions({ placeName: null, radiusMeters: 500, activeLayers: [], hasAnalysis: false, analysisTitle: null, is3D: false });
    expect(chips.map((chip) => topic(chip))).toEqual(["capabilities", "getting-started", "data-sources", "score-accuracy"]);
  });

  it("recognise the ways people ask what the app is", () => {
    for (const q of ["What can you do?", "what's maNOWj?", "What is maNOWj GeoIntel", "How does this app work?", "Hi, what can this app do?", "help", "What are the features?", "Can you help me?"]) {
      expect(topic(q), q).toBe("capabilities");
    }
  });

  it("greet back, echoing a greeting in the visitor's own word", () => {
    expect(builtInAnswer("Namaste 🙏", false)?.answer).toMatch(/^Namaste! /);
    expect(builtInAnswer("good morning!", true)?.answer).toMatch(/^Good morning! Ask me anything about the place you've picked/);
    expect(builtInAnswer("hii", false)?.answer).toMatch(/^Hi! I'm Ask maNOWj\. Search for a place or tap the map/);
    expect(topic("Hello maNOWj")).toBe("greeting");
  });

  it("answer thanks and goodbye", () => {
    expect(topic("thanks!")).toBe("thanks");
    expect(topic("Thank you so much")).toBe("thanks");
    expect(topic("ok thanks")).toBe("thanks");
    expect(topic("bye")).toBe("goodbye");
  });

  it("say who built the app, with the menu label the app really uses", () => {
    expect(topic("Who built this app?")).toBe("builder");
    expect(topic("who made you")).toBe("builder");
    expect(topic("Who is the founder of maNOWj?")).toBe("builder");
    expect(topic("Who is the co-founder of maNOWj?")).toBe("co-founder");
    expect(topic("who is manoj")).toBe("founder");
    expect(builtInAnswer("who is the cofounder", false)!.answer).toContain("Join Our Team");
    expect(builtInAnswer("who is manoj kumar gudla", false)!.answer).toContain("Join Our Team");
  });

  it("treat 'what is this?' and 'who built this?' as questions about the place once one is picked", () => {
    expect(topic("What is this?", false)).toBe("capabilities");
    expect(topic("What is this?", true)).toBeNull();
    expect(topic("What can I do here?", false)).toBe("capabilities");
    expect(topic("What can I do here?", true)).toBeNull();
    expect(topic("Who built this?", false)).toBe("builder");
    expect(topic("Who built this?", true)).toBeNull();
    expect(topic("Who is the owner?", true)).toBeNull();
    // Naming the app keeps it about the app either way.
    expect(topic("What is this app?", true)).toBe("capabilities");
  });

  it("leave every question about a place to the model and the evidence", () => {
    for (const q of [
      "What can I do near Charminar?",
      "How do I get to the airport?",
      "Analyse this area",
      "What is the population here?",
      "Who is the mayor of Hyderabad?",
      "Is Gachibowli a good place for a coffee shop?",
      "Who built the Charminar?",
      "how accurate is the weather forecast?",
      "what's the weather here?",
      "ee area lo emi unnayi?",
      "ఇక్కడ ఏమి ఉంది?",
      "hello, which hospitals are close by?",
    ]) {
      expect(topic(q, true), q).toBeNull();
      expect(topic(q, false), q).toBeNull();
    }
  });

  it("change the getting-started answer once a place is picked", () => {
    expect(builtInAnswer("How do I analyse an area?", false)!.answer).toMatch(/^Pick the area first/);
    expect(builtInAnswer("How do I analyse an area?", true)!.answer).toMatch(/^You've already picked a place/);
  });

  it("are plain chat text: no markdown and no em dashes", () => {
    const questions = ["hi", "thanks", "bye", "who are you", "what can this app do", "how do i analyse an area", "what data sources does this use", "how accurate is the location intelligence score", "who built this app", "who is the co-founder", "who is manoj"];
    for (const q of questions) {
      const answer = builtInAnswer(q, false)!.answer;
      expect(answer, q).not.toMatch(/\*\*|^#|^\s*[-*] |—/m);
    }
  });

  it("normalise punctuation, emoji, case and contractions", () => {
    expect(normaliseQuestion("  What’s   maNOWj??? 🤔 ")).toBe("what is manowj");
    expect(normaliseQuestion("Who's the co-founder?")).toBe("who is the co-founder");
  });
});

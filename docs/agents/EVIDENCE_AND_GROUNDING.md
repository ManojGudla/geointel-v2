# Evidence and grounding

The rules that keep an agent answer to the facts. Code:
`api/_lib/evidence/grounding.ts` and `gather.ts`.

## An evidence item

```ts
{ id: "E3", label: "Hospitals and clinics within 1 km", value: "4 (closest: Care Clinic, 350 m)",
  kind: "retrieved", source: "OpenStreetMap via Overpass", retrievedAt: "2026-11-25T07:30:00Z",
  note: "Only the 60 closest places were fetched, so this is a sample, not a full count." }
```

| Kind | Meaning | Shown as |
|---|---|---|
| retrieved | A provider's own value | Verified data |
| computed | Worked out by this app from retrieved values; `note` gives the method | Computed |
| unavailable | Asked for and not obtained; `note` gives the reason | Unavailable |

The model's sentences are shown under "AI interpretation of the evidence".
Estimates are not produced; trip visit times are labelled as this app's
assumptions.

`retrievedAt` is the provider's own time where the route reports one
(Overpass `fetchedAt`, Open-Meteo `fetchedAt`, Wikidata officials). For
reverse geocoding, search and routing, which report none, it is the time
this server received the answer, which may be up to that route's cache
lifetime (10 minutes, 5 minutes and 60 seconds) after the provider's.

## Where facts may come from

Only from the server's own calls to the providers. The browser sends an
anchor (coordinates, radius, route ends, search text) and nothing it sends
is shown to the model as fact. Office holders are looked up from Wikidata by
the server, only when a Copilot question is about them.

## Citations

The model must end each factual sentence with the ids it used, `[E3]` or
`[E3, E7]`. The server turns them into `evidenceIds` and removes them from
the text; unknown ids are dropped. On screen each citation is a chip that
opens the evidence list at that item.

## The number check

Every sentence is checked before anyone sees it. A sentence is dropped if it
contains any number that is not:

- written in an evidence item's label, value or note (or that number rounded
  to a whole number or one decimal), or
- part of an as-of date or time written exactly as the evidence writes it
  ("25 Nov 2026", "07:30 UTC"), or
- in the person's own question or request, a help article given to the
  Copilot, or the recent conversation.

So unit conversions, sums, averages and remembered figures cannot reach the
reader. If nothing survives, the answer is "Insufficient verified data to
provide a reliable conclusion." The number of removed sentences is shown.
Numbers written in words ("two") are not checked.

## Confidence

Worked out from which sources answered, never asked of the model. For each
source an agent cannot do without: 1 if it answered in full, 0.5 if partly
(Overpass stopped early; an older saved copy), 0 if not. The average gives:

| Average | Level | What happens |
|---|---|---|
| 0 | insufficient | No model call; the brief's sentence and the reason |
| under 0.5 | low | Answer, with the problems listed |
| under 1, or an optional source failed | medium | Answer, with the problems listed |
| 1 and every optional source answered | high | "Every source this agent uses answered in full." |

Required sources: Search: place. GIS: gis. Property: property. Navigation:
route. Travel: weather and nearby. Make My Trip: nearby.

## Injection and abuse

- The evidence table and help articles are wrapped in a fresh random fence,
  with rules telling the model that nothing inside it is an instruction
  (`api/_lib/untrusted.ts`). Labels and values are cleaned and capped.
- Request bodies over 20 KB are refused; requests and questions are capped
  at 500 characters.
- The shared grounding rules forbid claims about zoning, ownership, value,
  legal status and occupancy, and answers about places other than the
  selected one.

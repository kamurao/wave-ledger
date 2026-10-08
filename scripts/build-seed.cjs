// Regenerates seed-data/board.json, the starter board. Kept as a script so the
// references (epic, milestone, dependency ids) are checked rather than hand-typed
// into JSON.
//
//   node scripts/build-seed.cjs
const fs = require("fs");
const path = require("path");

const carried = (id) => `Carried over from the previous board (\`${id}\`).`;

const milestones = [
  {
    id: "m-concept",
    name: "Concept & Pillars",
    status: "active",
    goal: "The fantasy, the pillars and the core loop are written down and agreed by all three of us. We know what game we are making.",
  },
  {
    id: "m-prototype",
    name: "Playable Prototype",
    status: "upcoming",
    goal: "The core loop is playable end to end on one level, and a stranger can tell us whether it is fun.",
  },
  {
    id: "m-vertical-slice",
    name: "Vertical Slice",
    status: "upcoming",
    goal: "One act at ship quality: art, audio, UX, onboarding and balance. The bar every later act is held to.",
  },
  {
    id: "m-alpha",
    name: "Alpha",
    status: "upcoming",
    goal: "Content complete: every act, tower, enemy and progression system is in, even if rough.",
  },
  {
    id: "m-beta",
    name: "Beta",
    status: "upcoming",
    goal: "Balanced, polished and bug-fixed. Only release blockers remain.",
  },
  { id: "m-release", name: "Release", status: "upcoming", goal: "Ship it." },
];

const epics = [
  ["e-vision", "Vision & Pillars", "e1", "What the game is, who it is for, and the few things we refuse to compromise on."],
  ["e-core-loop", "Core Loop & Pacing", "e2", "Moment to moment, wave to wave, level to level. Session length, tempo, win and lose."],
  ["e-towers", "Towers & Upgrades", "e3", "Tower roles, upgrade paths, branches and champions, targeting."],
  ["e-hero", "Hero", "e4", "Whether and how the player is present on the field: abilities, aggro, progression."],
  ["e-enemies", "Enemies & Bosses", "e5", "Enemy roster, damage types and resistances, elite and boss encounters."],
  ["e-cards", "Cards & Keywords", "e6", "Keywords, synergies and the card system. The card engine's future is itself an open question."],
  ["e-economy", "Economy & Balance", "e7", "Income, sinks, pacing curve, and the numbers that make it fair."],
  ["e-progression", "Run Structure & Progression", "e8", "Acts, levels, unlocks, relics, skill trees and the meta layer."],
  ["e-levels", "Levels & Encounters", "e1", "Map design, lanes, gates and key mechanics, encounter variety."],
  ["e-narrative", "Narrative & World", "e2", "The story that ties the ideas together, characters, tone."],
  ["e-ux", "UI/UX & Game Feel", "e3", "HUD, onboarding, readability, juice, camera."],
  ["e-art-audio", "Art & Audio", "e4", "Art direction, assets, music and sound."],
  ["e-tech", "Tech, Tools & Pipeline", "e5", "Engine work, tooling, CI and the simulation bot."],
  ["e-playtest", "Playtesting & Research", "e6", "Reference games, playtest protocol, and what we learn from watching people play."],
].map(([id, name, color, summary]) => ({ id, name, color, summary }));

const T = (id, title, o) => ({ id, title, ...o });

const tickets = [
  // ---- concept: the foundations ------------------------------------------
  T("t-card-engine-future", "Decide: does the **card engine** stay, go, or become something else?", {
    kind: "question",
    status: "todo",
    epic: "e-cards",
    milestone: "m-concept",
    priority: "p0",
    estimate: "M",
    labels: ["blocks-design"],
    notes:
      "The in-flight RTS loop work (branch feature/ken-rts-loop) strips the card engine: spells become Hero abilities, monster cards become a Barracks tower. Most of Cards & Keywords, and part of Progression, depends on this answer. Settle it before writing more card or reward design.",
    criteria:
      "- [ ] Options written down with what each costs us\n- [ ] Playtested both loops back to back\n- [ ] Decision recorded here, with the reason",
  }),
  T("t-design-pillars", "Write the **design pillars** (3 to 5) and the elevator pitch", {
    kind: "design",
    status: "todo",
    epic: "e-vision",
    milestone: "m-concept",
    priority: "p0",
    estimate: "S",
    notes:
      "A pillar is a sentence we can use to say no. Each one should name something we would cut to protect it.",
    criteria:
      "- [ ] 3 to 5 pillars, one sentence each\n- [ ] Each pillar names what we would cut to protect it\n- [ ] Elevator pitch in two sentences\n- [ ] All three of us agree",
  }),
  T("t-core-loop-diagram", "Draw the **core loop** on one page: moment, wave, level, run", {
    kind: "design",
    status: "todo",
    epic: "e-core-loop",
    milestone: "m-concept",
    priority: "p0",
    estimate: "M",
    notes:
      "One diagram per time scale. Mark where the player makes a meaningful decision, and where they are only waiting.",
    criteria:
      "- [ ] Four time scales drawn: moment, wave, level, run\n- [ ] Every decision point marked\n- [ ] Every waiting point marked\n- [ ] Reviewed by all three of us",
  }),
  T("t-player-fantasy", "Define the **player fantasy** and target audience", {
    kind: "design",
    status: "backlog",
    epic: "e-vision",
    milestone: "m-concept",
    priority: "p1",
    estimate: "S",
    notes: "Who is this for, what do they want to feel, and which games are they playing now.",
  }),
  T("t-win-lose", "Define **win and lose** conditions at wave, level and run scale", {
    kind: "design",
    status: "backlog",
    epic: "e-core-loop",
    milestone: "m-concept",
    priority: "p1",
    estimate: "S",
    depends_on: ["t-core-loop-diagram"],
  }),
  T("t-session-length", "Set the target **session length** and run length", {
    kind: "question",
    status: "backlog",
    epic: "e-core-loop",
    milestone: "m-concept",
    priority: "p1",
    estimate: "S",
    notes:
      "Closely tied to the pacing complaint. Pick numbers (minutes per level, levels per act, acts per run) and design backwards from them.",
  }),
  T("t-gdd-index", "Consolidate `docs/` into one **GDD index**: what is current, what is superseded", {
    kind: "task",
    status: "backlog",
    epic: "e-vision",
    milestone: "m-concept",
    priority: "p2",
    estimate: "M",
    notes:
      "The game repo's docs/ already holds ECONOMY_AND_UI_SPEC, SCALING_AND_SYNERGY, BETWEEN_WAVES_DESIGN, HERO_ECONOMY_DESIGN_IDEAS and more. Some predate the RTS pivot. One index that says which are live stops us designing from stale pages.",
  }),

  // ---- carried over from the old board -------------------------------------
  T("t-want-a-hero", "Do we want a **hero**?", {
    kind: "question",
    status: "todo",
    epic: "e-hero",
    milestone: "m-concept",
    priority: "p1",
    estimate: "S",
    notes:
      carried("t-want-a-hero") +
      " The Hero is already built and growing; this is the question of whether it earns its place in the pillars.",
  }),
  T("t-slow-pacing", "How do we want to deal with the slow-paced gameplay?", {
    kind: "question",
    status: "todo",
    epic: "e-core-loop",
    milestone: "m-concept",
    priority: "p1",
    estimate: "M",
    notes: carried("t-slow-pacing"),
  }),
  T("t-towers-middle", "Towers in the middle?", {
    kind: "question",
    status: "backlog",
    epic: "e-levels",
    milestone: "m-prototype",
    priority: "p2",
    estimate: "S",
    notes: carried("t-towers-middle"),
  }),
  T("t-act-progression", "Figure out how to progress through acts, and make it faster paced", {
    kind: "design",
    status: "backlog",
    epic: "e-progression",
    milestone: "m-prototype",
    priority: "p2",
    estimate: "L",
    notes: carried("t-act-progression"),
  }),
  T("t-card-end-of-wave", "Card from your deck at the end of your wave, not at the start", {
    kind: "design",
    status: "backlog",
    epic: "e-cards",
    milestone: "m-prototype",
    priority: "p3",
    estimate: "S",
    depends_on: ["t-card-engine-future"],
    notes: carried("t-card-end-of-wave"),
  }),
  T("t-deck-creation", "How do we let players create the deck?", {
    kind: "question",
    status: "backlog",
    epic: "e-cards",
    milestone: "m-prototype",
    priority: "p2",
    estimate: "M",
    depends_on: ["t-card-engine-future"],
    notes: carried("t-deck-creation"),
  }),
  T("t-base-chip-damage", "Does our base take chip damage? Does it heal after every level?", {
    kind: "question",
    status: "backlog",
    epic: "e-core-loop",
    milestone: "m-prototype",
    priority: "p2",
    estimate: "S",
    notes: carried("t-base-chip-damage"),
  }),
  T("t-balancing-engine-cracks", "Update the balancing engine to reveal cracks?", {
    kind: "question",
    status: "backlog",
    epic: "e-economy",
    milestone: "m-prototype",
    priority: "p3",
    estimate: "S",
    notes: carried("t-balancing-engine-cracks"),
  }),
  T("t-gem-balance", "Balance gem income so the Hero cannot tank waves to mine a lot of gold", {
    kind: "design",
    status: "backlog",
    epic: "e-economy",
    milestone: "m-prototype",
    priority: "p2",
    estimate: "M",
    notes: carried("t-gem-balance"),
  }),
  T("t-key-gate", "KEY MECHANICS: **Gate**", {
    kind: "design",
    status: "backlog",
    epic: "e-levels",
    milestone: "m-prototype",
    priority: "p2",
    estimate: "M",
    notes: carried("t-key-gate") + " Needs a real definition before it can be built.",
  }),
  T("t-key-levels", "KEY MECHANICS: **Levels**", {
    kind: "design",
    status: "backlog",
    epic: "e-progression",
    milestone: "m-prototype",
    priority: "p2",
    estimate: "M",
    notes: carried("t-key-levels") + " Needs a real definition before it can be built.",
  }),
  T("t-keyword-mechanics", "**Keyword** mechanics: bold the keywords (**slow** etc.)", {
    kind: "design",
    status: "backlog",
    epic: "e-cards",
    milestone: "m-prototype",
    priority: "p2",
    estimate: "M",
    notes: carried("t-keyword-mechanics"),
  }),
  T("t-max-level-skill-tree", "If we max-level a tower it goes into a different **skill tree**", {
    kind: "design",
    status: "backlog",
    epic: "e-towers",
    milestone: "m-vertical-slice",
    priority: "p3",
    estimate: "L",
    notes: carried("t-max-level-skill-tree"),
  }),
  T("t-overarching-story", "Come up with an **overarching story** to get our ideas together", {
    kind: "design",
    status: "backlog",
    epic: "e-narrative",
    milestone: "m-concept",
    priority: "p2",
    estimate: "L",
    notes: carried("t-overarching-story"),
  }),
  T("t-play-more-games", "Play more games: we keep referring to **STS2**", {
    kind: "task",
    status: "todo",
    epic: "e-playtest",
    milestone: "m-concept",
    priority: "p2",
    estimate: "M",
    notes:
      carried("t-play-more-games") +
      " Research task: play other deckbuilders and tower defense games for reference. Write down, per game, one thing we take and one thing we refuse.",
    criteria:
      "- [ ] Shortlist of 5 or more games, agreed\n- [ ] One-paragraph teardown per game\n- [ ] Take / refuse list pinned to the Vision epic",
  }),
  T("t-focus-fire-favor", "Focus fire: can certain towers **favor** certain enemies?", {
    kind: "question",
    status: "backlog",
    epic: "e-towers",
    milestone: "m-prototype",
    priority: "p2",
    estimate: "S",
    notes: carried("t-focus-fire-favor"),
  }),
  T("t-elemental-minions", "**Elemental** minions?", {
    kind: "question",
    status: "backlog",
    epic: "e-enemies",
    milestone: "m-vertical-slice",
    priority: "p3",
    estimate: "S",
    notes: carried("t-elemental-minions"),
  }),

  // ---- prototype: the systems that need writing down -----------------------
  T("t-tower-roles", "Define **tower roles** and a counter matrix against enemy types", {
    kind: "design",
    status: "backlog",
    epic: "e-towers",
    milestone: "m-prototype",
    priority: "p1",
    estimate: "M",
    notes:
      "A tower earns its slot by being the right answer to something. Write the matrix first, then check every tower and every enemy has a row.",
  }),
  T("t-keyword-glossary", "Write the **keyword glossary** as the single source of truth", {
    kind: "design",
    status: "backlog",
    epic: "e-cards",
    milestone: "m-prototype",
    priority: "p1",
    estimate: "S",
    notes:
      "One line per keyword: what it does, what it stacks with, what it counters. Tooltips and card text pull from it.",
  }),
  T("t-economy-model", "Document the **economy model**: sources, sinks, target pacing curve", {
    kind: "design",
    status: "backlog",
    epic: "e-economy",
    milestone: "m-prototype",
    priority: "p1",
    estimate: "M",
    depends_on: ["t-core-loop-diagram"],
  }),
  T("t-balance-targets", "Set the **balance targets** the sim bot enforces", {
    kind: "task",
    status: "backlog",
    epic: "e-tech",
    milestone: "m-prototype",
    priority: "p2",
    estimate: "S",
    notes:
      "CI currently fails if the production bot's win rate falls outside 90 to 98 percent. Decide whether that is the target we want, and what else (pacing, resource curve, boss time-to-kill) the bot should gate.",
  }),
  T("t-vertical-slice-scope", "Scope the **vertical slice**", {
    kind: "design",
    status: "backlog",
    epic: "e-vision",
    milestone: "m-prototype",
    priority: "p1",
    estimate: "M",
    depends_on: ["t-design-pillars"],
    notes:
      "Which act, which towers, which enemies, which boss. Small enough to finish, representative enough to judge the whole game by.",
  }),
  T("t-playtest-protocol", "Write the **playtest protocol**: build to test, questions, how we record results", {
    kind: "task",
    status: "backlog",
    epic: "e-playtest",
    milestone: "m-prototype",
    priority: "p1",
    estimate: "S",
    criteria:
      "- [ ] A one-page script\n- [ ] A fixed set of questions\n- [ ] Somewhere results get written down, tagged by build",
  }),
  T("t-playtest-round-1", "Run **playtest round 1** with outside players", {
    kind: "task",
    status: "backlog",
    epic: "e-playtest",
    milestone: "m-prototype",
    priority: "p1",
    estimate: "L",
    depends_on: ["t-playtest-protocol"],
    notes: "Five players who have not seen the game. Watch, do not explain.",
  }),

  // ---- vertical slice ------------------------------------------------------
  T("t-difficulty-curve", "Chart the **difficulty curve** across waves, levels and acts", {
    kind: "design",
    status: "backlog",
    epic: "e-progression",
    milestone: "m-vertical-slice",
    priority: "p2",
    estimate: "M",
    depends_on: ["t-economy-model"],
  }),
  T("t-first-five-minutes", "Design the **first five minutes**: tutorial and onboarding", {
    kind: "design",
    status: "backlog",
    epic: "e-ux",
    milestone: "m-vertical-slice",
    priority: "p2",
    estimate: "M",
  }),
  T("t-art-direction", "Lock the **art direction** and style guide", {
    kind: "art",
    status: "backlog",
    epic: "e-art-audio",
    milestone: "m-vertical-slice",
    priority: "p2",
    estimate: "L",
  }),
  T("t-audio-direction", "Set the **audio direction**: music, SFX palette, voice", {
    kind: "audio",
    status: "backlog",
    epic: "e-art-audio",
    milestone: "m-vertical-slice",
    priority: "p3",
    estimate: "M",
  }),
];

// Every reference must resolve, or the seed would fail halfway through.
const eIds = new Set(epics.map((e) => e.id));
const mIds = new Set(milestones.map((m) => m.id));
const tIds = new Set(tickets.map((t) => t.id));
for (const t of tickets) {
  if (!eIds.has(t.epic)) throw new Error(`bad epic on ${t.id}`);
  if (!mIds.has(t.milestone)) throw new Error(`bad milestone on ${t.id}`);
  for (const d of t.depends_on || []) if (!tIds.has(d)) throw new Error(`bad dependency ${t.id} -> ${d}`);
}
if (tIds.size !== tickets.length) throw new Error("duplicate ticket id");

fs.writeFileSync(
  path.join(__dirname, "..", "seed-data", "board.json"),
  JSON.stringify({ milestones, epics, tickets }, null, 2) + "\n",
);
console.log(`${milestones.length} milestones, ${epics.length} epics, ${tickets.length} tickets`);

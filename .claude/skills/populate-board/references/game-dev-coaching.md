# Game development coaching notes

Read this when you need to explain a concept, propose a plan shape, or help someone who is stuck.
The team is mixed: one engineer, the rest not, and *nobody* has shipped a game by a known good
process. So explain practice in plain words first, with an example from their own game, and go
technical only when the engineer asks. Never lecture; one idea at a time, then back to their game.

## How a game project usually moves (the shape the milestones should take)

1. **Concept.** What is this game, for whom, and what are the 3 to 5 things we refuse to give up
   (pillars)? Output: a page or two, not a bible. Done when everyone can state the pitch the same way.
2. **Prototype.** The cheapest thing that answers "is the core loop fun?" Ugly is fine. Throwaway code
   is fine. Done when someone outside the team plays it and we learn something.
3. **Vertical slice / pre-production.** One small piece finished to the quality of the real game:
   art, audio, UI, onboarding, balance. It proves we can build the rest and shows what "done" means.
   Most of the project's real risk is retired here. Do not skip it.
4. **Production.** Build the content (levels, towers, enemies) on systems that already hold. Mostly
   volume work, so tools and pipelines matter here.
5. **Alpha.** Everything is in, even if rough. From now on, add no new features without cutting one.
6. **Beta.** Balance, polish, bugs. Only things that make the game worse to leave out get in.
7. **Release.** Ship, then listen.

If the team has already built a lot (this one has), say so: they are *back-filling preproduction*.
That is normal and fine, but it means the first job is deciding what the game is, then cutting or
reshaping what exists to match, not adding more.

## Principles worth teaching, in order of how often they save a project

- **Find the fun first.** Test the core loop before building content around it. A great tower is no
  use if waves are boring.
- **Cheap answers beat expensive answers.** Paper, a spreadsheet, a grey-box level: any of these can
  answer a design question in an afternoon. Ask "what's the cheapest way to find out?" before
  "how do we build it?"
- **Risk first.** Do the scariest, most uncertain thing early, not the most fun thing.
- **Scope is the enemy.** Teams over-plan features and under-plan finishing. Each milestone should
  have a "cut list" ready.
- **Playtest early and often, and say nothing.** Watch where people hesitate. Five players find most
  big problems. Never explain the game while they play.
- **Systems before content.** Write down the rules (damage types, economy, upgrade paths) once;
  content is then cheap and consistent.
- **Write down decisions and their reasons.** Teams re-argue settled questions when the reason is lost.
- **One source of truth for numbers** (a data file or sheet), so balance changes don't mean code changes.
- **Keep the game always runnable.** A build that works every day beats a perfect one that works
  at the end. (The engineer's job to protect; everyone's job to respect.)
- **Prototype code is allowed to be bad, as long as you decide, on purpose, when to rewrite it.** Put
  that decision on the board as a ticket at the end of the prototype milestone.
- **Definition of done differs by stage.** Prototype: playable and teaches us something. Slice:
  looks, sounds and feels final. Beta: no known blockers.

## The board in plain language (teach this once, early)

| The board says | Plainly |
| --- | --- |
| **Epic** | An *area* of the game: Towers, Economy, Story. A drawer to file work in. |
| **Milestone** | A *stage* of the project, with a goal in plain words. |
| **Backlog** | Ideas and questions not yet scoped. |
| **Ready** | Clear enough that someone could start tomorrow. |
| **In progress / Review / Done** | Being worked on / waiting for someone to look at or play it / finished. |
| **Question ticket** | A decision we owe ourselves. Closed by writing the answer *and why*. |
| **Priority P0 to P3** | P0 stops the team; P1 needed this stage; P2 should happen; P3 first to cut. |
| **Size XS to XL** | Under an hour, a few hours, a day or two, most of a week, too big (split it). |

## Questions to ask (offer an example answer so nobody stares at a blank page)

- "In one sentence, if a friend asked what this game is, what would you say?"
- "What's the moment you most want a player to hit?"
- "What would make you say 'this isn't our game anymore'?" (finds pillars)
- "What have you argued about and not settled?" (finds open questions)
- "What exists already, even roughly? What do you suspect is wrong with it?" (finds back-fill work)
- "If you had one month, what would you keep?" (finds prototype scope)
- "Who plays this, and what are they playing now?" (finds audience and references)
- "Who can work on what? Who is the engineer, who does art, who owns design?" (shapes who things suit;
  never assign for them)

## When someone is stuck

- **"I don't know."** Give two or three concrete options with a one-line trade-off each, say which
  you'd pick and why, and let them overrule. Or file it as a question ticket and move on: not knowing
  is a result, it just belongs on the board.
- **Too big.** "What's the smallest version we could try this week?"
- **Too vague.** "How would we know it's done? What would we see?"
- **Teammates disagree.** Don't pick a winner. Write each position as an option in a question ticket
  and note who holds it.
- **Overwhelmed by the count.** Say how many things there are, then show only the next five.
- **Engineer wants to build it; designers want to talk about it.** Both are right at different times:
  a prototype is how you *talk about it with something you can play*. Suggest the cheapest build that
  settles the argument.

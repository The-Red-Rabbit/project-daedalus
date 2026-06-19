# Claude Code prompts: Daedalus development rounds

This file drives the iterative work on Daedalus. It is phased. Give one phase, let Claude Code finish and summarize, review the result, then give the next phase. Each phase ends with a deliberate stop so you stay in control and the context stays small.

The prompts assume Claude Code runs inside the `project-daedalus` repository. `CLAUDE.md` and `docs/VISUAL_DESIGN.md` remain binding.

## How to run this with Claude Code

Do not paste a single block in isolation, otherwise the surrounding context is missing. Let Claude Code read this file, since it lives in the repo. To start a phase, tell Claude Code:

> Read docs/CLAUDE_CODE_PROMPTS_RUNDE2.md in full. Follow the guardrails and the agreed design decisions. Now work through Phase 4 and stop afterward with a summary.

That pulls the guardrails, the decisions, and the phase text into context in one go. Claude Code also reads `CLAUDE.md` on startup. For the next phase say the same with the next number. If a phase ran long and context feels full, start a fresh session and say: read this file plus the latest git log, then do the phase.

## Status

- Round 2 (Phases 1 to 3) is implemented: debug bots and pacing relief, the cooperative Reaktor station, and a first construction rebuild of the Bordcomputer. The detail lives in git history.
- The prototype was tested with a class after Phase 2. The feedback drives Round 3 below.

Classroom feedback, condensed:
- The sector transition is confusing and too fast.
- The whole game and each station need a short how-to.
- The Reaktor station is confusing and feels broken (it passes all tests, the pain is the win flow).
- The Bordcomputer is still brute-forceable.
- Hexadecimal in Zahlensysteme is too hard.
- A way to test a single mini-game directly is badly missing, instead of waiting to rotate onto it.

## Agreed design decisions (context for every phase)

These points are settled and should not be reopened:

1. Lean, simple core first. The goal is a classroom-ready build. Everything else goes on the backlog.
2. Tactile means control feel: continuous, physical controls with live feedback. Decorative friction like unscrewing panels stays out for now.
3. The mini-game test harness comes first in Round 3. It seats you directly on a chosen station and adds a bot partner for the cooperative station, so it tests the real server and coop path.
4. The Reaktor win flow drops the dual confirm and locks automatically when the pair holds the value inside the target band, modeled on the SOS slider feel.
5. Onboarding is short text for now: a how-to card per station plus a brief game intro. An animated cutscene stays on the backlog.
6. When the Bordcomputer is hardened, the approach is a real lockout after a wrong commit plus removing the per-row hint, keeping the build-to-match-table structure.
7. When Zahlensysteme is eased, the approach is a live hex readout plus grouping the bits into nibbles.

## The testable line

Round 3 reaches a re-testable build after Phase 6. Phases 4 to 6 together fix the most painful classroom feedback. Phases 7 and 8 harden the two single-player mini-games and can follow after the next class test if time is short. The backlog at the end is for later.

## Guardrails (apply to every phase)

- Stay server-authoritative, no build step, vanilla ES modules, no frameworks or bundlers. Ask before adding any non-trivial dependency.
- Colors only via `client/styles/tokens.css`, audio only via the cue catalog in `client/audio.js`, mini-games only via the registry and the shared interface.
- `generate` and `validate` stay free of DOM and browser APIs, only `mount` uses the document. The server rebuilds tasks from the seed and validates authoritatively.
- Identifiers in code in English, user-facing text in German. German text uses correct German quotation marks (low-9 opening and high-6 closing) and no dashes, matching the project style.
- Small, well-described commits. Update `CLAUDE.md`, `README.md`, and `TASKS.md` as soon as behavior changes.
- At every real design fork, use AskUserQuestion so Felix decides instead of silently making an assumption.
- Prefer running and verifying over assuming. Each phase ends with a stop and a summary before the next begins.

---

## Phase 4: Mini-game test harness (do this first)

```text
You are working in the project-daedalus repository. First read CLAUDE.md, server/index.js, server/game.js, server/bots.js, shared/protocol.js, and client/controller/controller.js so you know the join flow, role placement, the debug bots, and how a mini-game mounts. Goal of this phase: a fast way to test a single mini-game alone, without playing through the lobby and waiting to rotate onto a station.

Goal: From a debug-only entry you can open any single mini-game at any level within seconds. For the cooperative Reaktor station, a bot partner is added automatically so you can test the coop path alone.

Approach:
- Add a debug-only path that seats a controller directly on a chosen station at a chosen level, bypassing the normal lobby and rotation. The game enters the running phase for that test so the mini-game actually mounts.
- Reuse the existing debug infrastructure. Gate everything behind the DAEDALUS_DEBUG environment variable, the same gate the bots already use, so nothing can appear in class by accident.
- For a station with coop: true (the Reaktor), automatically spawn one bot as the partner via server/bots.js, so the shared state and the match readout work with a single human tester.
- Provide a convenient entry. Ask me via AskUserQuestion which you should build: a dedicated /dev page that lists every station with level buttons, or a query parameter on the controller such as a station and level. Recommend the /dev page, since clicking a station opens a controller already seated there.
- Keep the normal game untouched. The harness is an additional path, not a change to the lobby or rotation logic.

Acceptance: With DAEDALUS_DEBUG on, you open the debug entry, pick a station and level, and the mini-game mounts at once. Picking the Reaktor seats you with an automatic bot partner so the match readout moves. Without the debug flag the entry does not exist.

Follow the guardrails. Small, well-described commits, update CLAUDE.md and TASKS.md. Then stop and summarize how to use the harness. Do not start another phase yet.
```

---

## Phase 5: Untangle the Reaktor

```text
Continue in the project-daedalus repository. Use the test harness from Phase 4 to play the Reaktor while you work. Read client/minigames/reaktor.js and the coop logic in server/game.js (coopInput, coopConfirm, coopMeasure, resetCoopStation, rollCoopTarget, confirmA, confirmB). The Reaktor passes all tests, so this is about the win flow and clarity, not a logic rebuild. Still, first play it via the harness and confirm there is no hidden sync bug. If you find one, fix it.

Goal: The Reaktor feels like the SOS slider that worked in class. Two people talk, adjust their hidden parameters, and the calibration locks on its own when they hold the combined value in the target band. No confirm dance.

Approach:
- Replace the dual confirm win with an automatic lock. The calibration engages when the combined value stays inside the target band continuously for a short hold time. Show the hold as it builds, for example a filling ring or bar, so the pair feels it lock in. Remove the Bestaetigen button and the need for both sides to confirm. The COOP_CONFIRM message may stay in the protocol but is no longer required to win.
- Do not slam a new target the instant they succeed. Ask me via AskUserQuestion which I prefer: the station simply rides on the normal stability decay like the others after locking, or a fresh target rolls after a short visible pause.
- Loosen the tolerance so blind coordination is achievable. Ask me for the desired feel and derive the per-level values. As a starting point, level 1 clearly wide, level 3 still tight but fair.
- Make the readout unmistakable. A large state line (too high, too low, in the band), the match bar, and a clear marker for where the band sits. Keep the proximity beep, it is good, and tie it to the match.
- generate and validate stay DOM-free. The server keeps holding the shared state and validating authoritatively. Update the Reaktor tests if behavior changes, for example a test for the hold-to-lock condition.

Acceptance: With one human plus the bot partner, or with two tabs, you reach the target by talking and holding, and it locks smoothly without a confirm fight. The energie value still reacts. The three single-player stations are unaffected.

Follow the guardrails. Trigger audio cues at the key moments. Small commits, update the docs. Then stop and summarize. Do not start another phase yet.
```

---

## Phase 6: Onboarding and a clear sector transition

```text
Continue in the project-daedalus repository. Read client/controller/controller.js (showWaiting, mountGame), client/beamer/beamer.js, the mini-game interface in CLAUDE.md, and how the server announces a sector change (the rotate event in server/game.js and shared/protocol.js). Goal: a new player understands each station without spoken help, and the sector change is no longer abrupt.

Goal: Short German text introduces the game once and each station before it is played, and the sector transition is a clear, slightly slower beat on both the beamer and the phones.

Approach:
- Give each mini-game a short how-to. Add a field to each module (for example a howto string with the station goal in one or two sentences). Before the mini-game mounts, the controller shows a compact instruction card: station name, the goal, a Los button. It appears on the first assignment and again after each rotation.
- Add a brief game intro on first join: what the mission is and that the crew holds stations stable together. Keep it to a few lines.
- Make the sector transition explicit. When a sector completes, the beamer and the phones show an interstitial for a few seconds, for example the sector reached and the new station for that player, before the next mini-game appears. Extend the rotate event with whatever the clients need to show this. Slow it down enough to read.
- Keep all text concise and readable from a distance on the beamer. German quotation marks, no dashes. Colors and type via the tokens.
- Ask me via AskUserQuestion how much text per station you should write: a single goal line, or a short card with a tiny worked example.

Acceptance: A player who has never seen a station can start it from the card alone. After a sector completes, both the beamer and the phones clearly announce the new sector and the new station before play resumes.

Follow the guardrails. Small commits, update the docs. Then stop and summarize. This reaches the re-testable line. Stop here unless Felix asks for Phase 7.
```

---

## Phase 7: Close the Bordcomputer brute-force gap (after the next class test if time is short)

```text
Continue in the project-daedalus repository. Read client/minigames/bordcomputer.js and test/bordcomputer.test.js. The construction rebuild did not close brute force: low levels have few gate combinations, the failure hint still names how many rows match, and a wrong attempt only costs a little decaying stability. Goal: trial and error becomes the slow path, understanding the table becomes the fast one.

Approach:
- After a wrong commit, impose a noticeable lockout of a few seconds before another submit is possible. Make the lockout visible so it is felt.
- Remove the gradient hint on failure. Replace the per-row count with a neutral message such as not matching yet. Do not reveal which rows are wrong after a failed attempt.
- Keep the build-to-match-table structure. Optionally raise the level 1 solution space a little so nine combinations is not trivial. Ask me via AskUserQuestion whether to enlarge level 1.
- generate and validate stay DOM-free. Update test/bordcomputer.test.js to the changed behavior.

Acceptance: Blind trial is slow and unrewarding. Reading the table and reasoning about the gates is the quick route. Tests are green, the loop runs without regression.

Follow the guardrails. Small commits, update the docs. Then stop and summarize.
```

---

## Phase 8: Ease hexadecimal in Zahlensysteme (after the next class test if time is short)

```text
Continue in the project-daedalus repository. Read client/minigames/zahlensysteme.js and its tests. On level 3 the target is shown in hex, but the live readout shows only decimal and binary, so the player cannot compare their work to the target without converting in their head twice. Goal: hex is solvable with understanding instead of head-math.

Approach:
- Show the current value in hex in the live readout, next to decimal and binary, so it can be compared directly to the hex target.
- Group the eight bits visually into two four-bit nibbles, each with its own hex digit shown above or below it, so the hex to binary nibble relationship is visible while solving. This is the actual learning goal.
- Ask me via AskUserQuestion whether hex should stay on level 3 for everyone or become an opt-in top step, in case it is still too steep for some.
- generate and validate stay DOM-free. Update the tests.

Acceptance: A player can match a hex target by reasoning per nibble, not by trial. Tests are green, the loop runs without regression.

Follow the guardrails. Small commits, update the docs. Then stop and summarize.
```

---

## Backlog (after the test, greenlight per item)

- Manual as a cooperation mechanic: one station holds a reference the others need, as a printed handout or an in-app help station, to force communication. Felix's idea, parked here. Say the word to pull it forward.
- Decorative tactile feel as polish: unscrewing a panel, flipping switches, valves as a ritual before solving.
- Further stations from `docs/GAME_DESIGN.md`: Antrieb and Schilde as new mini-games via the interface.
- Multiple rooms instead of a single game on the server.
- Simple data capture for the reflection, for example which station was solved how often.
- Real assets in the existing slots: sprites and sound files per cue, registered in the manifest.
```

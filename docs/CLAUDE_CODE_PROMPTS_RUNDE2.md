# Claude Code prompts: Round 2 (further development)

This file drives the second work round on Daedalus. It is phased. Give Phase 1 first, let Claude Code finish and summarize, review the result, then give the next phase. Each phase ends with a deliberate stop so you stay in control and the context stays small.

The prompts assume Claude Code runs inside the `project-daedalus` repository and knows the current state (server with authoritative logic, beamer, Leitstand, controller, three mini-games, audio engine, design tokens). `CLAUDE.md` and `docs/VISUAL_DESIGN.md` remain binding.

## How to run this with Claude Code

Do not paste a single block in isolation, otherwise the surrounding context is missing. Instead let Claude Code read this file, since it lives in the repo. To start, tell Claude Code:

> Read docs/CLAUDE_CODE_PROMPTS_RUNDE2.md in full. Follow the guardrails and the agreed design decisions. Now work through Phase 1 and stop afterward with a summary.

That pulls the guardrails, the decisions, and the phase text into context in one go. Claude Code also reads `CLAUDE.md` on startup, where most conventions already live. For the next phase say the same with Phase 2. If a phase ran long and context feels full, start a fresh session and say: read this file plus the latest git log, then do Phase 2.

## Agreed design decisions (context for every phase)

These points are settled and should not be reopened:

1. Lean, simple core first. The goal is a classroom-ready build within a few days. Everything else goes on the backlog.
2. The loop that feels stressful is eased first through pacing, not through a rebuild of the control logic.
3. One single new cooperative station (Reaktor), modeled on a proven classroom game. It covers cooperation, a reason to look at the beamer, and tactile control feel in one.
4. Tactile here means control feel: continuous, physical controls with live feedback. Decorative friction like unscrewing panels or switch rituals stays out for now.
5. The mini-games must not be solvable by clicking through. The Bordcomputer is rebuilt toward construction; Tiefpass and Zahlensysteme follow in a separate, later phase.
6. The debug mode for solo testing runs through server-side simulated players (bots).

## The testable line

After Phase 2 the game is classroom-ready. Phases 1 and 2 together form a rounded cooperative core you can trial with the class. Phase 3 sharpens the didactics. Phase 4 is the deferred safety net for the wish to lift all mini-games to construction. If time runs short before the test, drop Phase 4 without harming the core. Phase 5 is pure backlog for after the test.

## Guardrails (apply to every phase)

- Stay server-authoritative, no build step, vanilla ES modules, no frameworks or bundlers. Ask before adding any non-trivial dependency.
- Colors only via `client/styles/tokens.css`, audio only via the cue catalog in `client/audio.js`, mini-games only via the registry and the shared interface.
- `generate` and `validate` stay free of DOM and browser APIs, only `mount` uses the document. The server rebuilds tasks from the seed and validates authoritatively.
- Identifiers in code in English, user-facing text in German. German text uses correct German quotation marks (low-9 opening and high-6 closing) and no dashes, matching the project style.
- Small, well-described commits. Update `CLAUDE.md`, `README.md`, and `TASKS.md` as soon as behavior changes.
- At every real design fork, use AskUserQuestion so Felix decides instead of silently making an assumption.
- Prefer running and verifying over assuming. Each phase ends with a stop and a summary before the next begins.

---

## Phase 1: Debug bots and pacing relief

```text
You are working in the project-daedalus repository. First read CLAUDE.md, server/game.js, server/index.js, and shared/protocol.js so you know role assignment, the tick, and the protocol. This phase has two goals: a tool for solo testing and a calmer pacing. No new game content.

Part A, simulated players (bots) for solo testing.

Goal: You can observe the whole loop alone, without several real smartphones. The server creates simulated participants that join through the real join and solve path and solve their tasks automatically.

Approach:
- Bots run server-side, not as real WebSocket clients. Add them through the same addParticipant logic so roles, rotation, and coupling are identical to the real game.
- Each bot solves its current task after a configurable, slightly randomized delay, mostly correctly and occasionally wrong, so the status decay becomes visible. Use the existing solve logic with the real seed. Do not add a special path for evaluation.
- Control by the host only (Leitstand): set count, spawn bots, remove bots. Add a debug message in shared/protocol.js that the server accepts only from the host.
- Bots visible in the roster and clearly marked as bots (for example through a name prefix) so you can tell them from real players.
- Add a visually separated debug area in the Leitstand, clearly recognizable as a developer tool. Gate the feature behind an environment variable so it does not appear accidentally in class.

Acceptance Part A: You open beamer and Leitstand alone, spawn about six bots, start the mission, and see a full sector with progress, role rotation, and a win or loss ending, without opening further tabs.

Part B, ease the pacing.

Goal: The loop should feel less frantic. Less constant pressure, noticeable breathing room.

Approach:
- Make the decay gentler. Lower STABLE_DECAY_PER_SEC so a station stays stable longer after solving (guideline around 15 to 20 seconds instead of the current eight). Lower HULL_DRAIN_WARN and HULL_DRAIN_CRITICAL so brief neglect is not punished hard immediately.
- Add a calm approach phase per sector. Right after the start and after every sector change, a few seconds without decay and without hull loss, in which the crew arrives. Optionally a short hint on the beamer.
- Do not set the concrete numbers alone. Ask me via AskUserQuestion for the desired feel (relaxed, medium, or demanding) and derive the values from that. Keep all tuning values bundled at the top of server/game.js.

Acceptance Part B: With the bots a sector feels calmer, progress does not constantly stall, and a briefly neglected station does not immediately tear down the hull.

Follow the guardrails. Write small, well-described commits and update CLAUDE.md and TASKS.md. Then stop and summarize what you built and which pacing values you set. Do not start another phase yet.
```

---

## Phase 2: Cooperative Reaktor station (the centerpiece)

```text
Continue in the project-daedalus repository. Phase 1 is done and you can test alone with bots. Re-read CLAUDE.md and the mini-game interface. The model is a proven classroom game: two people jointly calibrate a reactance, each controls one hidden parameter, a shared target and a live match bar bring them together. The mechanic is fully described below, you do not need any external file. If Felix drops the coop.html template from his other project into the chat, use it only for inspiration, not as code to copy.

Goal: A new, cooperative Reaktor station. Two people each set a hidden parameter and jointly hit a target value shown prominently on the beamer. A live match readout and a tone that grows more intense near the target bring them together. This station is the reason to look forward at the beamer and to talk to each other.

Mechanic:
- Target value from the seed, for example a reactance in ohms. Use discrete component series so the target is exactly reachable, the way the Tiefpassfilter already does.
- The operator controls parameter A (for example capacitance C), the co-pilot controls parameter B (for example frequency f). Neither sees the other's value. Both see the same target and the same match readout. This very information gap forces the talking.
- Counts as solved when the combined value stays within tolerance for a short hold time, or when both confirm together. Ask me via AskUserQuestion which model I prefer: automatic on holding inside the target band, or a confirm that both must trigger.

Server and architecture:
- Unlike the existing single-player mini-games, the Reaktor needs shared station state. The server holds both parameter values per Reaktor station, computes the combined actual value and the proximity to the target, and sends the match to both phones and the beamer.
- Extend the protocol minimally: a client-to-server message for the continuous input of the coop station, and in hostState as well as the participant view the fields for target and match of the Reaktor station.
- Build the coop path in isolation, triggered by a flag (for example coop: true on the station entry in shared/protocol.js). The three existing single-player mini-games stay untouched. No regression.
- The Reaktor module's generate and validate stay DOM-free. The server rebuilds the target from the seed and validates authoritatively.

Role model:
- The operator and co-pilot of the Reaktor station form the pair. If only one person is at the station, show them both controls as a solo fallback so nothing blocks. If more than two are assigned, the operator and the first co-pilot play, others watch the readout.
- Extend the debug bots from Phase 1 so they also operate the Reaktor station, that is, move their control toward the target. Only then can you test the coop station alone.

Display and tactile feel:
- On the beamer, show the Reaktor target and the match large and readable from a distance. Style per docs/VISUAL_DESIGN.md.
- On the controller, a continuous, physical control (slider or rotary dial) with a large thumb point and immediate reaction. Plus a tone from the cue catalog that grows more intense near the target. Keep the synthesis, add at most one new cue and register it in the manifest.
- Bring energie to life: couple the so-far constant value energie to the Reaktor. While the Reaktor is stably calibrated, energie holds or rises, otherwise it falls. Keep the coupling simple and tunable via a new value at the top of server/game.js.

Acceptance: With two browser tabs or with the debug bots, the pair calibrates the Reaktor. The target stands on the beamer, the match rises visibly, on a hit the station becomes stable and energie reacts. The three existing stations work unchanged.

Follow the guardrails. Trigger audio cues at the key moments. Write small commits and update CLAUDE.md, README.md, and TASKS.md. At the end do a run with at least two simulated participants at the Reaktor station. Then stop and summarize. Do not start another phase yet.
```

---

## Phase 3: Rebuild the Bordcomputer toward construction

```text
Continue in the project-daedalus repository. The cooperative core runs. Read client/minigames/bordcomputer.js and test/bordcomputer.test.js. In this phase the mere clicking-through disappears from the Bordcomputer.

Goal: The Bordcomputer is no longer solvable by trial. Instead of picking one component from four options, you construct the solution from a target table.

Approach:
- New mechanic: From the given truth table you assemble the circuit yourself. At least two gates in series or a small wiring of A and B through selectable gates onto the output. The solution arises through placing and connecting, not through a single choice.
- Feedback only after committing. No more per-row instant correction while building. You commit the circuit, then the evaluation appears. A wrong attempt costs something, for example a short lockout or a small stability deduction, so guessing becomes expensive.
- The difficulty levels stay professionally graded. Level 1 with simple wiring, higher levels with more gates or a table that must first be derived.
- generate and validate stay DOM-free, the server validates authoritatively. Update test/bordcomputer.test.js to the new mechanic.
- Ask me via AskUserQuestion how far the construction should go, for example only gates in series versus a free small wiring, so the build effort fits the remaining time.

Acceptance: A correct solution requires thinking about the table. Blind trial is slow and expensive. The tests are green, the loop runs without regression.

Follow the guardrails. Small commits, update the docs. Then stop and summarize. Only start Phase 4 if Felix asks for it.
```

---

## Phase 4: Deepen Tiefpass and Zahlensysteme (only if there is free time before the test)

```text
Continue in the project-daedalus repository. Important: only take on this phase if there is still solid time until the classroom test after Phase 3. Otherwise after the test. Read client/minigames/tiefpassfilter.js, client/minigames/zahlensysteme.js, and the related tests.

Goal: The two remaining mini-games also reward understanding instead of trial, with delayed feedback and more construction.

Approach Tiefpassfilter:
- The live curve may stay, it is good control feel. The final evaluation, however, comes only after committing.
- Deepen the task instead of conveniently sliding a single value onto the marker. Options are assembling components from series or a second filter stage.

Approach Zahlensysteme:
- Away from convenient reading-off. Require real conversion, for example one direction without a live decimal readout, or additionally hexadecimal. The bit switches stay as the control element.

Settle the exact deepening per mini-game with me via AskUserQuestion. Update the tests. generate and validate stay DOM-free.

Acceptance: Both mini-games reward understanding, the tests are green, the loop runs without regression.

Follow the guardrails. Small commits, update the docs. Then stop and summarize.
```

---

## Phase 5: Backlog for after the test

These points are deliberately deferred. Do not take them on before the classroom test.

- Decorative tactile feel as polish: unscrewing a panel, flipping switches, valves as a ritual before solving.
- Further stations from `docs/GAME_DESIGN.md`: Antrieb and Schilde as new mini-games via the interface.
- Multiple rooms instead of a single game on the server.
- Simple data capture for the reflection, for example which station was solved how often.
- Real assets in the existing slots: sprites and sound files per cue, registered in the manifest.

# Claude Code prompts for Daedalus

Three prompts, used in order. Paste Prompt 1 first and let Claude Code finish and summarize. Review its summary, then paste Prompt 2, and later Prompt 3.

Why three prompts instead of one: the review pass should be completed and confirmed before new features are layered on top, and phased execution keeps each session focused, keeps context manageable, and lowers the risk of a long unattended run drifting off course. Each prompt ends with a stop-and-summarize so you stay in control.

The prompts assume Claude Code runs inside the `project-daedalus` repository.

---

## Prompt 1: Review and revise the existing scaffold

```text
You are working inside the `project-daedalus` repository. Daedalus is a cooperative classroom learning game for a German vocational high-school course in media technology (Medientechnik). A laptop plus beamer is the host, students' smartphones are controllers, connected over WebSockets on the local network. The codebase was scaffolded by another assistant. Your first job is a careful review and revision pass, not new features.

Step 1, read before touching anything. Read these files in full: `CLAUDE.md`, `docs/GAME_DESIGN.md`, `docs/VISUAL_DESIGN.md`, `TASKS.md`, `README.md`. Treat `CLAUDE.md` and `docs/VISUAL_DESIGN.md` as binding. Then list and read every source file under `server/`, `shared/`, and `client/`.

Step 2, audit the whole codebase. Look specifically for:
- Correctness and real bugs, not style nits.
- Consistency between `shared/protocol.js` and both clients (message types, fields).
- The cross-environment design: the server imports the client mini-game modules to validate solutions, so `generate()` and `validate()` must stay free of any DOM or browser API; only `mount()` may use the document. Confirm this holds and that module specifiers resolve in both Node and the browser.
- Server static serving: correct MIME types, the path-traversal guard, and that `/shared`, `/assets`, `/host`, `/controller`, `/styles`, `/minigames` all resolve.
- WebSocket lifecycle: join, station claim and release on disconnect, and behavior under malformed messages, unknown station ids, an already-taken station, and a client reconnect.
- Deterministic RNG: confirm the server rebuilds the exact task a client built from the same seed, so validation is authoritative.
- Resource cleanup, obvious performance problems, and noisy console errors (for example the audio sample probe that 404s when no file exists).

Step 3, verify it runs. Run `npm install` and `npm start`. Exercise the full flow: a host connects, a controller joins, picks the Bordcomputer station, receives a randomized task, and solves it both correctly and incorrectly while shared values and station status update. Use Node directly for logic checks. Add a small set of automated tests for the pure logic only (RNG determinism, Bordcomputer `generate`/`validate`, the coupling math in `server/game.js`) using the built-in Node test runner. Do not add heavy test dependencies.

Step 4, fix what you find. Preserve the architecture and conventions: modular and simple, server-authoritative, no build step, vanilla ES modules, colors only via `client/styles/tokens.css`, audio only via the cue catalog in `client/audio.js`. Do not introduce frameworks or bundlers. Ask before adding any non-trivial dependency.

Constraints to keep: identifiers in code in English; user-facing text in German; any German user-facing text uses correct German quotation marks (low-9 opening and high-6 closing) and avoids dashes, matching the project's style; keep `generate`/`validate` DOM-free; keep the mini-game registry pattern.

Deliverables for this pass: apply the fixes in small, well-described commits; write `REVIEW.md` listing what you checked, what you changed and why, and anything you deliberately deferred; ensure a fresh `npm install` and `npm start` work and the Bordcomputer is fully playable.

Stop after this pass. Summarize the review and the current baseline. Do not start new features yet.
```

---

## Prompt 2: Build the MVP (core gameplay and the second mini-game)

```text
Continue in the `project-daedalus` repository. The review pass is done and the baseline runs. Now implement the MVP exactly as defined in `TASKS.md`. Re-read `TASKS.md` and `CLAUDE.md` first.

Implement these tickets, each one fully (code, a quick test or a manual run, then a commit) before moving to the next:
- T1: a visible QR code on the host page, built from the LAN join URL.
- T2: wire the Leitstand to the server, so the event button and the difficulty control actually affect the game.
- T3: status decay and re-stabilizing, so a station only stays stable while it is tended and idling is felt by the whole group.
- T4: sector flow and end state, with a win when progress completes and a loss when the hull reaches zero, shown on the host.
- T6: the second mini-game Tiefpassfilter on a new Sensorik station, as a full, randomized module behind the existing interface.

For T6 specifically: implement `generate`, `mount`, and `validate`; keep `generate` and `validate` DOM-free; render an amplitude-versus-frequency curve with a target marker on canvas or inline SVG; randomize the target cutoff every round for replay value; scale difficulty by tolerance and by whether R, C, or both are adjustable; register the module and add the station to the protocol. Make the goal visually obvious even without domain knowledge: move the knee of the curve onto the marker.

The cooperative core must work end to end: progress rises only when enough stations are stable; a neglected or unmanned station drags a shared value down; the host reflects all of this live; the Leitstand can trigger an asteroid wave that damages the hull and shakes the host scene.

Honor the aesthetic throughout (`docs/VISUAL_DESIGN.md`): heavy industrial grimdark, scarce light, functional warning accents, analog-mechanical controls. Trigger audio cues from the catalog on key events (toggle, confirm, error, stabilize, alarm, impact). Keep visuals procedural and audio synthesized, and keep the asset slots working so real files can drop in later.

Test each ticket by running the game, and with a small automated test where the logic is pure. Keep commits small and descriptive. Update `CLAUDE.md`, `README.md`, and `TASKS.md` when behavior changes, and mark tickets done.

When all MVP tickets pass, do a full playthrough with at least two simulated controllers (for example two browser tabs joining different stations) and report the result. Then stop and summarize.
```

---

## Prompt 3: Polish, later items, and final QA

```text
Continue in the `project-daedalus` repository. The MVP is complete and runs. This is the final phase toward a classroom-ready build. Re-read `CLAUDE.md`, `docs/GAME_DESIGN.md`, and `docs/VISUAL_DESIGN.md`.

Implement T5 from `TASKS.md`: role rotation between sectors, and a supporter role so fast finishers help a busy station instead of waiting.

Raise visual and audio quality within the procedural, no-asset approach: richer ship and station rendering, lighting, vignette and particles consistent with the grimdark style, screen shake and impact feedback, a layered ambient hum with an alarm bed, and instrument-style controller panels (toggles and gauges) that match the aesthetic. Stay within the tokens and the cue catalog. Do not add heavy libraries without asking.

Make it robust for a classroom: handle controller reconnects and dropped connections gracefully, tolerate many simultaneous controllers, show a clear lobby and join state, keep the host readable from a distance with large type and high contrast, and give the Leitstand a simple way to start and reset a round.

Accessibility and fairness: never rely on color alone, pair it with text or shape; use readable font sizes and sensible timing; ensure per-station difficulty keeps fast and slow learners engaged.

Add a third mini-game only if time allows and it fits the curriculum (for example number systems from Themenfeld 3), using `client/minigames/_template.js`; otherwise leave a clean extension point.

Final QA: run full playthroughs of both the win and the loss path; check every acceptance criterion in `TASKS.md`; run the test suite; verify a fresh `npm install` and `npm start`; update all docs; and write a short final summary describing the finished game and how to run it in class. Commit, and push if a remote is configured.
```

---

## Guardrails that apply to every prompt

- Keep the build modular and simple, server-authoritative, and free of a build step unless there is a strong reason and you have asked first.
- Colors only through the design tokens, audio only through the cue catalog, mini-games only through the registry and the shared interface.
- Small, descriptive commits. Update the docs when behavior changes.
- Prefer running and verifying over assuming. When something is ambiguous, make a reasonable choice and note it in the summary.

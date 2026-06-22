import { test } from "node:test";
import assert from "node:assert/strict";
import { sort, top } from "../server/highscore.js";

test("sort: hoehere Punktzahl zuerst", () => {
  const list = [
    { score: 10, crew: [], ts: "2026-01-01T10:00:00.000Z" },
    { score: 42, crew: [], ts: "2026-01-02T10:00:00.000Z" },
    { score: 7,  crew: [], ts: "2026-01-03T10:00:00.000Z" },
  ];
  const s = sort(list);
  assert.equal(s[0].score, 42);
  assert.equal(s[1].score, 10);
  assert.equal(s[2].score, 7);
});

test("sort: Gleichstand – frueherer Zeitstempel gewinnt", () => {
  const list = [
    { score: 20, crew: [], ts: "2026-06-22T12:00:00.000Z" },
    { score: 20, crew: [], ts: "2026-06-21T09:00:00.000Z" },
  ];
  const s = sort(list);
  assert.equal(s[0].ts, "2026-06-21T09:00:00.000Z");
  assert.equal(s[1].ts, "2026-06-22T12:00:00.000Z");
});

test("top: gibt maximal 10 Eintraege zurueck", () => {
  const list = Array.from({ length: 15 }, (_, i) => ({
    score: i,
    crew: [],
    ts: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
  }));
  const result = top(list);
  assert.equal(result.length, 10);
  assert.equal(result[0].score, 14);
  assert.equal(result[9].score, 5);
});

test("top: kurze Liste bleibt vollstaendig", () => {
  const list = [
    { score: 5, crew: [], ts: "2026-01-01T00:00:00.000Z" },
    { score: 3, crew: [], ts: "2026-01-02T00:00:00.000Z" },
  ];
  const result = top(list);
  assert.equal(result.length, 2);
  assert.equal(result[0].score, 5);
});

test("top: leere Liste ergibt leere Liste", () => {
  assert.deepEqual(top([]), []);
});

test("top: Limit-Parameter anpassbar", () => {
  const list = Array.from({ length: 5 }, (_, i) => ({
    score: i,
    crew: [],
    ts: `2026-01-0${i + 1}T00:00:00.000Z`,
  }));
  const result = top(list, 3);
  assert.equal(result.length, 3);
});

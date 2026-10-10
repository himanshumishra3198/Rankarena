/**
 * Marking, for every answer format.
 *
 * `evaluate` is the single thing that decides whether an answer is right and
 * what it is worth, and it is called from four places: contest submit, mock
 * submit, the auto-settle that scores a candidate who ran out of time, and
 * the profile breakdown. Each of those used to hold its own
 * `given === correctOption`, so the cases below are what stops them drifting
 * apart again.
 *
 * Pure — no database, no server.
 */
/// <reference types="node" />
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluate, judge, parseAnswerConfig, revealAnswer, stripAnswerKey } from "../src/lib/answers";
import type { Markable } from "../src/lib/answers";

const base = { marks: 3, negativeMarks: 1 };

const mcq = (correct: string): Markable => ({
  ...base, questionType: "STANDARD", exam: "SSC_CGL", correctOption: correct, answerConfig: null,
});
const msq = (correct: string[], partial = false): Markable => ({
  ...base, questionType: "MSQ", exam: "CAT", correctOption: null, answerConfig: { correct, partial },
});
const tita = (accepted: string[], tolerance = 0, kind: "NUMERIC" | "TEXT" = "NUMERIC"): Markable => ({
  ...base, questionType: "TITA", exam: "CAT", correctOption: null,
  answerConfig: { kind, accepted, tolerance },
});

describe("marking", () => {
  describe("single choice — unchanged from before CAT existed", () => {
    it("awards the marks for the right option", () => {
      assert.deepEqual(evaluate(mcq("B"), "B"), { answered: true, correct: true, awarded: 3 });
    });

    it("penalises a wrong option", () => {
      assert.deepEqual(evaluate(mcq("B"), "C"), { answered: true, correct: false, awarded: -1 });
    });

    it("scores a skipped question zero either way", () => {
      for (const blank of [undefined, null, "", [], "   "]) {
        const v = evaluate(mcq("B"), blank);
        assert.equal(v.awarded, 0, `${JSON.stringify(blank)} should score nothing`);
        assert.equal(v.answered, false);
      }
    });

    it("marks a list sent for a single-choice question wrong, rather than throwing", () => {
      // A malformed client must not take down a submission mid-contest.
      assert.equal(evaluate(mcq("B"), ["B"]).correct, false);
    });

    it("marks an answer that is not an option at all wrong", () => {
      assert.equal(evaluate(mcq("B"), "E").correct, false);
      assert.equal(evaluate(mcq("B"), "b").correct, false);
    });
  });

  describe("multiple select", () => {
    it("needs the selection to be exactly right", () => {
      assert.equal(evaluate(msq(["A", "C"]), ["A", "C"]).correct, true);
      assert.equal(evaluate(msq(["A", "C"]), ["C", "A"]).correct, true, "order must not matter");
    });

    it("rejects a subset and a superset alike", () => {
      assert.equal(evaluate(msq(["A", "C"]), ["A"]).correct, false, "subset");
      assert.equal(evaluate(msq(["A", "C"]), ["A", "C", "D"]).correct, false, "superset");
    });

    it("awards nothing for a correct subset unless partial marking is on", () => {
      assert.equal(evaluate(msq(["A", "C"]), ["A"]).awarded, -1);
      assert.equal(evaluate(msq(["A", "B", "C"], true), ["A", "B"]).awarded, 2);
    });

    it("still penalises a partial answer that includes a wrong option", () => {
      // Otherwise picking everything would be the optimal strategy.
      assert.equal(evaluate(msq(["A", "C"], true), ["A", "B"]).awarded, -1);
    });

    it("ignores a repeated selection", () => {
      assert.equal(evaluate(msq(["A", "C"]), ["A", "A", "C"]).correct, true);
    });

    it("accepts a bare string for a single-option selection", () => {
      assert.equal(evaluate(msq(["A"]), "A").correct, true);
    });
  });

  describe("type in the answer", () => {
    it("accepts any listed spelling", () => {
      assert.equal(evaluate(tita(["12", "12.0"]), "12.0").correct, true);
    });

    it("ignores surrounding space", () => {
      assert.equal(evaluate(tita(["12"]), "  12 ").correct, true);
    });

    it("compares numerically, not as text", () => {
      assert.equal(evaluate(tita(["12"]), "12.00").correct, true);
      assert.equal(evaluate(tita(["0.5"]), ".5").correct, true);
    });

    it("survives binary floating point at zero tolerance", () => {
      // 0.1 + 0.2 is not 0.3 in IEEE 754; a candidate typing 0.3 is right.
      assert.equal(evaluate(tita([String(0.1 + 0.2)]), "0.3").correct, true);
    });

    it("honours an explicit tolerance and rejects just outside it", () => {
      assert.equal(evaluate(tita(["3.14"], 0.01), "3.15").correct, true);
      assert.equal(evaluate(tita(["3.14"], 0.01), "3.16").correct, false);
    });

    it("matches text case-insensitively, collapsing runs of space", () => {
      assert.equal(evaluate(tita(["New Delhi"], 0, "TEXT"), "new   delhi").correct, true);
      assert.equal(evaluate(tita(["New Delhi"], 0, "TEXT"), "newdelhi").correct, false);
    });

    it("marks words typed into a numeric question wrong rather than crashing", () => {
      assert.equal(evaluate(tita(["12"]), "twelve").correct, false);
    });

    it("carries no penalty, because CAT does not penalise a question with no options", () => {
      assert.equal(evaluate(tita(["12"]), "13").awarded, 0);
      // The same format on an exam that does penalise still would.
      const ssc = { ...tita(["12"]), exam: "SSC_CGL" as const };
      assert.equal(evaluate(ssc, "13").awarded, -1);
    });
  });

  describe("a question whose key never saved", () => {
    it("scores nobody down for an answer it cannot check", () => {
      const broken: Markable = { ...base, questionType: "MSQ", exam: "CAT", correctOption: null, answerConfig: null };
      assert.deepEqual(evaluate(broken, ["A"]), { answered: false, correct: false, awarded: 0 });
    });
  });

  describe("judge", () => {
    it("agrees with evaluate about correctness, without needing the marks", () => {
      assert.deepEqual(judge(mcq("B"), "B"), { answered: true, correct: true });
      assert.deepEqual(judge(msq(["A", "C"]), ["A"]), { answered: true, correct: false });
      assert.deepEqual(judge(tita(["12"]), undefined), { answered: false, correct: false });
    });
  });
});

describe("answer keys an admin submits", () => {
  it("requires one of the four options for a single-choice question", () => {
    assert.equal(parseAnswerConfig("STANDARD", "A", null).ok, true);
    assert.equal(parseAnswerConfig("STANDARD", "E", null).ok, false);
    assert.equal(parseAnswerConfig("STANDARD", null, null).ok, false);
  });

  it("stores a multiple-select key sorted, so the same key compares equal however it was entered", () => {
    const a = parseAnswerConfig("MSQ", null, { correct: ["C", "A"] });
    const b = parseAnswerConfig("MSQ", null, { correct: ["A", "C"] });
    assert.deepEqual(a.value?.answerConfig, b.value?.answerConfig);
  });

  it("refuses a multiple-select question with nothing correct, or everything", () => {
    assert.equal(parseAnswerConfig("MSQ", null, { correct: [] }).ok, false);
    assert.equal(parseAnswerConfig("MSQ", null, { correct: ["A", "B", "C", "D"] }).ok, false);
  });

  it("drops a stale correctOption when the type no longer uses one", () => {
    const out = parseAnswerConfig("MSQ", "A", { correct: ["A", "B"] });
    assert.equal(out.value?.correctOption, null);
  });

  it("refuses a numeric type-in whose accepted answer is not a number", () => {
    assert.equal(parseAnswerConfig("TITA", null, { kind: "NUMERIC", accepted: ["ten"] }).ok, false);
    assert.equal(parseAnswerConfig("TITA", null, { kind: "TEXT", accepted: ["ten"] }).ok, true);
  });

  it("refuses a type-in with no accepted answer", () => {
    assert.equal(parseAnswerConfig("TITA", null, { accepted: [] }).ok, false);
    assert.equal(parseAnswerConfig("TITA", null, { accepted: ["  "] }).ok, false);
  });
});

describe("what reaches a candidate", () => {
  it("strips both halves of the key", () => {
    const out = stripAnswerKey({
      id: "q1", questionType: "MSQ", text: "?",
      correctOption: null, answerConfig: { correct: ["A", "C"], partial: false },
    });
    assert.equal("answerConfig" in out, false);
    assert.equal("correctOption" in out, false);
    assert.equal(JSON.stringify(out).includes("correct"), false);
  });

  it("keeps the keyboard hint for a type-in question, and only for that", () => {
    const t = stripAnswerKey({
      id: "q", questionType: "TITA", correctOption: null,
      answerConfig: { kind: "TEXT", accepted: ["delhi"], tolerance: 0 },
    });
    assert.equal(t.inputKind, "TEXT");
    assert.equal(JSON.stringify(t).includes("delhi"), false);

    const m = stripAnswerKey({ id: "q", questionType: "STANDARD", correctOption: "A", answerConfig: null });
    assert.equal(m.inputKind, null);
  });
});

describe("what a review screen is shown", () => {
  it("gives a single letter for single-choice, and nothing else", () => {
    const r = revealAnswer({ questionType: "STANDARD", correctOption: "C", answerConfig: null });
    assert.deepEqual(r, { correctOption: "C", correctOptions: null, acceptedAnswers: null });
  });

  it("gives the full set for multiple-select and the accepted list for type-in", () => {
    assert.deepEqual(
      revealAnswer({ questionType: "MSQ", correctOption: null, answerConfig: { correct: ["A", "D"] } }).correctOptions,
      ["A", "D"],
    );
    assert.deepEqual(
      revealAnswer({ questionType: "TITA", correctOption: null, answerConfig: { accepted: ["12"] } }).acceptedAnswers,
      ["12"],
    );
  });
});

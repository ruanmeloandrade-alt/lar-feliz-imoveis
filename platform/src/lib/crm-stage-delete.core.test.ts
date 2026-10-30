import { describe, expect, it } from "vitest";
import {
  nextPipelineStagePosition,
  orderPipelineStagesForDeletion,
} from "./crm.functions";

describe("CRM funnel stage deletion guards", () => {
  it("never reuses the current maximum stage position", () => {
    expect(nextPipelineStagePosition([])).toBe(1);
    expect(nextPipelineStagePosition([1])).toBe(2);
    expect(nextPipelineStagePosition([1, 1, 1])).toBe(2);
    expect(nextPipelineStagePosition([1, 4, 7])).toBe(8);
  });

  it("keeps the oldest stage first when legacy rows share the same position", () => {
    const ordered = orderPipelineStagesForDeletion([
      {
        id: "newer-b",
        position: 1,
        created_at: "2026-08-22T00:10:46.089Z",
      },
      {
        id: "entry",
        position: 1,
        created_at: "2026-08-19T20:33:18.648Z",
      },
      {
        id: "newer-a",
        position: 1,
        created_at: "2026-08-22T00:10:44.294Z",
      },
    ]);

    expect(ordered.map((stage) => stage.id)).toEqual([
      "entry",
      "newer-a",
      "newer-b",
    ]);
  });

  it("still prioritizes explicit position before creation time", () => {
    const ordered = orderPipelineStagesForDeletion([
      { id: "third", position: 3, created_at: "2026-01-01T00:00:00Z" },
      { id: "first", position: 1, created_at: "2026-08-01T00:00:00Z" },
      { id: "second", position: 2, created_at: "2026-02-01T00:00:00Z" },
    ]);
    expect(ordered.map((stage) => stage.id)).toEqual(["first", "second", "third"]);
  });
});

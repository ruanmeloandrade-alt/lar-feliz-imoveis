import { describe, expect, it } from "vitest";
import { generationStatusLabel, selectCreatedIdeas } from "./social-ideas-reliability";

describe("social ideas reliability", () => {
  it("seleciona exatamente os IDs devolvidos pela criação, na ordem devolvida", () => {
    const rows = [
      { id: "antiga", title: "Antiga" },
      { id: "nova-2", title: "Nova 2" },
      { id: "nova-1", title: "Nova 1" },
    ];
    expect(selectCreatedIdeas(rows, ["nova-1", "nova-2"]).map((row) => row.id)).toEqual(["nova-1", "nova-2"]);
  });

  it("não substitui IDs ausentes por ideias antigas", () => {
    const rows = [{ id: "antiga", title: "Antiga" }];
    expect(selectCreatedIdeas(rows, ["nova"])).toEqual([]);
  });

  it("separa status de criação do status das artes", () => {
    expect(generationStatusLabel(4, 0)).toContain("4 ideias criadas");
    expect(generationStatusLabel(4, 2)).toContain("Gerando artes de 2 ideias");
  });
});

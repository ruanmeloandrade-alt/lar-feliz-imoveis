import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const route = readFileSync(resolve(process.cwd(), "src/routes/notas.tsx"), "utf8");
const tasks = readFileSync(resolve(process.cwd(), "src/lib/tasks.functions.ts"), "utf8");

describe("Notas → tarefa", () => {
  it("reutiliza o createTask canônico", () => {
    expect(route).toContain('import { createTask } from "@/lib/tasks.functions"');
    expect(route).toContain("const createTaskFn = useServerFn(createTask)");
    expect(tasks).toContain("export const createTask");
  });

  it("expõe a ação Criar tarefa nos cartões", () => {
    expect(route).toContain('title="Criar tarefa"');
    expect(route).toContain("CalendarPlus");
  });

  it("preserva conteúdo e checklist na descrição", () => {
    expect(route).toContain('item.done ? "[x]" : "[ ]"');
    expect(route).toContain('note.content.trim()');
    expect(route).toContain('title: note.title.trim() || "Tarefa da nota"');
  });

  it("não altera nem exclui a nota durante a conversão", () => {
    const blockStart = route.indexOf("const noteToTaskMut = useMutation");
    const blockEnd = route.indexOf("const createGroupMut", blockStart);
    const block = route.slice(blockStart, blockEnd);
    expect(block).not.toContain("updateFn(");
    expect(block).not.toContain("deleteFn(");
  });
});

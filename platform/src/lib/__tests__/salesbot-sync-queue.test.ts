import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  scheduleSalesbotSave,
  flushAllSalesbotSaves,
  flushSalesbotSave,
  hasPendingSalesbotSaves,
  hasFailedSalesbotSaves,
  clearSalesbotSync,
  getSalesbotSaveStatus,
} from "@/lib/salesbot-sync-queue";

function bigBot(id: string, blockCount: number) {
  return {
    id,
    blocks: Array.from({ length: blockCount }, (_, i) => ({ id: `blk_${i}`, kind: "mensagem" })),
  };
}

describe("salesbot sync queue", () => {
  beforeEach(() => {
    clearSalesbotSync("bot_1");
    clearSalesbotSync("bot_2");
  });

  it("coalesce várias alterações rápidas num único envio com o estado mais recente", async () => {
    const sent: number[] = [];
    for (let i = 1; i <= 50; i++) {
      const payload = bigBot("bot_1", i * 10);
      scheduleSalesbotSave("bot_1", async () => {
        sent.push(payload.blocks.length);
      });
    }
    await flushAllSalesbotSaves();
    expect(sent).toEqual([500]);
    expect(hasPendingSalesbotSaves()).toBe(false);
  });

  it("salva bots grandes (500 blocos) por inteiro", async () => {
    let received = 0;
    const payload = bigBot("bot_1", 500);
    scheduleSalesbotSave("bot_1", async () => {
      received = payload.blocks.length;
    });
    await flushSalesbotSave("bot_1");
    expect(received).toBe(500);
    expect(getSalesbotSaveStatus().status).toBe("saved");
  });

  it("faz retry quando a rede falha e conclui na terceira tentativa", async () => {
    const task = vi.fn(async () => {
      if (task.mock.calls.length < 3) throw new Error("network");
    });
    scheduleSalesbotSave("bot_1", task);
    await flushSalesbotSave("bot_1");
    expect(task).toHaveBeenCalledTimes(3);
    expect(getSalesbotSaveStatus().status).toBe("saved");
  });

  it("marca falha e mantém a task disponível para retry quando a rede não volta", async () => {
    const task = vi.fn(async () => { throw new Error("offline"); });
    scheduleSalesbotSave("bot_1", task);
    await expect(flushSalesbotSave("bot_1")).resolves.toBeUndefined();
    expect(getSalesbotSaveStatus()).toEqual({ status: "error", error: "offline" });
    expect(hasPendingSalesbotSaves()).toBe(false);
    expect(hasFailedSalesbotSaves()).toBe(true);
    clearSalesbotSync("bot_1");
  });

  it("não mistura bots diferentes", async () => {
    const seen: string[] = [];
    scheduleSalesbotSave("bot_1", async () => { seen.push("bot_1"); });
    scheduleSalesbotSave("bot_2", async () => { seen.push("bot_2"); });
    await flushAllSalesbotSaves();
    expect(seen.sort()).toEqual(["bot_1", "bot_2"]);
  });
});

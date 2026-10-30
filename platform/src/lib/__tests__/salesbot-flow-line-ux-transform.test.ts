import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applySalesbotFlowLineUxTransform } from "../../../scripts/salesbot-flow-line-ux-transform";

const builderSource = readFileSync(
  new URL("../../components/automations/SalesbotBuilder.tsx", import.meta.url),
  "utf8",
);

describe("SalesBot flow line UX transform", () => {
  it("makes connected lines clickable and carries the target block id", () => {
    const transformed = applySalesbotFlowLineUxTransform(builderSource);
    expect(transformed).toContain("targetId?: string");
    expect(transformed).toContain("targetId: toId");
    expect(transformed).toContain("onLineClick={(line) =>");
    expect(transformed).toContain("focusConnectedBlock(line.targetId)");
    expect(transformed).toContain('strokeWidth="14"');
    expect(transformed).toContain('style={{ pointerEvents: "stroke", cursor: "pointer" }}');
  });

  it("centers and selects the destination block when a connected line is clicked", () => {
    const transformed = applySalesbotFlowLineUxTransform(builderSource);
    expect(transformed).toContain("function focusConnectedBlock(targetId: string)");
    expect(transformed).toContain("setSelected(new Set([targetId]))");
    expect(transformed).toContain("rect.width / 2 - centerX * scale");
    expect(transformed).toContain("rect.height / 2 - centerY * scale");
  });

  it("uses the actual rendered block rectangle and the exact mouseup position for drop hit-testing", () => {
    const transformed = applySalesbotFlowLineUxTransform(builderSource);
    expect(transformed).toContain("function onUp(e: MouseEvent)");
    expect(transformed).toContain("const dropPos = screenToWorld(e.clientX, e.clientY)");
    expect(transformed).toContain('querySelectorAll<HTMLElement>("[data-block-id]")');
    expect(transformed).toContain("const rect = element.getBoundingClientRect()");
    expect(transformed).toContain("e.clientX >= rect.left && e.clientX <= rect.right");
    expect(transformed).toContain("e.clientY >= rect.top && e.clientY <= rect.bottom");
    expect(transformed).toContain("data-block-id={block.id}");
    expect(transformed).toContain("at: dropPos");
  });

  it("preserves reposition-outside and simple-click behavior", () => {
    const transformed = applySalesbotFlowLineUxTransform(builderSource);
    expect(transformed).toContain("[prev.endId]: { dx: dropPos.x - prev.base.x, dy: dropPos.y - prev.base.y }");
    expect(transformed).toContain("const at = { x: prev.origin.x + 40, y: prev.origin.y - 20 }");
    expect(transformed).toContain("setPickerAt(at)");
  });

  it("does not add SalesBot runtime/start calls", () => {
    const transformed = applySalesbotFlowLineUxTransform(builderSource);
    const count = (text: string, value: string) => text.split(value).length - 1;
    expect(count(transformed, "startSalesbot")).toBe(count(builderSource, "startSalesbot"));
    expect(count(transformed, "startSalesbotRun")).toBe(count(builderSource, "startSalesbotRun"));
  });

  it("fails high if the current Builder contract changes", () => {
    expect(() => applySalesbotFlowLineUxTransform(builderSource.replace("function onUp()", "function onRelease()")))
      .toThrow("mouseup da ponta aberta não encontrado");
  });
});

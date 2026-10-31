import test from "node:test";
import assert from "node:assert/strict";
import { publicPropertyExtras } from "./property-metadata.mjs";
test("public metadata exposes only the registered neighborhood", () => {
  assert.deepEqual(
    publicPropertyExtras({
      neighborhood: " Centro ",
      kitchens: 1,
      living_rooms: 2,
      cost_price: 99,
      owner_phone: "private",
      import_snapshot: { secret: true },
    }),
    { neighborhood: "Centro" },
  );
});
test("missing neighborhoods remain unknown", () => {
  for (const value of [
    null,
    undefined,
    {},
    [],
    { neighborhood: 42 },
    { neighborhood: " " },
  ])
    assert.deepEqual(publicPropertyExtras(value), { neighborhood: null });
});
test("public neighborhood text is bounded", () => {
  assert.equal(
    publicPropertyExtras({ neighborhood: "x".repeat(200) }).neighborhood.length,
    160,
  );
});

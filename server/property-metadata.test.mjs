import test from "node:test";
import assert from "node:assert/strict";
import { publicPropertyExtras } from "./property-metadata.mjs";
test("public metadata exposes only declared listing fields", () => {
  assert.deepEqual(
    publicPropertyExtras({
      neighborhood: " Centro ",
      kitchens: 1,
      living_rooms: 2,
      cost_price: 99,
      owner_phone: "private",
      import_snapshot: { secret: true },
    }),
    { neighborhood: "Centro", kitchens: 1, living_rooms: 2 },
  );
});
test("missing counts remain unknown and zero remains an explicit value", () => {
  assert.deepEqual(publicPropertyExtras(null), {
    neighborhood: null,
    kitchens: null,
    living_rooms: null,
  });
  assert.equal(publicPropertyExtras({ kitchens: 0 }).kitchens, 0);
});
test("invalid counts are never inferred or coerced", () => {
  for (const value of [-1, 1.5, "2", 101, NaN])
    assert.equal(publicPropertyExtras({ kitchens: value }).kitchens, null);
});

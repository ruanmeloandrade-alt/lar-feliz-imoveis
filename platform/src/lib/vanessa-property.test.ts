import { describe, it, expect } from "vitest";
import { vanessaPropertySchema } from "./vanessa-property";
import { productDetailsFromRow, productDetailsPatch } from "./product-import-details";
describe("Vanessa public property contract", () => {
  it("persists neighborhood and room counts without guessing absent values", () => {
    const value = vanessaPropertySchema.parse({
      neighborhood: "Centro",
      kitchens: 1,
      living_rooms: 2,
    });
    expect(productDetailsPatch({ property: value }).public_property as any).toMatchObject({
      neighborhood: "Centro",
      kitchens: 1,
      living_rooms: 2,
    });
    expect(vanessaPropertySchema.parse({}).kitchens).toBeUndefined();
    expect(vanessaPropertySchema.safeParse({ kitchens: 1.5 }).success).toBe(false);
  });
  it("preserves a migrated gallery and private import metadata without exposing it as property fields", () => {
    const row = {
      import_snapshot: {
        source: "vanessa-original",
        raw: { private: "internal" },
        property: {
          id: "old",
          title: "Imóvel",
          city: "Campinas",
          images: ["/api/files/public/" + "a".repeat(64) + ".jpg"],
          pdfs: [],
          plans: [],
          published: true,
          construction_status: "pronto",
        },
      },
    };
    const detail = productDetailsFromRow(row);
    expect(detail.property?.city).toBe("Campinas");
    expect(detail.importSnapshot?.raw).toEqual({ private: "internal" });
    expect(detail.property).not.toHaveProperty("raw");
  });
  it("persists the public details on the product without replacing import history", () => {
    const patch = productDetailsPatch({
      property: vanessaPropertySchema.parse({ city: "Campinas", published: false }),
    });
    expect(patch.public_property).toMatchObject({ city: "Campinas", published: false });
    expect(patch).not.toHaveProperty("import_snapshot");
  });
  it("accepts own uploaded photos and PDFs", () => {
    const prefix =
      "/api/listing-media/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222";
    expect(
      vanessaPropertySchema.parse({ images: [prefix + ".jpg"], pdfs: [prefix + ".pdf"] }).images,
    ).toHaveLength(1);
  });
  it.each([
    "https://example.com/private.jpg",
    "javascript:alert(1)",
    "/api/listing-media/../../secret",
  ])("rejects unowned or unsafe media %s", (url) => {
    expect(vanessaPropertySchema.safeParse({ images: [url] }).success).toBe(false);
  });
  it("rejects negative area and private fields", () => {
    expect(vanessaPropertySchema.safeParse({ area_m2: -1 }).success).toBe(false);
    expect(vanessaPropertySchema.safeParse({ cost_price: 50 }).success).toBe(false);
  });
});

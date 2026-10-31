import { z } from "zod";
const optionalNumber = z.number().finite().nonnegative().nullable().optional();
const media = z
  .string()
  .max(1500)
  .refine(
    (v) =>
      /^\/api\/(?:files\/public\/[a-f0-9]{64}\.[a-zA-Z0-9]+|listing-media\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(?:jpg|png|webp|gif|mp4|pdf))$/.test(
        v,
      ),
    "Use uma mídia enviada pela plataforma.",
  );
export const vanessaPropertySchema = z
  .object({
    published: z.boolean().default(true),
    city: z.string().trim().max(120).default(""),
    address: z.string().trim().max(500).nullable().optional(),
    neighborhood: z.string().trim().max(160).nullable().optional(),
    kitchens: z.number().int().min(0).max(100).nullable().optional(),
    living_rooms: z.number().int().min(0).max(100).nullable().optional(),
    bedrooms: optionalNumber,
    bathrooms: optionalNumber,
    area_m2: optionalNumber,
    tag: z.string().trim().max(120).nullable().optional(),
    images: z.array(media).max(40).default([]),
    pdfs: z.array(media).max(10).default([]),
    plans: z
      .array(z.object({ name: z.string().trim().max(120), area_m2: optionalNumber }))
      .max(20)
      .default([]),
    construction_status: z.enum(["na_planta", "pronto"]).default("na_planta"),
    launch_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    subsidy_estimate: optionalNumber,
    monthly_parcel: optionalNumber,
    down_payment: optionalNumber,
    show_parcel: z.boolean().default(false),
    show_down_payment: z.boolean().default(false),
  })
  .strict();
export type VanessaProperty = z.infer<typeof vanessaPropertySchema>;

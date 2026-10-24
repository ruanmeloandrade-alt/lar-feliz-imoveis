ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS down_payment numeric,
  ADD COLUMN IF NOT EXISTS show_parcel boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_down_payment boolean NOT NULL DEFAULT false;
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS construction_status text NOT NULL DEFAULT 'pronto',
  ADD COLUMN IF NOT EXISTS launch_date date;

ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS properties_construction_status_check;
ALTER TABLE public.properties
  ADD CONSTRAINT properties_construction_status_check
  CHECK (construction_status IN ('na_planta','pronto'));
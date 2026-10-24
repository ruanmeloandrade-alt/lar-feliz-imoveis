
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  nome TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  email TEXT,
  renda NUMERIC,
  tipo_trabalho TEXT,
  fgts TEXT,
  cpf_limpo TEXT,
  possui_imovel TEXT,
  cidade TEXT,
  entrada NUMERIC,
  faixa TEXT,
  subsidio_resultado TEXT,
  produto_interesse TEXT,
  observacoes TEXT
);

GRANT INSERT ON public.leads TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit leads"
ON public.leads FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Admins can view leads"
ON public.leads FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update leads"
ON public.leads FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete leads"
ON public.leads FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX leads_created_at_idx ON public.leads (created_at DESC);

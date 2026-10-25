
DROP POLICY IF EXISTS "Anyone can submit leads" ON public.leads;

CREATE POLICY "Anyone can submit leads"
ON public.leads FOR INSERT
TO anon, authenticated
WITH CHECK (
  length(trim(nome)) BETWEEN 2 AND 120
  AND length(trim(whatsapp)) BETWEEN 8 AND 30
  AND (email IS NULL OR length(email) <= 200)
  AND (cidade IS NULL OR length(cidade) <= 120)
  AND (observacoes IS NULL OR length(observacoes) <= 2000)
  AND (produto_interesse IS NULL OR length(produto_interesse) <= 200)
);

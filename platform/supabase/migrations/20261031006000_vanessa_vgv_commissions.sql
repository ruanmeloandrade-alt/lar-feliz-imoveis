BEGIN;
CREATE TABLE public.vanessa_deal_financials(lead_id uuid PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,property_id uuid REFERENCES public.products(id) ON DELETE SET NULL,partner_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,deal_kind text NOT NULL CHECK(deal_kind IN ('venda','locacao')),deal_value_cents bigint NOT NULL CHECK(deal_value_cents BETWEEN 0 AND 99999999999999),commission_mode text NOT NULL CHECK(commission_mode IN ('percentual','fixa')),commission_bps integer CHECK(commission_bps BETWEEN 0 AND 10000),commission_cents bigint NOT NULL CHECK(commission_cents BETWEEN 0 AND 99999999999999),received_cents bigint NOT NULL DEFAULT 0 CHECK(received_cents>=0 AND received_cents<=commission_cents),due_on date,notes text NOT NULL DEFAULT '',updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_by uuid NOT NULL REFERENCES auth.users(id));
ALTER TABLE public.vanessa_deal_financials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vanessa_deal_financials FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.vanessa_deal_financials TO authenticated;
GRANT ALL ON public.vanessa_deal_financials TO service_role;
CREATE POLICY vanessa_finance_read ON public.vanessa_deal_financials FOR SELECT TO authenticated USING(private.slim_workspace_access(workspace_id) AND private.slim_session_security_allowed());
CREATE INDEX vanessa_finance_workspace_idx ON public.vanessa_deal_financials(workspace_id,due_on);
CREATE OR REPLACE FUNCTION public.vanessa_save_financials(_lead_id uuid,_kind text,_value_cents bigint,_mode text,_bps integer,_fixed_cents bigint,_received_cents bigint,_property_id uuid DEFAULT NULL,_partner_id uuid DEFAULT NULL,_due_on date DEFAULT NULL,_notes text DEFAULT '',_expected_updated_at timestamptz DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ws uuid;previous public.vanessa_deal_financials;total bigint;saved public.vanessa_deal_financials;
BEGIN
SELECT workspace_id INTO ws FROM public.leads WHERE id=_lead_id FOR UPDATE;
IF ws IS DISTINCT FROM '2a0e0d29-4e23-47e6-bd9f-30aa8e15e698'::uuid OR NOT private.slim_workspace_access(ws,'operator') OR NOT private.slim_session_security_allowed() THEN RAISE EXCEPTION 'Acesso não autorizado à negociação.';END IF;
IF _kind NOT IN ('venda','locacao') OR _mode NOT IN ('percentual','fixa') OR _value_cents IS NULL OR _value_cents<0 OR _value_cents>99999999999999 OR char_length(COALESCE(_notes,''))>3000 THEN RAISE EXCEPTION 'Confira os valores da negociação.';END IF;
IF _mode='percentual' THEN IF _bps IS NULL OR _bps<0 OR _bps>10000 THEN RAISE EXCEPTION 'Comissão percentual inválida.';END IF;total:=round((_value_cents::numeric*_bps)/10000)::bigint;ELSE total:=_fixed_cents;END IF;
IF total IS NULL OR total<0 OR total>99999999999999 OR _received_cents IS NULL OR _received_cents<0 OR _received_cents>total THEN RAISE EXCEPTION 'O recebimento informado deve estar entre zero e a comissão combinada.';END IF;
IF _property_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.products WHERE id=_property_id AND workspace_id=ws) THEN RAISE EXCEPTION 'Imóvel não pertence à Vanessa.';END IF;
IF _partner_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.companies WHERE id=_partner_id AND workspace_id=ws) THEN RAISE EXCEPTION 'Parceiro não pertence à Vanessa.';END IF;
SELECT * INTO previous FROM public.vanessa_deal_financials WHERE lead_id=_lead_id;
IF previous.lead_id IS NOT NULL AND previous.updated_at IS DISTINCT FROM _expected_updated_at THEN RAISE EXCEPTION 'Esta negociação foi atualizada em outra tela. Reabra a ficha antes de salvar.';END IF;
INSERT INTO public.vanessa_deal_financials(lead_id,workspace_id,property_id,partner_id,deal_kind,deal_value_cents,commission_mode,commission_bps,commission_cents,received_cents,due_on,notes,updated_by)
VALUES(_lead_id,ws,_property_id,_partner_id,_kind,_value_cents,_mode,CASE WHEN _mode='percentual' THEN _bps ELSE NULL END,total,_received_cents,_due_on,COALESCE(_notes,''),auth.uid())
ON CONFLICT(lead_id) DO UPDATE SET property_id=EXCLUDED.property_id,partner_id=EXCLUDED.partner_id,deal_kind=EXCLUDED.deal_kind,deal_value_cents=EXCLUDED.deal_value_cents,commission_mode=EXCLUDED.commission_mode,commission_bps=EXCLUDED.commission_bps,commission_cents=EXCLUDED.commission_cents,received_cents=EXCLUDED.received_cents,due_on=EXCLUDED.due_on,notes=EXCLUDED.notes,updated_by=auth.uid(),updated_at=clock_timestamp() RETURNING * INTO saved;
UPDATE public.leads SET value=_value_cents::numeric/100,updated_at=clock_timestamp() WHERE id=_lead_id AND workspace_id=ws;
INSERT INTO public.lead_activities(workspace_id,lead_id,type,payload) VALUES(ws,_lead_id,'note',jsonb_build_object('source','vanessa_finance','text','Dados de VGV e comissão atualizados. Recebimento informado pelo operador.','actor_id',auth.uid(),'deal_value_cents',_value_cents,'commission_cents',total,'received_cents',_received_cents));
RETURN to_jsonb(saved);
END $$;
REVOKE ALL ON FUNCTION public.vanessa_save_financials(uuid,text,bigint,text,integer,bigint,bigint,uuid,uuid,date,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vanessa_save_financials(uuid,text,bigint,text,integer,bigint,bigint,uuid,uuid,date,text,timestamptz) TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
SELECT '51-vgv-commissions' AS file,'OK' AS status;

/**
 * Definições canônicas para o Envelope de Eventos Internos da MKTOn.
 * 
 * Este arquivo estabelece o contrato TypeScript que deve ser utilizado
 * para comunicação entre módulos e observabilidade.
 */

export type MktonEventName =
  | "lead.created"
  | "lead.updated"
  | "lead.stage_changed"
  | "lead.tag_added"
  | "lead.tag_removed"
  | "message.received"
  | "message.sent"
  | "tracking.event_received"
  | "tracking.identity_resolved"
  | "tracking.conversion"
  | "automation.triggered"
  | "automation.completed"
  | "automation.failed"
  | (string & {}); // Permite extensibilidade mantendo sugestões

export interface MktonEventEnvelope {
  /** ID único do evento (UUID ou prefixado tipo evt_...) */
  event_id: string;
  
  /** Nome canônico do evento */
  event_name: MktonEventName;
  
  /** ID do workspace (obrigatório para isolamento) */
  workspace_id: string;
  
  /** ID do lead relacionado (se houver) */
  lead_id?: string | null;
  
  /** ID da conversa relacionada (se houver) */
  conversation_id?: string | null;
  
  /** Canal de origem (ex: whatsapp, instagram, web) */
  channel?: string | null;
  
  /** Fonte geradora do evento (ex: meta_webhook, tracking_pixel, crm_engine) */
  source: string;
  
  /** Timestamp ISO do momento da ocorrência */
  timestamp: string;
  
  /** Metadados específicos do evento */
  metadata?: Record<string, any>;
  
  /** ID de correlação para rastreamento de fluxos encadeados */
  correlation_id?: string | null;
}

/**
 * Interface para persistência de eventos em logs/auditoria.
 */
export interface MktonEventLogRow extends MktonEventEnvelope {
  id: string;
  created_at: string;
  processing_status: "pending" | "processed" | "failed";
  error_detail?: string | null;
}

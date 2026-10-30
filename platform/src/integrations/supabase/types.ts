export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      tutorial_modules: {
        Row: { id: string; title: string; position: number; created_at: string }
        Insert: { id?: string; title: string; position?: number; created_at?: string }
        Update: { title?: string; position?: number }
        Relationships: []
      }
      tutorial_lessons: {
        Row: { id: string; module_id: string; title: string; video_id: string; position: number; created_at: string }
        Insert: { id?: string; module_id: string; title: string; video_id: string; position?: number; created_at?: string }
        Update: { module_id?: string; title?: string; video_id?: string; position?: number }
        Relationships: [{ foreignKeyName: "tutorial_lessons_module_id_fkey"; columns: ["module_id"]; isOneToOne: false; referencedRelation: "tutorial_modules"; referencedColumns: ["id"] }]
      }
      account_recovery_codes: {
        Row: {
          code_hash: string
          created_at: string
          email: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          email: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          email?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_agent_conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          messages: Json
          module: Database["public"]["Enums"]["ai_agent_module"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          messages?: Json
          module: Database["public"]["Enums"]["ai_agent_module"]
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          messages?: Json
          module?: Database["public"]["Enums"]["ai_agent_module"]
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_pending_actions: {
        Row: {
          conversation_id: string | null
          created_at: string
          decided_at: string | null
          error_text: string | null
          executed_at: string | null
          id: string
          module: Database["public"]["Enums"]["ai_agent_module"]
          result: Json | null
          status: Database["public"]["Enums"]["ai_agent_action_status"]
          summary: string
          tool_args: Json
          tool_name: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          decided_at?: string | null
          error_text?: string | null
          executed_at?: string | null
          id?: string
          module: Database["public"]["Enums"]["ai_agent_module"]
          result?: Json | null
          status?: Database["public"]["Enums"]["ai_agent_action_status"]
          summary: string
          tool_args?: Json
          tool_name: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          decided_at?: string | null
          error_text?: string | null
          executed_at?: string | null
          id?: string
          module?: Database["public"]["Enums"]["ai_agent_module"]
          result?: Json | null
          status?: Database["public"]["Enums"]["ai_agent_action_status"]
          summary?: string
          tool_args?: Json
          tool_name?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_pending_actions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_pending_actions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_settings: {
        Row: {
          created_at: string
          id: string
          mode: Database["public"]["Enums"]["ai_agent_mode"]
          module: Database["public"]["Enums"]["ai_agent_module"]
          system_prompt_extra: string | null
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mode?: Database["public"]["Enums"]["ai_agent_mode"]
          module: Database["public"]["Enums"]["ai_agent_module"]
          system_prompt_extra?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mode?: Database["public"]["Enums"]["ai_agent_mode"]
          module?: Database["public"]["Enums"]["ai_agent_module"]
          system_prompt_extra?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_memories: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          fact: string
          hits: number
          id: string
          importance: number
          last_used_at: string | null
          module: string | null
          pinned: boolean
          scope: string
          source: string
          subject_id: string | null
          subject_label: string | null
          tags: string[]
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          fact: string
          hits?: number
          id?: string
          importance?: number
          last_used_at?: string | null
          module?: string | null
          pinned?: boolean
          scope?: string
          source?: string
          subject_id?: string | null
          subject_label?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          fact?: string
          hits?: number
          id?: string
          importance?: number
          last_used_at?: string | null
          module?: string | null
          pinned?: boolean
          scope?: string
          source?: string
          subject_id?: string | null
          subject_label?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_memories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_memory_config: {
        Row: {
          auto_capture: boolean
          created_at: string
          enabled: boolean
          max_memories: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          auto_capture?: boolean
          created_at?: string
          enabled?: boolean
          max_memories?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          auto_capture?: boolean
          created_at?: string
          enabled?: boolean
          max_memories?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_memory_config_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_provider_prefs: {
        Row: {
          module: string
          provider: Database["public"]["Enums"]["social_ai_provider"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          module: string
          provider: Database["public"]["Enums"]["social_ai_provider"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          module?: string
          provider?: Database["public"]["Enums"]["social_ai_provider"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_provider_prefs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_preferences: {
        Row: {
          created_at: string
          default_provider: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          default_provider?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          default_provider?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_preferences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      canva_oauth_states: {
        Row: {
          code_verifier: string
          created_at: string
          expires_at: string
          initiated_by: string | null
          state: string
        }
        Insert: {
          code_verifier: string
          created_at?: string
          expires_at?: string
          initiated_by?: string | null
          state: string
        }
        Update: {
          code_verifier?: string
          created_at?: string
          expires_at?: string
          initiated_by?: string | null
          state?: string
        }
        Relationships: []
      }
      channel_messages: {
        Row: {
          attachments: Json
          channel: string
          created_at: string
          direction: string
          error: string | null
          external_message_id: string | null
          id: string
          lead_id: string | null
          page_id: string | null
          raw: Json
          received_at: string
          sent_at: string | null
          status: string
          text: string | null
          thread_id: string
          workspace_id: string
        }
        Insert: {
          attachments?: Json
          channel: string
          created_at?: string
          direction: string
          error?: string | null
          external_message_id?: string | null
          id?: string
          lead_id?: string | null
          page_id?: string | null
          raw?: Json
          received_at?: string
          sent_at?: string | null
          status?: string
          text?: string | null
          thread_id: string
          workspace_id: string
        }
        Update: {
          attachments?: Json
          channel?: string
          created_at?: string
          direction?: string
          error?: string | null
          external_message_id?: string | null
          id?: string
          lead_id?: string | null
          page_id?: string | null
          raw?: Json
          received_at?: string
          sent_at?: string | null
          status?: string
          text?: string | null
          thread_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      clicksign_signature_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          document_id: string
          envelope_id: string
          id: string
          last_error: string | null
          signed_file_id: string | null
          signer_email: string
          signer_id: string | null
          signer_name: string
          source_file_id: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          document_id: string
          envelope_id: string
          id?: string
          last_error?: string | null
          signed_file_id?: string | null
          signer_email: string
          signer_id?: string | null
          signer_name: string
          source_file_id: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string
          envelope_id?: string
          id?: string
          last_error?: string | null
          signed_file_id?: string | null
          signer_email?: string
          signer_id?: string | null
          signer_name?: string
          source_file_id?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clicksign_signature_requests_signed_file_id_fkey"
            columns: ["signed_file_id"]
            isOneToOne: false
            referencedRelation: "workspace_storage_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clicksign_signature_requests_source_file_id_fkey"
            columns: ["source_file_id"]
            isOneToOne: false
            referencedRelation: "workspace_storage_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clicksign_signature_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      clicksign_webhook_events: {
        Row: {
          envelope_id: string | null
          event_key: string
          event_name: string | null
          id: string
          payload: Json
          processed_at: string | null
          processing_started_at: string | null
          received_at: string
        }
        Insert: {
          envelope_id?: string | null
          event_key: string
          event_name?: string | null
          id?: string
          payload: Json
          processed_at?: string | null
          processing_started_at?: string | null
          received_at?: string
        }
        Update: {
          envelope_id?: string | null
          event_key?: string
          event_name?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          processing_started_at?: string | null
          received_at?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          cnpj: string | null
          created_at: string
          crm_source_id: string
          external_id: string | null
          id: string
          logo_url: string | null
          name: string
          notes: string | null
          phone: string | null
          primary_lead_id: string | null
          responsible_id: string | null
          site: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          crm_source_id: string
          external_id?: string | null
          id?: string
          logo_url?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          primary_lead_id?: string | null
          responsible_id?: string | null
          site?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          crm_source_id?: string
          external_id?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          primary_lead_id?: string | null
          responsible_id?: string | null
          site?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_crm_source_id_fkey"
            columns: ["crm_source_id"]
            isOneToOne: false
            referencedRelation: "crm_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_primary_lead_fk"
            columns: ["primary_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      company_departments: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_departments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_departments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_agent_runs: {
        Row: {
          agent_id: string
          channel: string | null
          created_at: string
          id: string
          interactions_count: number
          last_message_at: string
          lead_id: string | null
          metadata: Json
          objective_reached: boolean
          objective_reached_at: string | null
          started_at: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          agent_id: string
          channel?: string | null
          created_at?: string
          id?: string
          interactions_count?: number
          last_message_at?: string
          lead_id?: string | null
          metadata?: Json
          objective_reached?: boolean
          objective_reached_at?: string | null
          started_at?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          agent_id?: string
          channel?: string | null
          created_at?: string
          id?: string
          interactions_count?: number
          last_message_at?: string
          lead_id?: string | null
          metadata?: Json
          objective_reached?: boolean
          objective_reached_at?: string | null
          started_at?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "conversation_ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_ai_agents: {
        Row: {
          cooldown_seconds: number
          created_at: string
          enabled: boolean
          id: string
          max_tokens: number
          metadata: Json
          model: string
          name: string
          persona: string | null
          system_prompt: string | null
          temperature: number
          tools: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          cooldown_seconds?: number
          created_at?: string
          enabled?: boolean
          id?: string
          max_tokens?: number
          metadata?: Json
          model?: string
          name: string
          persona?: string | null
          system_prompt?: string | null
          temperature?: number
          tools?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          cooldown_seconds?: number
          created_at?: string
          enabled?: boolean
          id?: string
          max_tokens?: number
          metadata?: Json
          model?: string
          name?: string
          persona?: string | null
          system_prompt?: string | null
          temperature?: number
          tools?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_ai_agents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_reservations: {
        Row: {
          coupon_id: string
          expires_at: string
          payment_id: string
          reserved_at: string
          workspace_id: string
        }
        Insert: {
          coupon_id: string
          expires_at?: string
          payment_id: string
          reserved_at?: string
          workspace_id: string
        }
        Update: {
          coupon_id?: string
          expires_at?: string
          payment_id?: string
          reserved_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_reservations_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_reservations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "financial_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_reservations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_reservations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_usages: {
        Row: {
          coupon_id: string
          id: string
          payment_id: string | null
          used_at: string
          workspace_id: string
        }
        Insert: {
          coupon_id: string
          id?: string
          payment_id?: string | null
          used_at?: string
          workspace_id: string
        }
        Update: {
          coupon_id?: string
          id?: string
          payment_id?: string | null
          used_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_usages_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usages_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "financial_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usages_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          archived_at: string | null
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          is_subscription: boolean
          kind: string
          max_uses: number | null
          max_uses_per_customer: number | null
          name: string
          starts_at: string | null
          updated_at: string
          valid_modules: string[]
          valid_periods: string[]
          valid_plans: string[]
          value: number
        }
        Insert: {
          archived_at?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          is_subscription?: boolean
          kind: string
          max_uses?: number | null
          max_uses_per_customer?: number | null
          name?: string
          starts_at?: string | null
          updated_at?: string
          valid_modules?: string[]
          valid_periods?: string[]
          valid_plans?: string[]
          value: number
        }
        Update: {
          archived_at?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          is_subscription?: boolean
          kind?: string
          max_uses?: number | null
          max_uses_per_customer?: number | null
          name?: string
          starts_at?: string | null
          updated_at?: string
          valid_modules?: string[]
          valid_periods?: string[]
          valid_plans?: string[]
          value?: number
        }
        Relationships: []
      }
      creative_assets: {
        Row: {
          bucket: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          mime: string | null
          storage_path: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          bucket: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          mime?: string | null
          storage_path: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          bucket?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          mime?: string | null
          storage_path?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_assets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_agent_config: {
        Row: {
          active_days: number[]
          autonomy: string
          check_interval_minutes: number
          created_at: string
          enabled: boolean
          end_time: string
          id: string
          max_actions_per_day: number
          name: string
          pipeline_ids: string[]
          report_channel: string
          report_time: string | null
          require_approval_above: number
          rules: string | null
          start_time: string
          tasks: Json
          timezone: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          active_days?: number[]
          autonomy?: string
          check_interval_minutes?: number
          created_at?: string
          enabled?: boolean
          end_time?: string
          id?: string
          max_actions_per_day?: number
          name?: string
          pipeline_ids?: string[]
          report_channel?: string
          report_time?: string | null
          require_approval_above?: number
          rules?: string | null
          start_time?: string
          tasks?: Json
          timezone?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          active_days?: number[]
          autonomy?: string
          check_interval_minutes?: number
          created_at?: string
          enabled?: boolean
          end_time?: string
          id?: string
          max_actions_per_day?: number
          name?: string
          pipeline_ids?: string[]
          report_channel?: string
          report_time?: string | null
          require_approval_above?: number
          rules?: string | null
          start_time?: string
          tasks?: Json
          timezone?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_agent_config_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_automation_jobs: {
        Row: {
          action: Json
          action_id: string
          attempts: number
          context: Json
          created_at: string
          dedupe_key: string | null
          due_at: string
          executed_at: string | null
          id: string
          last_error: string | null
          lead_id: string
          pipeline_id: string | null
          stage_id: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          action: Json
          action_id: string
          attempts?: number
          context?: Json
          created_at?: string
          dedupe_key?: string | null
          due_at?: string
          executed_at?: string | null
          id?: string
          last_error?: string | null
          lead_id: string
          pipeline_id?: string | null
          stage_id?: string | null
          status?: string
          workspace_id: string
        }
        Update: {
          action?: Json
          action_id?: string
          attempts?: number
          context?: Json
          created_at?: string
          dedupe_key?: string | null
          due_at?: string
          executed_at?: string | null
          id?: string
          last_error?: string | null
          lead_id?: string
          pipeline_id?: string | null
          stage_id?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: []
      }
      crm_form_booking_limits: {
        Row: {
          bookings_count: number
          client_hash: string
          form_id: string
          updated_at: string
          window_started_at: string
          workspace_id: string
        }
        Insert: {
          bookings_count?: number
          client_hash: string
          form_id: string
          updated_at?: string
          window_started_at?: string
          workspace_id: string
        }
        Update: {
          bookings_count?: number
          client_hash?: string
          form_id?: string
          updated_at?: string
          window_started_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_form_booking_limits_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "crm_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_form_booking_limits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_form_ingest_claims: {
        Row: {
          booking_claimed_at: string | null
          booking_slot: string | null
          booking_task_id: string | null
          created_at: string
          form_id: string
          id: string
          idempotency_key: string
          last_error: string | null
          lead_created: boolean
          lead_id: string | null
          request_hash: string
          status: string
          submission_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          booking_claimed_at?: string | null
          booking_slot?: string | null
          booking_task_id?: string | null
          created_at?: string
          form_id: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          lead_created?: boolean
          lead_id?: string | null
          request_hash: string
          status?: string
          submission_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          booking_claimed_at?: string | null
          booking_slot?: string | null
          booking_task_id?: string | null
          created_at?: string
          form_id?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          lead_created?: boolean
          lead_id?: string | null
          request_hash?: string
          status?: string
          submission_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_form_ingest_claims_booking_task_id_fkey"
            columns: ["booking_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_form_ingest_claims_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "crm_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_form_ingest_claims_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_form_ingest_claims_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "crm_form_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_form_ingest_claims_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_form_ingest_idempotency: {
        Row: {
          completed_at: string | null
          created_at: string
          form_id: string
          id: string
          idempotency_key: string
          last_error: string | null
          locked_at: string
          request_hash: string
          response_body: Json | null
          response_status: number | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          form_id: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          locked_at?: string
          request_hash: string
          response_body?: Json | null
          response_status?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          form_id?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          locked_at?: string
          request_hash?: string
          response_body?: Json | null
          response_status?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_form_ingest_idempotency_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "crm_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_form_issuances: {
        Row: {
          form_id: string
          id: string
          issued_at: string
          lead_id: string
          source_context: Json
          source_event_key: string
          source_kind: string
          workspace_id: string
        }
        Insert: {
          form_id: string
          id?: string
          issued_at?: string
          lead_id: string
          source_context?: Json
          source_event_key: string
          source_kind: string
          workspace_id: string
        }
        Update: {
          form_id?: string
          id?: string
          issued_at?: string
          lead_id?: string
          source_context?: Json
          source_event_key?: string
          source_kind?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_form_issuances_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "crm_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_form_issuances_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_form_issuances_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_form_submissions: {
        Row: {
          client_ip: string | null
          form_id: string
          id: string
          lead_id: string | null
          submitted_at: string
          user_agent: string | null
          values: Json
          workspace_id: string
        }
        Insert: {
          client_ip?: string | null
          form_id: string
          id?: string
          lead_id?: string | null
          submitted_at?: string
          user_agent?: string | null
          values?: Json
          workspace_id: string
        }
        Update: {
          client_ip?: string | null
          form_id?: string
          id?: string
          lead_id?: string | null
          submitted_at?: string
          user_agent?: string | null
          values?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "crm_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_form_submissions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_form_submissions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_form_upload_limits: {
        Row: {
          bytes_count: number
          client_hash: string
          files_count: number
          form_id: string
          updated_at: string
          window_started_at: string
          workspace_id: string
        }
        Insert: {
          bytes_count?: number
          client_hash: string
          files_count?: number
          form_id: string
          updated_at?: string
          window_started_at?: string
          workspace_id: string
        }
        Update: {
          bytes_count?: number
          client_hash?: string
          files_count?: number
          form_id?: string
          updated_at?: string
          window_started_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_form_upload_limits_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "crm_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_form_upload_limits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_forms: {
        Row: {
          auto_criar_lead: boolean
          branding: Json
          campos: Json
          created_at: string
          descricao: string | null
          id: string
          ingest_token: string | null
          meta_form_id: string | null
          meta_page_id: string | null
          nome: string
          origem: string
          pipeline_id: string | null
          slug: string
          stage_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          auto_criar_lead?: boolean
          branding?: Json
          campos?: Json
          created_at?: string
          descricao?: string | null
          id?: string
          ingest_token?: string | null
          meta_form_id?: string | null
          meta_page_id?: string | null
          nome: string
          origem?: string
          pipeline_id?: string | null
          slug: string
          stage_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          auto_criar_lead?: boolean
          branding?: Json
          campos?: Json
          created_at?: string
          descricao?: string | null
          id?: string
          ingest_token?: string | null
          meta_form_id?: string | null
          meta_page_id?: string | null
          nome?: string
          origem?: string
          pipeline_id?: string | null
          slug?: string
          stage_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_forms_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_forms_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_forms_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_lead_audiences: {
        Row: {
          cached_at: string | null
          cached_count: number | null
          created_at: string
          created_by: string | null
          description: string | null
          filters: Json
          id: string
          last_synced_at: string | null
          meta_audience_id: string | null
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          cached_at?: string | null
          cached_count?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          filters?: Json
          id?: string
          last_synced_at?: string | null
          meta_audience_id?: string | null
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          cached_at?: string | null
          cached_count?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          filters?: Json
          id?: string
          last_synced_at?: string | null
          meta_audience_id?: string | null
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_lead_audiences_meta_audience_id_fkey"
            columns: ["meta_audience_id"]
            isOneToOne: false
            referencedRelation: "meta_custom_audiences"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_source_funnels: {
        Row: {
          created_at: string
          crm_source_id: string
          id: string
          pipeline_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          crm_source_id: string
          id?: string
          pipeline_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          crm_source_id?: string
          id?: string
          pipeline_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_source_funnels_crm_source_id_fkey"
            columns: ["crm_source_id"]
            isOneToOne: false
            referencedRelation: "crm_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_source_funnels_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_source_funnels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sources: {
        Row: {
          created_at: string
          display_name: string
          external_account_id: string | null
          id: string
          is_default: boolean
          provider: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          external_account_id?: string | null
          id?: string
          is_default?: boolean
          provider: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          external_account_id?: string | null
          id?: string
          is_default?: boolean
          provider?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_sources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_stage_automations: {
        Row: {
          action: Json
          action_id: string
          created_at: string
          enabled: boolean
          id: string
          pipeline_id: string
          position: number
          stage_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          action: Json
          action_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          pipeline_id: string
          position?: number
          stage_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          action?: Json
          action_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          pipeline_id?: string
          position?: number
          stage_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      dashboard_kpi_selections: {
        Row: {
          config: Json
          created_at: string
          id: string
          kpi_key: string
          position: number
          size: string
          source: string
          updated_at: string
          user_id: string
          viz: string
          workspace_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          kpi_key: string
          position?: number
          size?: string
          source: string
          updated_at?: string
          user_id: string
          viz?: string
          workspace_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          kpi_key?: string
          position?: number
          size?: string
          source?: string
          updated_at?: string
          user_id?: string
          viz?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_kpi_selections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_layouts: {
        Row: {
          id: string
          layout: Json
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          id?: string
          layout?: Json
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          id?: string
          layout?: Json
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_layouts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_priority_zones: {
        Row: {
          color: string
          created_at: string
          id: string
          kpi_key: string
          name: string
          operator: string
          position: number
          source: string
          threshold: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          kpi_key: string
          name: string
          operator?: string
          position?: number
          source: string
          threshold?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          kpi_key?: string
          name?: string
          operator?: string
          position?: number
          source?: string
          threshold?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_priority_zones_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      device_approval_challenges: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          device_key: string
          expires_at: string
          id: string
          ip_address: string | null
          phone_masked: string | null
          region: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          device_key: string
          expires_at: string
          id?: string
          ip_address?: string | null
          phone_masked?: string | null
          region?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          device_key?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          phone_masked?: string | null
          region?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_approval_challenges_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      docusign_oauth_states: {
        Row: {
          created_at: string
          environment: string
          expires_at: string
          redirect_uri: string
          state: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          environment?: string
          expires_at: string
          redirect_uri: string
          state: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          environment?: string
          expires_at?: string
          redirect_uri?: string
          state?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "docusign_oauth_states_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      docusign_signature_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          envelope_id: string | null
          id: string
          last_error: string | null
          signed_file_id: string | null
          signer_email: string
          signer_name: string
          source_file_id: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          envelope_id?: string | null
          id?: string
          last_error?: string | null
          signed_file_id?: string | null
          signer_email: string
          signer_name: string
          source_file_id: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          envelope_id?: string | null
          id?: string
          last_error?: string | null
          signed_file_id?: string | null
          signer_email?: string
          signer_name?: string
          source_file_id?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "docusign_signature_requests_signed_file_id_fkey"
            columns: ["signed_file_id"]
            isOneToOne: false
            referencedRelation: "workspace_storage_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "docusign_signature_requests_source_file_id_fkey"
            columns: ["source_file_id"]
            isOneToOne: false
            referencedRelation: "workspace_storage_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "docusign_signature_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      docusign_webhook_events: {
        Row: {
          envelope_id: string | null
          event_key: string
          event_name: string | null
          id: string
          payload: Json
          processed_at: string | null
          processing_started_at: string | null
          received_at: string
        }
        Insert: {
          envelope_id?: string | null
          event_key: string
          event_name?: string | null
          id?: string
          payload: Json
          processed_at?: string | null
          processing_started_at?: string | null
          received_at?: string
        }
        Update: {
          envelope_id?: string | null
          event_key?: string
          event_name?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          processing_started_at?: string | null
          received_at?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      external_automation_logs: {
        Row: {
          automation_id: string | null
          direction: string
          error: string | null
          event: string
          http_status: number | null
          id: string
          occurred_at: string
          payload: Json | null
          provider: string
          response: Json | null
          retry_count: number
          status: string
          workspace_id: string
        }
        Insert: {
          automation_id?: string | null
          direction: string
          error?: string | null
          event: string
          http_status?: number | null
          id?: string
          occurred_at?: string
          payload?: Json | null
          provider: string
          response?: Json | null
          retry_count?: number
          status?: string
          workspace_id: string
        }
        Update: {
          automation_id?: string | null
          direction?: string
          error?: string | null
          event?: string
          http_status?: number | null
          id?: string
          occurred_at?: string
          payload?: Json | null
          provider?: string
          response?: Json | null
          retry_count?: number
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_automation_logs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "external_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_automation_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      external_automations: {
        Row: {
          created_at: string
          id: string
          inbound_secret: string
          inbound_token: string
          last_check_at: string | null
          last_error: string | null
          last_success_at: string | null
          metadata: Json
          outbound_url: string | null
          provider: string
          selected_events: Json
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inbound_secret?: string
          inbound_token?: string
          last_check_at?: string | null
          last_error?: string | null
          last_success_at?: string | null
          metadata?: Json
          outbound_url?: string | null
          provider: string
          selected_events?: Json
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inbound_secret?: string
          inbound_token?: string
          last_check_at?: string | null
          last_error?: string | null
          last_success_at?: string | null
          metadata?: Json
          outbound_url?: string | null
          provider?: string
          selected_events?: Json
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_automations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      extra_employees: {
        Row: {
          created_at: string
          created_by: string | null
          delta: number
          id: string
          reason: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta: number
          id?: string
          reason?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          reason?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extra_employees_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      extra_whatsapp_numbers: {
        Row: {
          created_at: string
          id: string
          quantity: number
          stripe_subscription_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          quantity?: number
          stripe_subscription_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          quantity?: number
          stripe_subscription_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extra_whatsapp_numbers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      group_agent_runs: {
        Row: {
          agent_id: string
          created_at: string
          group_id: string | null
          id: string
          interactions_count: number
          last_message_at: string
          members_removed: number
          mentions_answered: number
          messages_handled: number
          metadata: Json
          objective_reached: boolean
          objective_reached_at: string | null
          started_at: string
          updated_at: string
          warnings_issued: number
          workspace_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          group_id?: string | null
          id?: string
          interactions_count?: number
          last_message_at?: string
          members_removed?: number
          mentions_answered?: number
          messages_handled?: number
          metadata?: Json
          objective_reached?: boolean
          objective_reached_at?: string | null
          started_at?: string
          updated_at?: string
          warnings_issued?: number
          workspace_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          group_id?: string | null
          id?: string
          interactions_count?: number
          last_message_at?: string
          members_removed?: number
          mentions_answered?: number
          messages_handled?: number
          metadata?: Json
          objective_reached?: boolean
          objective_reached_at?: string | null
          started_at?: string
          updated_at?: string
          warnings_issued?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "group_ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      group_ai_agents: {
        Row: {
          cooldown_seconds: number
          created_at: string
          enabled: boolean
          id: string
          max_tokens: number
          metadata: Json
          model: string
          name: string
          persona: string | null
          respond_only_when_mentioned: boolean
          system_prompt: string | null
          temperature: number
          tools: Json
          triggers: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          cooldown_seconds?: number
          created_at?: string
          enabled?: boolean
          id?: string
          max_tokens?: number
          metadata?: Json
          model?: string
          name: string
          persona?: string | null
          respond_only_when_mentioned?: boolean
          system_prompt?: string | null
          temperature?: number
          tools?: Json
          triggers?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          cooldown_seconds?: number
          created_at?: string
          enabled?: boolean
          id?: string
          max_tokens?: number
          metadata?: Json
          model?: string
          name?: string
          persona?: string | null
          respond_only_when_mentioned?: boolean
          system_prompt?: string | null
          temperature?: number
          tools?: Json
          triggers?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_ai_agents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_label_assignments: {
        Row: {
          created_at: string
          id: string
          label_id: string
          thread_ref: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label_id: string
          thread_ref: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label_id?: string
          thread_ref?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_label_assignments_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "inbox_labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_label_assignments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_labels: {
        Row: {
          color: string | null
          created_at: string
          group_name: string | null
          id: string
          name: string
          workspace_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          group_name?: string | null
          id?: string
          name: string
          workspace_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          group_name?: string | null
          id?: string
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_labels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          created_at: string
          credentials_encrypted: string | null
          expires_at: string | null
          id: string
          last_check_at: string | null
          last_error: string | null
          metadata: Json
          provider: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          credentials_encrypted?: string | null
          expires_at?: string | null
          id?: string
          last_check_at?: string | null
          last_error?: string | null
          metadata?: Json
          provider: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          credentials_encrypted?: string | null
          expires_at?: string | null
          id?: string
          last_check_at?: string | null
          last_error?: string | null
          metadata?: Json
          provider?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_campaign_history: {
        Row: {
          action_type: string
          campaign_id: string | null
          coupon_id: string | null
          created_at: string
          created_by: string | null
          details: Json
          id: string
          result: string
          title: string
        }
        Insert: {
          action_type: string
          campaign_id?: string | null
          coupon_id?: string | null
          created_at?: string
          created_by?: string | null
          details?: Json
          id?: string
          result?: string
          title: string
        }
        Update: {
          action_type?: string
          campaign_id?: string | null
          coupon_id?: string | null
          created_at?: string
          created_by?: string | null
          details?: Json
          id?: string
          result?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_campaign_history_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "internal_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_campaign_history_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_campaigns: {
        Row: {
          action: string
          audience: string
          created_at: string
          created_by: string | null
          id: string
          message: string
          name: string
          scheduled_at: string | null
          status: string
          trigger_key: string | null
          type: string
          updated_at: string
        }
        Insert: {
          action?: string
          audience?: string
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string
          name: string
          scheduled_at?: string | null
          status?: string
          trigger_key?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          action?: string
          audience?: string
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string
          name?: string
          scheduled_at?: string | null
          status?: string
          trigger_key?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      internal_messages: {
        Row: {
          body: string
          created_at: string
          from_user_id: string | null
          id: string
          origin: string
          read_at: string | null
          task_id: string | null
          to_user_id: string
          workspace_id: string
        }
        Insert: {
          body: string
          created_at?: string
          from_user_id?: string | null
          id?: string
          origin?: string
          read_at?: string | null
          task_id?: string | null
          to_user_id: string
          workspace_id: string
        }
        Update: {
          body?: string
          created_at?: string
          from_user_id?: string | null
          id?: string
          origin?: string
          read_at?: string | null
          task_id?: string | null
          to_user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_messages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "workflow_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          id: string
          lead_id: string
          occurred_at: string
          payload: Json
          type: string
          workspace_id: string
        }
        Insert: {
          id?: string
          lead_id: string
          occurred_at?: string
          payload?: Json
          type: string
          workspace_id: string
        }
        Update: {
          id?: string
          lead_id?: string
          occurred_at?: string
          payload?: Json
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_custom_field_values: {
        Row: {
          created_at: string
          field_id: string
          id: string
          lead_id: string
          updated_at: string
          value: Json | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          field_id: string
          id?: string
          lead_id: string
          updated_at?: string
          value?: Json | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          field_id?: string
          id?: string
          lead_id?: string
          updated_at?: string
          value?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_custom_field_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "lead_custom_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_custom_field_values_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_custom_field_values_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_custom_fields: {
        Row: {
          active: boolean
          created_at: string
          field_type: string
          funnel_ids: string[]
          id: string
          name: string
          options: Json
          required: boolean
          unique_value: boolean
          updated_at: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          field_type?: string
          funnel_ids?: string[]
          id?: string
          name: string
          options?: Json
          required?: boolean
          unique_value?: boolean
          updated_at?: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          field_type?: string
          funnel_ids?: string[]
          id?: string
          name?: string
          options?: Json
          required?: boolean
          unique_value?: boolean
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_custom_fields_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_dedupe_dismissals: {
        Row: {
          created_at: string
          dismissed_by: string | null
          id: string
          signature: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          dismissed_by?: string | null
          id?: string
          signature: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          dismissed_by?: string | null
          id?: string
          signature?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_dedupe_dismissals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_products: {
        Row: {
          created_at: string
          id: string
          kind: string
          lead_id: string
          product_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          lead_id: string
          product_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          lead_id?: string
          product_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_products_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_products_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          active_conversation_agent_id: string | null
          ai_paused: boolean
          company_department_id: string | null
          company_id: string | null
          company_role: string | null
          conversation_status: string
          created_at: string
          crm_source_id: string
          custom_data: Json
          email: string | null
          external_id: string | null
          external_updated_at: string | null
          fb_client_ip: string | null
          fb_client_ua: string | null
          fb_event_id: string | null
          fb_external_id: string | null
          fb_fbc: string | null
          fb_fbp: string | null
          id: string
          instagram_igsid: string | null
          keep_files: boolean
          last_message_from: string | null
          merged_into_id: string | null
          messenger_psid: string | null
          name: string
          phone: string | null
          phone_normalized: string | null
          pipeline_id: string | null
          responsible_id: string | null
          source: string | null
          stage_id: string | null
          status: string
          tags: Json
          updated_at: string
          value: number | null
          workspace_id: string
        }
        Insert: {
          active_conversation_agent_id?: string | null
          ai_paused?: boolean
          company_department_id?: string | null
          company_id?: string | null
          company_role?: string | null
          conversation_status?: string
          created_at?: string
          crm_source_id: string
          custom_data?: Json
          email?: string | null
          external_id?: string | null
          external_updated_at?: string | null
          fb_client_ip?: string | null
          fb_client_ua?: string | null
          fb_event_id?: string | null
          fb_external_id?: string | null
          fb_fbc?: string | null
          fb_fbp?: string | null
          id?: string
          instagram_igsid?: string | null
          keep_files?: boolean
          last_message_from?: string | null
          merged_into_id?: string | null
          messenger_psid?: string | null
          name: string
          phone?: string | null
          phone_normalized?: string | null
          pipeline_id?: string | null
          responsible_id?: string | null
          source?: string | null
          stage_id?: string | null
          status?: string
          tags?: Json
          updated_at?: string
          value?: number | null
          workspace_id: string
        }
        Update: {
          active_conversation_agent_id?: string | null
          ai_paused?: boolean
          company_department_id?: string | null
          company_id?: string | null
          company_role?: string | null
          conversation_status?: string
          created_at?: string
          crm_source_id?: string
          custom_data?: Json
          email?: string | null
          external_id?: string | null
          external_updated_at?: string | null
          fb_client_ip?: string | null
          fb_client_ua?: string | null
          fb_event_id?: string | null
          fb_external_id?: string | null
          fb_fbc?: string | null
          fb_fbp?: string | null
          id?: string
          instagram_igsid?: string | null
          keep_files?: boolean
          last_message_from?: string | null
          merged_into_id?: string | null
          messenger_psid?: string | null
          name?: string
          phone?: string | null
          phone_normalized?: string | null
          pipeline_id?: string | null
          responsible_id?: string | null
          source?: string | null
          stage_id?: string | null
          status?: string
          tags?: Json
          updated_at?: string
          value?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_active_conversation_agent_id_fkey"
            columns: ["active_conversation_agent_id"]
            isOneToOne: false
            referencedRelation: "conversation_ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_company_department_id_fkey"
            columns: ["company_department_id"]
            isOneToOne: false
            referencedRelation: "company_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_crm_source_id_fkey"
            columns: ["crm_source_id"]
            isOneToOne: false
            referencedRelation: "crm_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ad_accounts: {
        Row: {
          account_id: string
          account_status: number | null
          business_id: string | null
          created_at: string | null
          currency: string | null
          dashboard_enabled: boolean
          id: string
          name: string | null
          raw: Json | null
          synced_at: string | null
          timezone_name: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          account_id: string
          account_status?: number | null
          business_id?: string | null
          created_at?: string | null
          currency?: string | null
          dashboard_enabled?: boolean
          id?: string
          name?: string | null
          raw?: Json | null
          synced_at?: string | null
          timezone_name?: string | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          account_id?: string
          account_status?: number | null
          business_id?: string | null
          created_at?: string | null
          currency?: string | null
          dashboard_enabled?: boolean
          id?: string
          name?: string | null
          raw?: Json | null
          synced_at?: string | null
          timezone_name?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_automation_rules: {
        Row: {
          action_config: Json
          action_type: string
          action_value: number | null
          action_value_mode: string
          cooldown_minutes: number
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          last_run_at: string | null
          name: string
          scan_interval_minutes: number
          scope_id: string | null
          scope_type: string
          trigger_metric: string
          trigger_operator: string
          trigger_value: number
          trigger_window: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          action_config?: Json
          action_type: string
          action_value?: number | null
          action_value_mode?: string
          cooldown_minutes?: number
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          name: string
          scan_interval_minutes?: number
          scope_id?: string | null
          scope_type: string
          trigger_metric: string
          trigger_operator: string
          trigger_value: number
          trigger_window?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          action_config?: Json
          action_type?: string
          action_value?: number | null
          action_value_mode?: string
          cooldown_minutes?: number
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          name?: string
          scan_interval_minutes?: number
          scope_id?: string | null
          scope_type?: string
          trigger_metric?: string
          trigger_operator?: string
          trigger_value?: number
          trigger_window?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_automation_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_automation_runs: {
        Row: {
          action_status: string
          action_taken: string | null
          campaign_id: string | null
          created_at: string
          error_message: string | null
          id: string
          matched: boolean
          metric_value: number | null
          payload: Json
          rule_id: string | null
          workspace_id: string
        }
        Insert: {
          action_status?: string
          action_taken?: string | null
          campaign_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          matched: boolean
          metric_value?: number | null
          payload?: Json
          rule_id?: string | null
          workspace_id: string
        }
        Update: {
          action_status?: string
          action_taken?: string | null
          campaign_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          matched?: boolean
          metric_value?: number | null
          payload?: Json
          rule_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_automation_runs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "meta_automation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_automation_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_campaign_operations: {
        Row: {
          ad_account_id: string
          created_at: string
          error_message: string | null
          id: string
          operation: string
          request_payload: Json
          response_payload: Json | null
          status: string
          target_id: string | null
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          ad_account_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          operation: string
          request_payload?: Json
          response_payload?: Json | null
          status?: string
          target_id?: string | null
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          ad_account_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          operation?: string
          request_payload?: Json
          response_payload?: Json | null
          status?: string
          target_id?: string | null
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_campaign_operations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_copy_folders: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          name: string
          parent_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name: string
          parent_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name?: string
          parent_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_copy_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "meta_copy_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_copy_folders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_creative_folders: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          name: string
          parent_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name: string
          parent_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name?: string
          parent_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_creative_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "meta_creative_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_creative_folders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_creative_uploads: {
        Row: {
          ad_account_id: string
          created_at: string
          creative_asset_id: string | null
          display_name: string | null
          folder_id: string | null
          height: number | null
          id: string
          kind: string
          linked_at: string | null
          meta_ad_id: string | null
          meta_adset_id: string | null
          meta_campaign_id: string | null
          meta_creative_id: string | null
          meta_image_hash: string | null
          meta_video_id: string | null
          mime: string
          original_filename: string | null
          size_bytes: number | null
          storage_path: string
          tags: string[]
          user_id: string | null
          width: number | null
          workspace_id: string
        }
        Insert: {
          ad_account_id: string
          created_at?: string
          creative_asset_id?: string | null
          display_name?: string | null
          folder_id?: string | null
          height?: number | null
          id?: string
          kind?: string
          linked_at?: string | null
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          meta_creative_id?: string | null
          meta_image_hash?: string | null
          meta_video_id?: string | null
          mime: string
          original_filename?: string | null
          size_bytes?: number | null
          storage_path: string
          tags?: string[]
          user_id?: string | null
          width?: number | null
          workspace_id: string
        }
        Update: {
          ad_account_id?: string
          created_at?: string
          creative_asset_id?: string | null
          display_name?: string | null
          folder_id?: string | null
          height?: number | null
          id?: string
          kind?: string
          linked_at?: string | null
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          meta_creative_id?: string | null
          meta_image_hash?: string | null
          meta_video_id?: string | null
          mime?: string
          original_filename?: string | null
          size_bytes?: number | null
          storage_path?: string
          tags?: string[]
          user_id?: string | null
          width?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_creative_uploads_creative_asset_id_fkey"
            columns: ["creative_asset_id"]
            isOneToOne: false
            referencedRelation: "creative_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_creative_uploads_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "meta_creative_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_creative_uploads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_custom_audiences: {
        Row: {
          ad_account_id: string
          approximate_count: number | null
          audience_id: string
          audience_type: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          delivery_status: string | null
          description: string | null
          id: string
          lookalike_spec: Json | null
          meta_metadata: Json
          name: string
          origin: string
          retention_days: number | null
          rule: Json | null
          source_campaign_id: string | null
          source_rule_id: string | null
          subtype: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ad_account_id: string
          approximate_count?: number | null
          audience_id: string
          audience_type: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          delivery_status?: string | null
          description?: string | null
          id?: string
          lookalike_spec?: Json | null
          meta_metadata?: Json
          name: string
          origin?: string
          retention_days?: number | null
          rule?: Json | null
          source_campaign_id?: string | null
          source_rule_id?: string | null
          subtype?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ad_account_id?: string
          approximate_count?: number | null
          audience_id?: string
          audience_type?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          delivery_status?: string | null
          description?: string | null
          id?: string
          lookalike_spec?: Json | null
          meta_metadata?: Json
          name?: string
          origin?: string
          retention_days?: number | null
          rule?: Json | null
          source_campaign_id?: string | null
          source_rule_id?: string | null
          subtype?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      meta_instagram_accounts: {
        Row: {
          created_at: string | null
          followers_count: number | null
          id: string
          instagram_id: string
          messaging_error: string | null
          messaging_subscribed_at: string | null
          page_id: string | null
          profile_picture_url: string | null
          raw: Json | null
          synced_at: string | null
          updated_at: string | null
          username: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          followers_count?: number | null
          id?: string
          instagram_id: string
          messaging_error?: string | null
          messaging_subscribed_at?: string | null
          page_id?: string | null
          profile_picture_url?: string | null
          raw?: Json | null
          synced_at?: string | null
          updated_at?: string | null
          username?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          followers_count?: number | null
          id?: string
          instagram_id?: string
          messaging_error?: string | null
          messaging_subscribed_at?: string | null
          page_id?: string | null
          profile_picture_url?: string | null
          raw?: Json | null
          synced_at?: string | null
          updated_at?: string | null
          username?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_instagram_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_lead_events: {
        Row: {
          ad_id: string | null
          campaign_id: string | null
          created_at: string | null
          error: string | null
          form_id: string | null
          id: string
          lead_id_created: string | null
          leadgen_id: string | null
          page_id: string | null
          payload: Json | null
          processed_at: string | null
          workspace_id: string | null
        }
        Insert: {
          ad_id?: string | null
          campaign_id?: string | null
          created_at?: string | null
          error?: string | null
          form_id?: string | null
          id?: string
          lead_id_created?: string | null
          leadgen_id?: string | null
          page_id?: string | null
          payload?: Json | null
          processed_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          ad_id?: string | null
          campaign_id?: string | null
          created_at?: string | null
          error?: string | null
          form_id?: string | null
          id?: string
          lead_id_created?: string | null
          leadgen_id?: string | null
          page_id?: string | null
          payload?: Json | null
          processed_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_lead_events_lead_id_created_fkey"
            columns: ["lead_id_created"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_lead_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_pages: {
        Row: {
          access_token_encrypted: string | null
          category: string | null
          created_at: string | null
          id: string
          messaging_error: string | null
          messaging_subscribed_at: string | null
          page_id: string
          page_name: string | null
          raw: Json | null
          synced_at: string | null
          tasks: string[] | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          messaging_error?: string | null
          messaging_subscribed_at?: string | null
          page_id: string
          page_name?: string | null
          raw?: Json | null
          synced_at?: string | null
          tasks?: string[] | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          messaging_error?: string | null
          messaging_subscribed_at?: string | null
          page_id?: string
          page_name?: string | null
          raw?: Json | null
          synced_at?: string | null
          tasks?: string[] | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_pages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_personas: {
        Row: {
          ad_account_id: string
          copy_templates: Json
          created_at: string
          created_by: string | null
          default_objective: string | null
          demographics: Json
          description: string | null
          detailed_targeting: Json
          id: string
          linked_ig_ids: string[]
          linked_page_ids: string[]
          linked_wa_ids: string[]
          locations: Json
          map_pins: Json
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ad_account_id: string
          copy_templates?: Json
          created_at?: string
          created_by?: string | null
          default_objective?: string | null
          demographics?: Json
          description?: string | null
          detailed_targeting?: Json
          id?: string
          linked_ig_ids?: string[]
          linked_page_ids?: string[]
          linked_wa_ids?: string[]
          locations?: Json
          map_pins?: Json
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ad_account_id?: string
          copy_templates?: Json
          created_at?: string
          created_by?: string | null
          default_objective?: string | null
          demographics?: Json
          description?: string | null
          detailed_targeting?: Json
          id?: string
          linked_ig_ids?: string[]
          linked_page_ids?: string[]
          linked_wa_ids?: string[]
          locations?: Json
          map_pins?: Json
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_personas_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_pixels: {
        Row: {
          ad_account_id: string
          created_at: string | null
          id: string
          last_fired_time: string | null
          pixel_id: string
          pixel_name: string | null
          raw: Json | null
          synced_at: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          ad_account_id: string
          created_at?: string | null
          id?: string
          last_fired_time?: string | null
          pixel_id: string
          pixel_name?: string | null
          raw?: Json | null
          synced_at?: string | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          ad_account_id?: string
          created_at?: string | null
          id?: string
          last_fired_time?: string | null
          pixel_id?: string
          pixel_name?: string | null
          raw?: Json | null
          synced_at?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_pixels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_saved_copies: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          folder_id: string | null
          id: string
          name: string
          notes: string
          tags: string[]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          created_by?: string | null
          folder_id?: string | null
          id?: string
          name: string
          notes?: string
          tags?: string[]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          folder_id?: string | null
          id?: string
          name?: string
          notes?: string
          tags?: string[]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_saved_copies_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "meta_copy_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_saved_copies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_strategies: {
        Row: {
          ad_account_id: string | null
          automation_rules: Json
          bid_strategy: string | null
          budget_amount: number | null
          budget_level: string | null
          budget_mode: string | null
          copy_guidelines: string
          created_at: string
          created_by: string | null
          default_objective: string | null
          description: string
          enabled: boolean
          id: string
          linked_ig_ids: string[]
          linked_page_ids: string[]
          linked_wa_phone_ids: string[]
          name: string
          optimization_goal: string | null
          persona_id: string | null
          placements: Json
          schedule: Json
          targeting_hints: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ad_account_id?: string | null
          automation_rules?: Json
          bid_strategy?: string | null
          budget_amount?: number | null
          budget_level?: string | null
          budget_mode?: string | null
          copy_guidelines?: string
          created_at?: string
          created_by?: string | null
          default_objective?: string | null
          description?: string
          enabled?: boolean
          id?: string
          linked_ig_ids?: string[]
          linked_page_ids?: string[]
          linked_wa_phone_ids?: string[]
          name: string
          optimization_goal?: string | null
          persona_id?: string | null
          placements?: Json
          schedule?: Json
          targeting_hints?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ad_account_id?: string | null
          automation_rules?: Json
          bid_strategy?: string | null
          budget_amount?: number | null
          budget_level?: string | null
          budget_mode?: string | null
          copy_guidelines?: string
          created_at?: string
          created_by?: string | null
          default_objective?: string | null
          description?: string
          enabled?: boolean
          id?: string
          linked_ig_ids?: string[]
          linked_page_ids?: string[]
          linked_wa_phone_ids?: string[]
          name?: string
          optimization_goal?: string | null
          persona_id?: string | null
          placements?: Json
          schedule?: Json
          targeting_hints?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_strategies_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "meta_personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_strategies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_snapshots: {
        Row: {
          captured_at: string
          created_at: string
          data: Json
          id: string
          metric_key: string
          period: string
          scope: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          captured_at?: string
          created_at?: string
          data?: Json
          id?: string
          metric_key: string
          period?: string
          scope: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          captured_at?: string
          created_at?: string
          data?: Json
          id?: string
          metric_key?: string
          period?: string
          scope?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "metric_snapshots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      module_permissions: {
        Row: {
          created_at: string
          id: string
          modules: string[]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          modules?: string[]
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          modules?: string[]
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_permissions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      note_groups: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          position: number
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          position?: number
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          task_id: string | null
          title: string
          type: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          task_id?: string | null
          title: string
          type: string
          user_id: string
          workspace_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          task_id?: string | null
          title?: string
          type?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "workflow_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_program_academy_certifications: {
        Row: {
          certificate_code: string
          id: string
          issued_at: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          user_id: string
        }
        Insert: {
          certificate_code: string
          id?: string
          issued_at?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          user_id: string
        }
        Update: {
          certificate_code?: string
          id?: string
          issued_at?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      partner_program_academy_courses: {
        Row: {
          created_at: string
          description: string | null
          id: string
          published: boolean
          slug: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          published?: boolean
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          published?: boolean
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      partner_program_academy_lessons: {
        Row: {
          content: Json
          created_at: string
          id: string
          module_id: string
          published: boolean
          sort_order: number
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          content?: Json
          created_at?: string
          id?: string
          module_id: string
          published?: boolean
          sort_order?: number
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          module_id?: string
          published?: boolean
          sort_order?: number
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_program_academy_lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "partner_program_academy_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_program_academy_modules: {
        Row: {
          course_id: string
          created_at: string
          description: string | null
          id: string
          published: boolean
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          description?: string | null
          id?: string
          published?: boolean
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          description?: string | null
          id?: string
          published?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_program_academy_modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "partner_program_academy_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_program_academy_progress: {
        Row: {
          completed_at: string
          lesson_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          lesson_id: string
          user_id: string
        }
        Update: {
          completed_at?: string
          lesson_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_program_academy_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "partner_program_academy_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_program_attribution_history: {
        Row: {
          action: string
          actor_user_id: string | null
          after_data: Json | null
          attribution_id: string
          before_data: Json | null
          created_at: string
          id: string
          reason: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_data?: Json | null
          attribution_id: string
          before_data?: Json | null
          created_at?: string
          id?: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_data?: Json | null
          attribution_id?: string
          before_data?: Json | null
          created_at?: string
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_program_attribution_history_attribution_id_fkey"
            columns: ["attribution_id"]
            isOneToOne: false
            referencedRelation: "partner_program_attributions"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_program_attributions: {
        Row: {
          assigned_at: string
          attribution_status: string
          client_workspace_id: string | null
          corrected_at: string | null
          corrected_by: string | null
          correction_reason: string | null
          created_at: string
          current_referrer_user_id: string
          external_subscription_id: string | null
          id: string
          original_referrer_user_id: string
          signup_user_id: string
          source_visit_id: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          attribution_status?: string
          client_workspace_id?: string | null
          corrected_at?: string | null
          corrected_by?: string | null
          correction_reason?: string | null
          created_at?: string
          current_referrer_user_id: string
          external_subscription_id?: string | null
          id?: string
          original_referrer_user_id: string
          signup_user_id: string
          source_visit_id: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          attribution_status?: string
          client_workspace_id?: string | null
          corrected_at?: string | null
          corrected_by?: string | null
          correction_reason?: string | null
          created_at?: string
          current_referrer_user_id?: string
          external_subscription_id?: string | null
          id?: string
          original_referrer_user_id?: string
          signup_user_id?: string
          source_visit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_program_attributions_client_workspace_id_fkey"
            columns: ["client_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_program_attributions_source_visit_id_fkey"
            columns: ["source_visit_id"]
            isOneToOne: false
            referencedRelation: "partner_program_referral_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_program_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          reason: string | null
          subject_user_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          reason?: string | null
          subject_user_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          reason?: string | null
          subject_user_id?: string | null
        }
        Relationships: []
      }
      partner_program_commission_ledger: {
        Row: {
          amount_cents: number
          beneficiary_user_id: string
          commission_kind: string
          created_at: string
          currency: string
          gross_amount_cents: number
          id: string
          metadata: Json
          rate_bps: number
          reversal_of: string | null
          role: string
          source_id: string
          source_occurred_at: string
          source_type: string
          status: string
          workspace_id: string | null
        }
        Insert: {
          amount_cents: number
          beneficiary_user_id: string
          commission_kind: string
          created_at?: string
          currency?: string
          gross_amount_cents: number
          id?: string
          metadata?: Json
          rate_bps: number
          reversal_of?: string | null
          role: string
          source_id: string
          source_occurred_at: string
          source_type: string
          status?: string
          workspace_id?: string | null
        }
        Update: {
          amount_cents?: number
          beneficiary_user_id?: string
          commission_kind?: string
          created_at?: string
          currency?: string
          gross_amount_cents?: number
          id?: string
          metadata?: Json
          rate_bps?: number
          reversal_of?: string | null
          role?: string
          source_id?: string
          source_occurred_at?: string
          source_type?: string
          status?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_program_commission_ledger_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "partner_program_commission_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_program_commission_ledger_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_program_commission_rules: {
        Row: {
          beneficiary_user_id: string | null
          commission_kind: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          rate_bps: number
          reason: string | null
          role: string
        }
        Insert: {
          beneficiary_user_id?: string | null
          commission_kind: string
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          rate_bps: number
          reason?: string | null
          role: string
        }
        Update: {
          beneficiary_user_id?: string | null
          commission_kind?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          rate_bps?: number
          reason?: string | null
          role?: string
        }
        Relationships: []
      }
      partner_program_community_comments: {
        Row: {
          author_role: string
          author_user_id: string
          body: string
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          post_id: string
          status: string
          updated_at: string
        }
        Insert: {
          author_role: string
          author_user_id: string
          body: string
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          post_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          author_role?: string
          author_user_id?: string
          body?: string
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          post_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_program_community_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "partner_program_community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_program_community_memberships: {
        Row: {
          id: string
          joined_at: string
          role: string
          status: string
          suspended_at: string | null
          suspended_by: string | null
          suspension_reason: string | null
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          role: string
          status?: string
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          role?: string
          status?: string
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      partner_program_community_posts: {
        Row: {
          audience: string
          author_role: string
          author_user_id: string
          body: string
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          audience?: string
          author_role: string
          author_user_id: string
          body: string
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          audience?: string
          author_role?: string
          author_user_id?: string
          body?: string
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      partner_program_customer_links: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          partner_user_id: string
          reason: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          partner_user_id: string
          reason?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          partner_user_id?: string
          reason?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_program_customer_links_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_program_partner_profiles: {
        Row: {
          certified_at: string | null
          created_at: string
          professional_bio: string | null
          specialties: string[]
          support_status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          certified_at?: string | null
          created_at?: string
          professional_bio?: string | null
          specialties?: string[]
          support_status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          certified_at?: string | null
          created_at?: string
          professional_bio?: string | null
          specialties?: string[]
          support_status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      partner_program_partner_tiers: {
        Row: {
          commission_rate_bps: number
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          evaluation_period_days: number
          id: string
          min_revenue_cents: number
          name: string
        }
        Insert: {
          commission_rate_bps: number
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          evaluation_period_days: number
          id?: string
          min_revenue_cents: number
          name: string
        }
        Update: {
          commission_rate_bps?: number
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          evaluation_period_days?: number
          id?: string
          min_revenue_cents?: number
          name?: string
        }
        Relationships: []
      }
      partner_program_payment_profiles: {
        Row: {
          created_at: string
          document_encrypted: string
          document_last4: string
          document_type: string
          holder_name: string
          id: string
          pix_key_encrypted: string
          pix_key_last4: string
          pix_key_type: string
          updated_at: string
          user_id: string
          verification_reason: string | null
          verification_status: string
          verified_at: string | null
          verified_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          document_encrypted: string
          document_last4: string
          document_type: string
          holder_name: string
          id?: string
          pix_key_encrypted: string
          pix_key_last4: string
          pix_key_type: string
          updated_at?: string
          user_id: string
          verification_reason?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          document_encrypted?: string
          document_last4?: string
          document_type?: string
          holder_name?: string
          id?: string
          pix_key_encrypted?: string
          pix_key_last4?: string
          pix_key_type?: string
          updated_at?: string
          user_id?: string
          verification_reason?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
          version?: number
        }
        Relationships: []
      }
      partner_program_payout_items: {
        Row: {
          amount_cents: number
          id: string
          ledger_id: string
          payout_request_id: string
          released_at: string | null
          reserved_at: string
        }
        Insert: {
          amount_cents: number
          id?: string
          ledger_id: string
          payout_request_id: string
          released_at?: string | null
          reserved_at?: string
        }
        Update: {
          amount_cents?: number
          id?: string
          ledger_id?: string
          payout_request_id?: string
          released_at?: string | null
          reserved_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_program_payout_items_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "partner_program_commission_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_program_payout_items_payout_request_id_fkey"
            columns: ["payout_request_id"]
            isOneToOne: false
            referencedRelation: "partner_program_payout_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_program_payout_requests: {
        Row: {
          amount_cents: number
          approved_at: string | null
          approved_by: string | null
          beneficiary_user_id: string
          created_at: string
          currency: string
          id: string
          paid_at: string | null
          paid_by: string | null
          payment_profile_id: string
          payment_profile_version: number
          payment_reference: string | null
          proof_reference: string | null
          rejected_at: string | null
          rejected_by: string | null
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          status_reason: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          approved_at?: string | null
          approved_by?: string | null
          beneficiary_user_id: string
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          payment_profile_id: string
          payment_profile_version: number
          payment_reference?: string | null
          proof_reference?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          status_reason?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          approved_at?: string | null
          approved_by?: string | null
          beneficiary_user_id?: string
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          payment_profile_id?: string
          payment_profile_version?: number
          payment_reference?: string | null
          proof_reference?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          status_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_program_payout_requests_payment_profile_id_fkey"
            columns: ["payment_profile_id"]
            isOneToOne: false
            referencedRelation: "partner_program_payment_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_program_profiles: {
        Row: {
          acquisition_channel: string | null
          audience_description: string | null
          created_at: string
          display_name: string | null
          experience_level: string | null
          instagram_handle: string | null
          person_type: string | null
          referral_code: string
          updated_at: string
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          acquisition_channel?: string | null
          audience_description?: string | null
          created_at?: string
          display_name?: string | null
          experience_level?: string | null
          instagram_handle?: string | null
          person_type?: string | null
          referral_code: string
          updated_at?: string
          user_id: string
          whatsapp?: string | null
        }
        Update: {
          acquisition_channel?: string | null
          audience_description?: string | null
          created_at?: string
          display_name?: string | null
          experience_level?: string | null
          instagram_handle?: string | null
          person_type?: string | null
          referral_code?: string
          updated_at?: string
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      partner_program_referral_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      partner_program_referral_visits: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          landing_path: string | null
          referral_code: string
          referrer_user_id: string
          role_snapshot: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          visitor_token: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          landing_path?: string | null
          referral_code: string
          referrer_user_id: string
          role_snapshot: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_token?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          landing_path?: string | null
          referral_code?: string
          referrer_user_id?: string
          role_snapshot?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_token?: string
        }
        Relationships: []
      }
      partner_program_roles: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          blocked_at: string | null
          blocked_by: string | null
          created_at: string
          id: string
          requested_at: string
          role: string
          status: string
          status_reason: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string
          id?: string
          requested_at?: string
          role: string
          status?: string
          status_reason?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string
          id?: string
          requested_at?: string
          role?: string
          status?: string
          status_reason?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      partner_program_sandbox_daily_usage: {
        Row: {
          message_count: number
          sandbox_id: string
          updated_at: string
          usage_date: string
        }
        Insert: {
          message_count?: number
          sandbox_id: string
          updated_at?: string
          usage_date: string
        }
        Update: {
          message_count?: number
          sandbox_id?: string
          updated_at?: string
          usage_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_program_sandbox_daily_usage_sandbox_id_fkey"
            columns: ["sandbox_id"]
            isOneToOne: false
            referencedRelation: "partner_program_sandboxes"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_program_sandbox_monthly_usage: {
        Row: {
          contact_count: number
          month_start: string
          sandbox_id: string
          updated_at: string
        }
        Insert: {
          contact_count?: number
          month_start: string
          sandbox_id: string
          updated_at?: string
        }
        Update: {
          contact_count?: number
          month_start?: string
          sandbox_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_program_sandbox_monthly_usage_sandbox_id_fkey"
            columns: ["sandbox_id"]
            isOneToOne: false
            referencedRelation: "partner_program_sandboxes"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_program_sandboxes: {
        Row: {
          active: boolean
          assigned_at: string
          assigned_by: string | null
          daily_message_limit: number
          disabled_at: string | null
          disabled_by: string | null
          id: string
          monthly_contact_limit: number
          partner_user_id: string
          reason: string | null
          workspace_id: string
        }
        Insert: {
          active?: boolean
          assigned_at?: string
          assigned_by?: string | null
          daily_message_limit?: number
          disabled_at?: string | null
          disabled_by?: string | null
          id?: string
          monthly_contact_limit?: number
          partner_user_id: string
          reason?: string | null
          workspace_id: string
        }
        Update: {
          active?: boolean
          assigned_at?: string
          assigned_by?: string | null
          daily_message_limit?: number
          disabled_at?: string | null
          disabled_by?: string | null
          id?: string
          monthly_contact_limit?: number
          partner_user_id?: string
          reason?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_program_sandboxes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          boleto_line: string | null
          boleto_url: string | null
          coupon_id: string | null
          created_at: string
          discount_cents: number
          due_at: string | null
          extra_employees: number
          id: string
          method: string
          paid_at: string | null
          period: string | null
          pix_copy_paste: string | null
          pix_qr: string | null
          plan_id: string | null
          provider: string
          provider_charge_id: string | null
          raw_response: Json | null
          status: string
          subscription_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount_cents: number
          boleto_line?: string | null
          boleto_url?: string | null
          coupon_id?: string | null
          created_at?: string
          discount_cents?: number
          due_at?: string | null
          extra_employees?: number
          id?: string
          method: string
          paid_at?: string | null
          period?: string | null
          pix_copy_paste?: string | null
          pix_qr?: string | null
          plan_id?: string | null
          provider?: string
          provider_charge_id?: string | null
          raw_response?: Json | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount_cents?: number
          boleto_line?: string | null
          boleto_url?: string | null
          coupon_id?: string | null
          created_at?: string
          discount_cents?: number
          due_at?: string | null
          extra_employees?: number
          id?: string
          method?: string
          paid_at?: string | null
          period?: string | null
          pix_copy_paste?: string | null
          pix_qr?: string | null
          plan_id?: string | null
          provider?: string
          provider_charge_id?: string | null
          raw_response?: Json | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_templates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          permissions: Json
          sector_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          permissions?: Json
          sector_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          permissions?: Json
          sector_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_templates_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "workflow_sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          external_id: string | null
          id: string
          name: string
          pipeline_id: string
          position: number
          product_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          external_id?: string | null
          id?: string
          name: string
          pipeline_id: string
          position?: number
          product_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          external_id?: string | null
          id?: string
          name?: string
          pipeline_id?: string
          position?: number
          product_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stages_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          created_at: string
          crm_source_id: string
          external_id: string | null
          id: string
          name: string
          position: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          crm_source_id: string
          external_id?: string | null
          id?: string
          name: string
          position?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          crm_source_id?: string
          external_id?: string | null
          id?: string
          name?: string
          position?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_crm_source_id_fkey"
            columns: ["crm_source_id"]
            isOneToOne: false
            referencedRelation: "crm_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipelines_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_prices: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          id: string
          period: string
          plan_id: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          id?: string
          period: string
          plan_id: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          period?: string
          plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_prices_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          max_companies: number
          max_employees_per_company: number
          modules: string[]
          name: string
          tier: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_companies?: number
          max_employees_per_company?: number
          modules?: string[]
          name: string
          tier: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_companies?: number
          max_employees_per_company?: number
          modules?: string[]
          name?: string
          tier?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_catalogs: {
        Row: {
          cover: string
          created_at: string
          description: string
          id: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          cover?: string
          created_at?: string
          description?: string
          id?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          cover?: string
          created_at?: string
          description?: string
          id?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_catalogs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          catalog_id: string
          category: string
          created_at: string
          description: string
          id: string
          image: string
          name: string
          price: number
          promo_price: number | null
          sku: string
          stock: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          catalog_id: string
          category?: string
          created_at?: string
          description?: string
          id?: string
          image?: string
          name: string
          price?: number
          promo_price?: number | null
          sku?: string
          stock?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          catalog_id?: string
          category?: string
          created_at?: string
          description?: string
          id?: string
          image?: string
          name?: string
          price?: number
          promo_price?: number | null
          sku?: string
          stock?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "product_catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          acquisition_source: string | null
          avatar_url: string | null
          bio: string | null
          birth_date: string | null
          city: string | null
          company_name: string | null
          company_size: string | null
          country: string | null
          cpf: string | null
          created_at: string
          current_workspace_id: string | null
          display_name: string | null
          full_name: string | null
          id: string
          instagram_handle: string | null
          internal_notes: string | null
          job_title: string | null
          linkedin_url: string | null
          niche: string | null
          notification_prefs: Json
          phone_alt: string | null
          preferred_contact: string | null
          preferred_crm_source_id: string | null
          role_in_company: string | null
          state: string | null
          timezone: string
          updated_at: string
          website_url: string | null
          whatsapp_primary: string | null
          whatsapp_secondary: string | null
        }
        Insert: {
          acquisition_source?: string | null
          avatar_url?: string | null
          bio?: string | null
          birth_date?: string | null
          city?: string | null
          company_name?: string | null
          company_size?: string | null
          country?: string | null
          cpf?: string | null
          created_at?: string
          current_workspace_id?: string | null
          display_name?: string | null
          full_name?: string | null
          id: string
          instagram_handle?: string | null
          internal_notes?: string | null
          job_title?: string | null
          linkedin_url?: string | null
          niche?: string | null
          notification_prefs?: Json
          phone_alt?: string | null
          preferred_contact?: string | null
          preferred_crm_source_id?: string | null
          role_in_company?: string | null
          state?: string | null
          timezone?: string
          updated_at?: string
          website_url?: string | null
          whatsapp_primary?: string | null
          whatsapp_secondary?: string | null
        }
        Update: {
          acquisition_source?: string | null
          avatar_url?: string | null
          bio?: string | null
          birth_date?: string | null
          city?: string | null
          company_name?: string | null
          company_size?: string | null
          country?: string | null
          cpf?: string | null
          created_at?: string
          current_workspace_id?: string | null
          display_name?: string | null
          full_name?: string | null
          id?: string
          instagram_handle?: string | null
          internal_notes?: string | null
          job_title?: string | null
          linkedin_url?: string | null
          niche?: string | null
          notification_prefs?: Json
          phone_alt?: string | null
          preferred_contact?: string | null
          preferred_crm_source_id?: string | null
          role_in_company?: string | null
          state?: string | null
          timezone?: string
          updated_at?: string
          website_url?: string | null
          whatsapp_primary?: string | null
          whatsapp_secondary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_current_workspace_id_fkey"
            columns: ["current_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      salesbot_blocks: {
        Row: {
          config: Json
          created_at: string
          id: string
          local_id: string | null
          next_block_id: string | null
          position_x: number
          position_y: number
          salesbot_id: string
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          local_id?: string | null
          next_block_id?: string | null
          position_x?: number
          position_y?: number
          salesbot_id: string
          type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          local_id?: string | null
          next_block_id?: string | null
          position_x?: number
          position_y?: number
          salesbot_id?: string
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salesbot_blocks_salesbot_id_fkey"
            columns: ["salesbot_id"]
            isOneToOne: false
            referencedRelation: "salesbots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salesbot_blocks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      salesbot_round_robin_state: {
        Row: {
          block_id: string
          counter: number
          updated_at: string
        }
        Insert: {
          block_id: string
          counter?: number
          updated_at?: string
        }
        Update: {
          block_id?: string
          counter?: number
          updated_at?: string
        }
        Relationships: []
      }
      salesbot_run_logs: {
        Row: {
          block_id: string | null
          block_type: string | null
          created_at: string
          id: string
          message: string | null
          payload: Json
          run_id: string
          salesbot_run_id: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          block_id?: string | null
          block_type?: string | null
          created_at?: string
          id?: string
          message?: string | null
          payload?: Json
          run_id: string
          salesbot_run_id?: string | null
          status: string
          workspace_id: string
        }
        Update: {
          block_id?: string | null
          block_type?: string | null
          created_at?: string
          id?: string
          message?: string | null
          payload?: Json
          run_id?: string
          salesbot_run_id?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salesbot_run_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "salesbot_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salesbot_run_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      salesbot_runs: {
        Row: {
          current_block_id: string | null
          finished_at: string | null
          id: string
          last_error: string | null
          lead_id: string
          salesbot_id: string
          started_at: string
          status: string
          updated_at: string
          variables: Json
          waiting_until: string | null
          workspace_id: string
        }
        Insert: {
          current_block_id?: string | null
          finished_at?: string | null
          id?: string
          last_error?: string | null
          lead_id: string
          salesbot_id: string
          started_at?: string
          status?: string
          updated_at?: string
          variables?: Json
          waiting_until?: string | null
          workspace_id: string
        }
        Update: {
          current_block_id?: string | null
          finished_at?: string | null
          id?: string
          last_error?: string | null
          lead_id?: string
          salesbot_id?: string
          started_at?: string
          status?: string
          updated_at?: string
          variables?: Json
          waiting_until?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salesbot_runs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salesbot_runs_salesbot_id_fkey"
            columns: ["salesbot_id"]
            isOneToOne: false
            referencedRelation: "salesbots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salesbot_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      salesbots: {
        Row: {
          created_at: string
          gatilhos: Json
          id: string
          is_active: boolean
          local_id: string | null
          name: string
          scope: string
          settings: Json
          trigger: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          gatilhos?: Json
          id?: string
          is_active?: boolean
          local_id?: string | null
          name: string
          scope?: string
          settings?: Json
          trigger?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          gatilhos?: Json
          id?: string
          is_active?: boolean
          local_id?: string | null
          name?: string
          scope?: string
          settings?: Json
          trigger?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salesbots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_report_runs: {
        Row: {
          channels_ok: string[]
          delivery_formats: Json
          error: string | null
          id: string
          kind: string
          name: string | null
          preset: string | null
          ran_at: string
          recipients_whatsapp: string[]
          report_id: string | null
          status: string
          totals: Json | null
          workspace_id: string
        }
        Insert: {
          channels_ok?: string[]
          delivery_formats?: Json
          error?: string | null
          id?: string
          kind?: string
          name?: string | null
          preset?: string | null
          ran_at?: string
          recipients_whatsapp?: string[]
          report_id?: string | null
          status: string
          totals?: Json | null
          workspace_id: string
        }
        Update: {
          channels_ok?: string[]
          delivery_formats?: Json
          error?: string | null
          id?: string
          kind?: string
          name?: string | null
          preset?: string | null
          ran_at?: string
          recipients_whatsapp?: string[]
          report_id?: string | null
          status?: string
          totals?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_report_runs_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "scheduled_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_reports: {
        Row: {
          channels: string[]
          created_at: string
          created_by: string | null
          delivery_formats: Json
          enabled: boolean
          footer_text: string | null
          frequency: string
          id: string
          include_ai_suggestions: boolean
          intro_text: string | null
          last_error: string | null
          last_run_at: string | null
          last_status: string | null
          name: string
          next_run_at: string | null
          preset: string
          recipients_email: string[]
          recipients_whatsapp: string[]
          selected_kpis: Json
          send_hour_local: number
          send_minute_local: number
          timezone: string
          title_template: string | null
          updated_at: string
          weekly_day: number
          workspace_id: string
        }
        Insert: {
          channels?: string[]
          created_at?: string
          created_by?: string | null
          delivery_formats?: Json
          enabled?: boolean
          footer_text?: string | null
          frequency?: string
          id?: string
          include_ai_suggestions?: boolean
          intro_text?: string | null
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          name: string
          next_run_at?: string | null
          preset?: string
          recipients_email?: string[]
          recipients_whatsapp?: string[]
          selected_kpis?: Json
          send_hour_local?: number
          send_minute_local?: number
          timezone?: string
          title_template?: string | null
          updated_at?: string
          weekly_day?: number
          workspace_id: string
        }
        Update: {
          channels?: string[]
          created_at?: string
          created_by?: string | null
          delivery_formats?: Json
          enabled?: boolean
          footer_text?: string | null
          frequency?: string
          id?: string
          include_ai_suggestions?: boolean
          intro_text?: string | null
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          name?: string
          next_run_at?: string | null
          preset?: string
          recipients_email?: string[]
          recipients_whatsapp?: string[]
          selected_kpis?: Json
          send_hour_local?: number
          send_minute_local?: number
          timezone?: string
          title_template?: string | null
          updated_at?: string
          weekly_day?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_reports_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      security_events: {
        Row: {
          actor_name: string | null
          created_at: string
          description: string | null
          device_key: string | null
          id: string
          ip: string | null
          metadata: Json
          region: string | null
          severity: string
          title: string
          type: string
          user_agent: string | null
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          actor_name?: string | null
          created_at?: string
          description?: string | null
          device_key?: string | null
          id?: string
          ip?: string | null
          metadata?: Json
          region?: string | null
          severity?: string
          title: string
          type: string
          user_agent?: string | null
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          actor_name?: string | null
          created_at?: string
          description?: string | null
          device_key?: string | null
          id?: string
          ip?: string | null
          metadata?: Json
          region?: string | null
          severity?: string
          title?: string
          type?: string
          user_agent?: string | null
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_brand_context: {
        Row: {
          audience_desires: string | null
          audience_pains: string | null
          brand_colors: string | null
          company_name: string | null
          competitors_references: string | null
          concorrentes: string[] | null
          created_at: string
          desejos_publico: string | null
          differentials: string | null
          dislikes_examples: string | null
          dores_publico: string | null
          estilo_visual_desejado: string | null
          facebook_goal: string | null
          forbidden_themes: string | null
          forbidden_words: string | null
          id: string
          instagram_goal: string | null
          likes_examples: string | null
          linkedin_goal: string | null
          logo_url: string | null
          main_promise: string | null
          objetivo_organico: string | null
          organic_traffic_goal: string | null
          palavras_proibidas: string[] | null
          positioning: string | null
          post_types: string | null
          products_services: string | null
          promessa_principal: string | null
          segment: string | null
          target_audience: string | null
          temas_proibidos: string[] | null
          tiktok_goal: string | null
          tone_of_voice: string | null
          updated_at: string
          updated_by: string | null
          visual_memory: string | null
          visual_style: string | null
          workspace_id: string
        }
        Insert: {
          audience_desires?: string | null
          audience_pains?: string | null
          brand_colors?: string | null
          company_name?: string | null
          competitors_references?: string | null
          concorrentes?: string[] | null
          created_at?: string
          desejos_publico?: string | null
          differentials?: string | null
          dislikes_examples?: string | null
          dores_publico?: string | null
          estilo_visual_desejado?: string | null
          facebook_goal?: string | null
          forbidden_themes?: string | null
          forbidden_words?: string | null
          id?: string
          instagram_goal?: string | null
          likes_examples?: string | null
          linkedin_goal?: string | null
          logo_url?: string | null
          main_promise?: string | null
          objetivo_organico?: string | null
          organic_traffic_goal?: string | null
          palavras_proibidas?: string[] | null
          positioning?: string | null
          post_types?: string | null
          products_services?: string | null
          promessa_principal?: string | null
          segment?: string | null
          target_audience?: string | null
          temas_proibidos?: string[] | null
          tiktok_goal?: string | null
          tone_of_voice?: string | null
          updated_at?: string
          updated_by?: string | null
          visual_memory?: string | null
          visual_style?: string | null
          workspace_id: string
        }
        Update: {
          audience_desires?: string | null
          audience_pains?: string | null
          brand_colors?: string | null
          company_name?: string | null
          competitors_references?: string | null
          concorrentes?: string[] | null
          created_at?: string
          desejos_publico?: string | null
          differentials?: string | null
          dislikes_examples?: string | null
          dores_publico?: string | null
          estilo_visual_desejado?: string | null
          facebook_goal?: string | null
          forbidden_themes?: string | null
          forbidden_words?: string | null
          id?: string
          instagram_goal?: string | null
          likes_examples?: string | null
          linkedin_goal?: string | null
          logo_url?: string | null
          main_promise?: string | null
          objetivo_organico?: string | null
          organic_traffic_goal?: string | null
          palavras_proibidas?: string[] | null
          positioning?: string | null
          post_types?: string | null
          products_services?: string | null
          promessa_principal?: string | null
          segment?: string | null
          target_audience?: string | null
          temas_proibidos?: string[] | null
          tiktok_goal?: string | null
          tone_of_voice?: string | null
          updated_at?: string
          updated_by?: string | null
          visual_memory?: string | null
          visual_style?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_brand_context_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_brand_references: {
        Row: {
          analysis: Json | null
          brand_id: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          label: string | null
          sentiment: string
          source_url: string | null
          status: string
          storage_path: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          analysis?: Json | null
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          sentiment?: string
          source_url?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          analysis?: Json | null
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          sentiment?: string
          source_url?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_brand_references_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "social_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_brand_references_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_brands: {
        Row: {
          context: Json
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          name: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          context?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          context?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_brands_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_campaigns: {
        Row: {
          channels: Database["public"]["Enums"]["social_channel"][]
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string | null
          id: string
          ideas: Json
          name: string
          objective: string | null
          plan: Json
          starts_at: string | null
          status: string | null
          theme: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          channels?: Database["public"]["Enums"]["social_channel"][]
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          ideas?: Json
          name: string
          objective?: string | null
          plan?: Json
          starts_at?: string | null
          status?: string | null
          theme?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          channels?: Database["public"]["Enums"]["social_channel"][]
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          ideas?: Json
          name?: string
          objective?: string | null
          plan?: Json
          starts_at?: string | null
          status?: string | null
          theme?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_campaigns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_canva_connections: {
        Row: {
          access_token: string
          canva_user_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          refresh_token: string | null
          scope: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          access_token: string
          canva_user_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          refresh_token?: string | null
          scope?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          access_token?: string
          canva_user_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          refresh_token?: string | null
          scope?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      social_chat_messages: {
        Row: {
          created_at: string
          id: string
          message_id: string | null
          parts: Json
          role: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id?: string | null
          parts?: Json
          role: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string | null
          parts?: Json
          role?: string
          workspace_id?: string
        }
        Relationships: []
      }
      social_ideas: {
        Row: {
          copy_suggestion: string | null
          created_at: string
          id: string
          metadata: Json
          niche: string | null
          origin: string
          priority: number | null
          reference_url: string | null
          tags: string[] | null
          title: string
          used: boolean
          used_post_id: string | null
          workspace_id: string
        }
        Insert: {
          copy_suggestion?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          niche?: string | null
          origin?: string
          priority?: number | null
          reference_url?: string | null
          tags?: string[] | null
          title: string
          used?: boolean
          used_post_id?: string | null
          workspace_id: string
        }
        Update: {
          copy_suggestion?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          niche?: string | null
          origin?: string
          priority?: number | null
          reference_url?: string | null
          tags?: string[] | null
          title?: string
          used?: boolean
          used_post_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_ideas_used_post_id_fkey"
            columns: ["used_post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_ideas_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_post_approvals: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          notes: string | null
          post_id: string
          workspace_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          post_id: string
          workspace_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          post_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_post_approvals_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_post_assets: {
        Row: {
          ai_generated: boolean
          aspect: string | null
          canva_design_id: string | null
          canva_template_id: string | null
          created_at: string
          creative_asset_id: string | null
          format: string | null
          id: string
          kind: string
          metadata: Json
          position: number
          post_id: string
          storage_path: string
          workspace_id: string
        }
        Insert: {
          ai_generated?: boolean
          aspect?: string | null
          canva_design_id?: string | null
          canva_template_id?: string | null
          created_at?: string
          creative_asset_id?: string | null
          format?: string | null
          id?: string
          kind: string
          metadata?: Json
          position?: number
          post_id: string
          storage_path: string
          workspace_id: string
        }
        Update: {
          ai_generated?: boolean
          aspect?: string | null
          canva_design_id?: string | null
          canva_template_id?: string | null
          created_at?: string
          creative_asset_id?: string | null
          format?: string | null
          id?: string
          kind?: string
          metadata?: Json
          position?: number
          post_id?: string
          storage_path?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_post_assets_creative_asset_id_fkey"
            columns: ["creative_asset_id"]
            isOneToOne: false
            referencedRelation: "creative_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_post_assets_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_post_assets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_post_automation_runs: {
        Row: {
          automation_id: string
          comment_id: string
          comment_reply_status: string
          comment_text: string | null
          created_at: string
          dm_reply_status: string
          error_message: string | null
          id: string
          media_id: string | null
          network: string
          post_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          automation_id: string
          comment_id: string
          comment_reply_status?: string
          comment_text?: string | null
          created_at?: string
          dm_reply_status?: string
          error_message?: string | null
          id?: string
          media_id?: string | null
          network: string
          post_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          automation_id?: string
          comment_id?: string
          comment_reply_status?: string
          comment_text?: string | null
          created_at?: string
          dm_reply_status?: string
          error_message?: string | null
          id?: string
          media_id?: string | null
          network?: string
          post_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_post_automation_runs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "social_post_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_post_automation_runs_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_post_automation_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_post_automations: {
        Row: {
          comment_reply_enabled: boolean
          comment_reply_text: string | null
          created_at: string
          created_by: string | null
          dm_reply_enabled: boolean
          dm_reply_text: string | null
          enabled: boolean
          id: string
          keywords: string[]
          match_mode: string
          post_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          comment_reply_enabled?: boolean
          comment_reply_text?: string | null
          created_at?: string
          created_by?: string | null
          dm_reply_enabled?: boolean
          dm_reply_text?: string | null
          enabled?: boolean
          id?: string
          keywords?: string[]
          match_mode?: string
          post_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          comment_reply_enabled?: boolean
          comment_reply_text?: string | null
          created_at?: string
          created_by?: string | null
          dm_reply_enabled?: boolean
          dm_reply_text?: string | null
          enabled?: boolean
          id?: string
          keywords?: string[]
          match_mode?: string
          post_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_post_automations_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_post_automations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_post_channels: {
        Row: {
          channel: Database["public"]["Enums"]["social_channel"]
          id: string
          last_error: string | null
          platform_ref: string | null
          post_id: string
          published_at: string | null
          status: string
          target_ref: string | null
          workspace_id: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["social_channel"]
          id?: string
          last_error?: string | null
          platform_ref?: string | null
          post_id: string
          published_at?: string | null
          status?: string
          target_ref?: string | null
          workspace_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["social_channel"]
          id?: string
          last_error?: string | null
          platform_ref?: string | null
          post_id?: string
          published_at?: string | null
          status?: string
          target_ref?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_post_channels_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_post_channels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_post_metrics: {
        Row: {
          channel: string
          collected_at: string
          comments: number | null
          engagement_rate: number | null
          id: string
          impressions: number | null
          likes: number | null
          post_id: string
          raw: Json | null
          reach: number | null
          saves: number | null
          shares: number | null
          video_views: number | null
          workspace_id: string
        }
        Insert: {
          channel: string
          collected_at?: string
          comments?: number | null
          engagement_rate?: number | null
          id?: string
          impressions?: number | null
          likes?: number | null
          post_id: string
          raw?: Json | null
          reach?: number | null
          saves?: number | null
          shares?: number | null
          video_views?: number | null
          workspace_id: string
        }
        Update: {
          channel?: string
          collected_at?: string
          comments?: number | null
          engagement_rate?: number | null
          id?: string
          impressions?: number | null
          likes?: number | null
          post_id?: string
          raw?: Json | null
          reach?: number | null
          saves?: number | null
          shares?: number | null
          video_views?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_post_metrics_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          ai_prompt: string | null
          ai_provider: Database["public"]["Enums"]["social_ai_provider"] | null
          ai_seed: string | null
          approved_at: string | null
          approved_by: string | null
          briefing: string | null
          campaign_id: string | null
          canva_design_id: string | null
          copy: string | null
          created_at: string
          created_by: string
          cta: string | null
          failed_at: string | null
          hashtags: string[]
          id: string
          idea_id: string | null
          last_error: string | null
          last_publish_attempt_at: string | null
          max_publish_attempts: number
          metadata: Json
          next_publish_attempt_at: string | null
          publish_attempts: number
          published_at: string | null
          reference_urls: string[]
          rejection_reason: string | null
          request_original: string | null
          review_notes: string | null
          scheduled_at: string | null
          status: Database["public"]["Enums"]["social_post_status"]
          submitted_for_approval_at: string | null
          title: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ai_prompt?: string | null
          ai_provider?: Database["public"]["Enums"]["social_ai_provider"] | null
          ai_seed?: string | null
          approved_at?: string | null
          approved_by?: string | null
          briefing?: string | null
          campaign_id?: string | null
          canva_design_id?: string | null
          copy?: string | null
          created_at?: string
          created_by: string
          cta?: string | null
          failed_at?: string | null
          hashtags?: string[]
          id?: string
          idea_id?: string | null
          last_error?: string | null
          last_publish_attempt_at?: string | null
          max_publish_attempts?: number
          metadata?: Json
          next_publish_attempt_at?: string | null
          publish_attempts?: number
          published_at?: string | null
          reference_urls?: string[]
          rejection_reason?: string | null
          request_original?: string | null
          review_notes?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["social_post_status"]
          submitted_for_approval_at?: string | null
          title?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ai_prompt?: string | null
          ai_provider?: Database["public"]["Enums"]["social_ai_provider"] | null
          ai_seed?: string | null
          approved_at?: string | null
          approved_by?: string | null
          briefing?: string | null
          campaign_id?: string | null
          canva_design_id?: string | null
          copy?: string | null
          created_at?: string
          created_by?: string
          cta?: string | null
          failed_at?: string | null
          hashtags?: string[]
          id?: string
          idea_id?: string | null
          last_error?: string | null
          last_publish_attempt_at?: string | null
          max_publish_attempts?: number
          metadata?: Json
          next_publish_attempt_at?: string | null
          publish_attempts?: number
          published_at?: string | null
          reference_urls?: string[]
          rejection_reason?: string | null
          request_original?: string | null
          review_notes?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["social_post_status"]
          submitted_for_approval_at?: string | null
          title?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_storage_cleanup_jobs: {
        Row: {
          attempts: number
          bucket: string
          created_at: string
          id: string
          last_error: string | null
          processed_at: string | null
          status: string
          storage_path: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          bucket?: string
          created_at?: string
          id?: string
          last_error?: string | null
          processed_at?: string | null
          status?: string
          storage_path: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          bucket?: string
          created_at?: string
          id?: string
          last_error?: string | null
          processed_at?: string | null
          status?: string
          storage_path?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_storage_cleanup_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          extra_employees: number
          id: string
          last_payment_id: string | null
          period: string | null
          plan_id: string
          started_at: string | null
          status: string
          trial_ends_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          extra_employees?: number
          id?: string
          last_payment_id?: string | null
          period?: string | null
          plan_id: string
          started_at?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          extra_employees?: number
          id?: string
          last_payment_id?: string | null
          period?: string | null
          plan_id?: string
          started_at?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      support_admin_notes: {
        Row: {
          author_user_id: string
          content: string
          created_at: string
          id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          author_user_id: string
          content: string
          created_at?: string
          id?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          author_user_id?: string
          content?: string
          created_at?: string
          id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_admin_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      support_handoffs: {
        Row: {
          created_at: string
          id: string
          reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_handoffs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      support_robot_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          role: string
          sender_type: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          role: string
          sender_type?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          role?: string
          sender_type?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_robot_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          end_at: string
          external_id: string | null
          external_source: string | null
          external_sync_status: string
          external_synced_at: string | null
          external_url: string | null
          google_event_id: string | null
          google_sync_status: string
          id: string
          kind: Database["public"]["Enums"]["task_kind"]
          lead_id: string | null
          location: string | null
          meeting_url: string | null
          participants: Json
          reminder_minutes: number | null
          start_at: string
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_at: string
          external_id?: string | null
          external_source?: string | null
          external_sync_status?: string
          external_synced_at?: string | null
          external_url?: string | null
          google_event_id?: string | null
          google_sync_status?: string
          id?: string
          kind?: Database["public"]["Enums"]["task_kind"]
          lead_id?: string | null
          location?: string | null
          meeting_url?: string | null
          participants?: Json
          reminder_minutes?: number | null
          start_at: string
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_at?: string
          external_id?: string | null
          external_source?: string | null
          external_sync_status?: string
          external_synced_at?: string | null
          external_url?: string | null
          google_event_id?: string | null
          google_sync_status?: string
          id?: string
          kind?: Database["public"]["Enums"]["task_kind"]
          lead_id?: string | null
          location?: string | null
          meeting_url?: string | null
          participants?: Json
          reminder_minutes?: number | null
          start_at?: string
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      team_chat_reads: {
        Row: {
          conversation_key: string
          created_at: string
          id: string
          last_read_at: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          conversation_key: string
          created_at?: string
          id?: string
          last_read_at?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          conversation_key?: string
          created_at?: string
          id?: string
          last_read_at?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_chat_reads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      team_messages: {
        Row: {
          body: string
          created_at: string
          from_user_id: string | null
          id: string
          origin: string
          read_at: string | null
          sector_id: string | null
          to_user_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          body: string
          created_at?: string
          from_user_id?: string | null
          id?: string
          origin?: string
          read_at?: string | null
          sector_id?: string | null
          to_user_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          body?: string
          created_at?: string
          from_user_id?: string | null
          id?: string
          origin?: string
          read_at?: string | null
          sector_id?: string | null
          to_user_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_messages_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "workflow_sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tracked_links: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          clicks: number
          context_label: string | null
          created_at: string
          created_by: string | null
          id: string
          last_click_at: string | null
          link_label: string | null
          site_id: string | null
          slug: string
          target_url: string
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string
          utm_source: string
          workspace_id: string
        }
        Insert: {
          agent_id?: string | null
          agent_name?: string | null
          clicks?: number
          context_label?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_click_at?: string | null
          link_label?: string | null
          site_id?: string | null
          slug: string
          target_url: string
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string
          utm_source?: string
          workspace_id: string
        }
        Update: {
          agent_id?: string | null
          agent_name?: string | null
          clicks?: number
          context_label?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_click_at?: string | null
          link_label?: string | null
          site_id?: string | null
          slug?: string
          target_url?: string
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string
          utm_source?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracked_links_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "tracking_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracked_links_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_conversion_events: {
        Row: {
          conversion_id: string | null
          created_at: string
          currency: string | null
          dedupe_key: string
          event_row_id: number | null
          id: number
          lead_id: string | null
          utm_campaign: string | null
          utm_source: string | null
          value: number | null
          workspace_id: string
        }
        Insert: {
          conversion_id?: string | null
          created_at?: string
          currency?: string | null
          dedupe_key: string
          event_row_id?: number | null
          id?: number
          lead_id?: string | null
          utm_campaign?: string | null
          utm_source?: string | null
          value?: number | null
          workspace_id: string
        }
        Update: {
          conversion_id?: string | null
          created_at?: string
          currency?: string | null
          dedupe_key?: string
          event_row_id?: number | null
          id?: number
          lead_id?: string | null
          utm_campaign?: string | null
          utm_source?: string | null
          value?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_conversion_events_conversion_id_fkey"
            columns: ["conversion_id"]
            isOneToOne: false
            referencedRelation: "tracking_conversions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_conversion_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_conversion_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_conversions: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          currency: string | null
          default_value: number | null
          event_name: string
          id: string
          name: string
          updated_at: string
          value_expr: string | null
          workspace_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          currency?: string | null
          default_value?: number | null
          event_name: string
          id?: string
          name: string
          updated_at?: string
          value_expr?: string | null
          workspace_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          currency?: string | null
          default_value?: number | null
          event_name?: string
          id?: string
          name?: string
          updated_at?: string
          value_expr?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_conversions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_dispatch_log: {
        Row: {
          created_at: string
          detail: string | null
          event_name: string | null
          event_row_id: number | null
          id: number
          module: string
          status: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          event_name?: string | null
          event_row_id?: number | null
          id?: number
          module: string
          status: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          event_name?: string | null
          event_row_id?: number | null
          id?: number
          module?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_dispatch_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_email_signing_keys: {
        Row: {
          created_at: string
          rotated_at: string | null
          secret: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          rotated_at?: string | null
          secret: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          rotated_at?: string | null
          secret?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_email_signing_keys_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_event_rules: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          event_name: string
          id: string
          match_text: string | null
          name: string
          once_per_session: boolean
          selector: string | null
          site_id: string | null
          threshold: number | null
          trigger_type: string
          updated_at: string
          url_contains: string | null
          value: number | null
          workspace_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          event_name: string
          id?: string
          match_text?: string | null
          name: string
          once_per_session?: boolean
          selector?: string | null
          site_id?: string | null
          threshold?: number | null
          trigger_type?: string
          updated_at?: string
          url_contains?: string | null
          value?: number | null
          workspace_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          event_name?: string
          id?: string
          match_text?: string | null
          name?: string
          once_per_session?: boolean
          selector?: string | null
          site_id?: string | null
          threshold?: number | null
          trigger_type?: string
          updated_at?: string
          url_contains?: string | null
          value?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_event_rules_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "tracking_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_event_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_events: {
        Row: {
          anon_id: string | null
          country: string | null
          created_at: string
          currency: string | null
          event_id: string | null
          event_name: string
          fbclid: string | null
          gclid: string | null
          id: number
          ip: string | null
          lead_id: string | null
          page_path: string | null
          page_url: string | null
          props: Json
          referrer: string | null
          session_id: string | null
          site_id: string | null
          source_class: string
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          value: number | null
          workspace_id: string
        }
        Insert: {
          anon_id?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          event_id?: string | null
          event_name: string
          fbclid?: string | null
          gclid?: string | null
          id?: number
          ip?: string | null
          lead_id?: string | null
          page_path?: string | null
          page_url?: string | null
          props?: Json
          referrer?: string | null
          session_id?: string | null
          site_id?: string | null
          source_class?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          value?: number | null
          workspace_id: string
        }
        Update: {
          anon_id?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          event_id?: string | null
          event_name?: string
          fbclid?: string | null
          gclid?: string | null
          id?: number
          ip?: string | null
          lead_id?: string | null
          page_path?: string | null
          page_url?: string | null
          props?: Json
          referrer?: string | null
          session_id?: string | null
          site_id?: string | null
          source_class?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          value?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_events_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "tracking_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_identities: {
        Row: {
          anon_id: string
          email: string | null
          first_seen_at: string
          first_utm: Json
          id: string
          last_seen_at: string
          last_utm: Json
          lead_id: string | null
          phone: string | null
          workspace_id: string
        }
        Insert: {
          anon_id: string
          email?: string | null
          first_seen_at?: string
          first_utm?: Json
          id?: string
          last_seen_at?: string
          last_utm?: Json
          lead_id?: string | null
          phone?: string | null
          workspace_id: string
        }
        Update: {
          anon_id?: string
          email?: string | null
          first_seen_at?: string
          first_utm?: Json
          id?: string
          last_seen_at?: string
          last_utm?: Json
          lead_id?: string | null
          phone?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_identities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_identities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_sites: {
        Row: {
          created_at: string
          created_by: string | null
          domain: string
          events_24h: number
          id: string
          last_event_at: string | null
          name: string
          pixel_token: string
          updated_at: string
          verified: boolean
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          domain: string
          events_24h?: number
          id?: string
          last_event_at?: string | null
          name: string
          pixel_token?: string
          updated_at?: string
          verified?: boolean
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          domain?: string
          events_24h?: number
          id?: string
          last_event_at?: string | null
          name?: string
          pixel_token?: string
          updated_at?: string
          verified?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_sites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      trusted_devices: {
        Row: {
          approved_at: string
          created_at: string
          device_key: string
          id: string
          ip_address: string | null
          last_seen_at: string
          region: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          approved_at?: string
          created_at?: string
          device_key: string
          id?: string
          ip_address?: string | null
          last_seen_at?: string
          region?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          approved_at?: string
          created_at?: string
          device_key?: string
          id?: string
          ip_address?: string | null
          last_seen_at?: string
          region?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trusted_devices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_mfa_challenges: {
        Row: {
          attempts: number
          channel: string
          code_hash: string
          consumed_at: string | null
          created_at: string
          destination: string | null
          expires_at: string
          id: string
          purpose: string
          user_id: string
        }
        Insert: {
          attempts?: number
          channel?: string
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          destination?: string | null
          expires_at: string
          id?: string
          purpose?: string
          user_id: string
        }
        Update: {
          attempts?: number
          channel?: string
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          destination?: string | null
          expires_at?: string
          id?: string
          purpose?: string
          user_id?: string
        }
        Relationships: []
      }
      user_mfa_settings: {
        Row: {
          email_enabled: boolean
          email_verified_at: string | null
          passkey_enabled: boolean
          totp_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          email_enabled?: boolean
          email_verified_at?: string | null
          passkey_enabled?: boolean
          totp_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          email_enabled?: boolean
          email_verified_at?: string | null
          passkey_enabled?: boolean
          totp_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_notes: {
        Row: {
          color: string
          content: string
          created_at: string
          group_id: string | null
          id: string
          is_archived: boolean
          is_pinned: boolean
          items: Json
          kind: string
          rotation: number
          title: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          color?: string
          content?: string
          created_at?: string
          group_id?: string | null
          id?: string
          is_archived?: boolean
          is_pinned?: boolean
          items?: Json
          kind?: string
          rotation?: number
          title?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          color?: string
          content?: string
          created_at?: string
          group_id?: string | null
          id?: string
          is_archived?: boolean
          is_pinned?: boolean
          items?: Json
          kind?: string
          rotation?: number
          title?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notes_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "note_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_settings: {
        Row: {
          channels: Json
          created_at: string
          digest: Json
          matrix: Json
          push_subscription: Json | null
          quiet: Json
          sound: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          channels?: Json
          created_at?: string
          digest?: Json
          matrix?: Json
          push_subscription?: Json | null
          quiet?: Json
          sound?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          channels?: Json
          created_at?: string
          digest?: Json
          matrix?: Json
          push_subscription?: Json | null
          quiet?: Json
          sound?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_passkey_challenges: {
        Row: {
          challenge: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          purpose: string
          user_id: string
        }
        Insert: {
          challenge: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          purpose?: string
          user_id: string
        }
        Update: {
          challenge?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          purpose?: string
          user_id?: string
        }
        Relationships: []
      }
      user_passkeys: {
        Row: {
          backed_up: boolean
          counter: number
          created_at: string
          credential_id: string
          device_type: string | null
          id: string
          last_used_at: string | null
          nickname: string | null
          public_key: string
          transports: string[]
          user_id: string
        }
        Insert: {
          backed_up?: boolean
          counter?: number
          created_at?: string
          credential_id: string
          device_type?: string | null
          id?: string
          last_used_at?: string | null
          nickname?: string | null
          public_key: string
          transports?: string[]
          user_id: string
        }
        Update: {
          backed_up?: boolean
          counter?: number
          created_at?: string
          credential_id?: string
          device_type?: string | null
          id?: string
          last_used_at?: string | null
          nickname?: string | null
          public_key?: string
          transports?: string[]
          user_id?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          created_at: string
          id: string
          permissions: Json
          updated_at: string
          updated_by: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permissions?: Json
          updated_at?: string
          updated_by?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permissions?: Json
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          browser: string | null
          created_at: string
          current_path: string | null
          device_key: string
          device_type: string | null
          id: string
          ip_address: string | null
          last_seen_at: string
          os: string | null
          revoked_at: string | null
          started_at: string
          updated_at: string
          user_agent: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          browser?: string | null
          created_at?: string
          current_path?: string | null
          device_key: string
          device_type?: string | null
          id?: string
          ip_address?: string | null
          last_seen_at?: string
          os?: string | null
          revoked_at?: string | null
          started_at?: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          browser?: string | null
          created_at?: string
          current_path?: string | null
          device_key?: string
          device_type?: string | null
          id?: string
          ip_address?: string | null
          last_seen_at?: string
          os?: string | null
          revoked_at?: string | null
          started_at?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          created_at: string
          event_id: string | null
          event_type: string | null
          id: string
          payload: Json
          processed_at: string | null
          processing_error: string | null
          provider: string
          received_at: string
          signature_ok: boolean
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          event_type?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          provider: string
          received_at?: string
          signature_ok?: boolean
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string | null
          event_type?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          provider?: string
          received_at?: string
          signature_ok?: boolean
          workspace_id?: string | null
        }
        Relationships: []
      }
      whatsapp_call_events: {
        Row: {
          created_at: string
          direction: string | null
          duration_seconds: number | null
          ended_at: string | null
          external_id: string | null
          from_number: string | null
          id: string
          lead_id: string | null
          phone_normalized: string | null
          raw: Json
          session_id: string | null
          started_at: string | null
          status: string | null
          to_number: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          direction?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          external_id?: string | null
          from_number?: string | null
          id?: string
          lead_id?: string | null
          phone_normalized?: string | null
          raw?: Json
          session_id?: string | null
          started_at?: string | null
          status?: string | null
          to_number?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          direction?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          external_id?: string | null
          from_number?: string | null
          id?: string
          lead_id?: string | null
          phone_normalized?: string | null
          raw?: Json
          session_id?: string | null
          started_at?: string | null
          status?: string | null
          to_number?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_call_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_web_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_call_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_call_settings: {
        Row: {
          auto_reply_message: string | null
          auto_reply_missed: boolean
          create_lead_on_missed: boolean
          enabled: boolean
          last_sync_at: string | null
          lead_pipeline_id: string | null
          lead_stage_id: string | null
          lead_tag: string | null
          min_duration_seconds: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          auto_reply_message?: string | null
          auto_reply_missed?: boolean
          create_lead_on_missed?: boolean
          enabled?: boolean
          last_sync_at?: string | null
          lead_pipeline_id?: string | null
          lead_stage_id?: string | null
          lead_tag?: string | null
          min_duration_seconds?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          auto_reply_message?: string | null
          auto_reply_missed?: boolean
          create_lead_on_missed?: boolean
          enabled?: boolean
          last_sync_at?: string | null
          lead_pipeline_id?: string | null
          lead_stage_id?: string | null
          lead_tag?: string | null
          min_duration_seconds?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_call_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_groups: {
        Row: {
          active_ai_agent_id: string | null
          active_bot_id: string | null
          created_at: string
          description: string | null
          group_jid: string
          id: string
          invite_code: string | null
          is_admin: boolean
          is_announce: boolean
          last_synced_at: string | null
          metadata: Json
          name: string | null
          participants_count: number
          picture_url: string | null
          rules: Json
          session_id: string
          subject: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          active_ai_agent_id?: string | null
          active_bot_id?: string | null
          created_at?: string
          description?: string | null
          group_jid: string
          id?: string
          invite_code?: string | null
          is_admin?: boolean
          is_announce?: boolean
          last_synced_at?: string | null
          metadata?: Json
          name?: string | null
          participants_count?: number
          picture_url?: string | null
          rules?: Json
          session_id: string
          subject?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          active_ai_agent_id?: string | null
          active_bot_id?: string | null
          created_at?: string
          description?: string | null
          group_jid?: string
          id?: string
          invite_code?: string | null
          is_admin?: boolean
          is_announce?: boolean
          last_synced_at?: string | null
          metadata?: Json
          name?: string | null
          participants_count?: number
          picture_url?: string | null
          rules?: Json
          session_id?: string
          subject?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_groups_active_ai_agent_fk"
            columns: ["active_ai_agent_id"]
            isOneToOne: false
            referencedRelation: "group_ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_groups_active_bot_id_fkey"
            columns: ["active_bot_id"]
            isOneToOne: false
            referencedRelation: "salesbots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_groups_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_web_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_groups_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          shortcut: string | null
          updated_at: string
          variables: string[]
          workspace_id: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          shortcut?: string | null
          updated_at?: string
          variables?: string[]
          workspace_id: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          shortcut?: string | null
          updated_at?: string
          variables?: string[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_web_messages: {
        Row: {
          body: string | null
          created_at: string
          delivery_status: string
          from_me: boolean
          id: string
          media_url: string | null
          message_id: string
          message_type: string
          raw: Json | null
          received_at: string
          remote_jid: string
          sender_name: string | null
          sender_phone: string | null
          session_id: string
          to_jid: string | null
          workspace_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          delivery_status?: string
          from_me?: boolean
          id?: string
          media_url?: string | null
          message_id: string
          message_type?: string
          raw?: Json | null
          received_at?: string
          remote_jid: string
          sender_name?: string | null
          sender_phone?: string | null
          session_id: string
          to_jid?: string | null
          workspace_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          delivery_status?: string
          from_me?: boolean
          id?: string
          media_url?: string | null
          message_id?: string
          message_type?: string
          raw?: Json | null
          received_at?: string
          remote_jid?: string
          sender_name?: string | null
          sender_phone?: string | null
          session_id?: string
          to_jid?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_web_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_web_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_web_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_web_session_auth: {
        Row: {
          creds_encrypted: string | null
          keys_encrypted: string | null
          session_id: string
          updated_at: string
        }
        Insert: {
          creds_encrypted?: string | null
          keys_encrypted?: string | null
          session_id: string
          updated_at?: string
        }
        Update: {
          creds_encrypted?: string | null
          keys_encrypted?: string | null
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_web_session_auth_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_web_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_web_sessions: {
        Row: {
          client_token_encrypted: string | null
          created_at: string
          id: string
          instance_id: string | null
          last_connected_at: string | null
          last_disconnected_at: string | null
          last_qr: string | null
          metadata: Json
          phone_number: string | null
          provider: string
          push_name: string | null
          routing_config: Json
          status: string
          token_encrypted: string | null
          updated_at: string
          webhook_secret: string | null
          workspace_id: string
        }
        Insert: {
          client_token_encrypted?: string | null
          created_at?: string
          id?: string
          instance_id?: string | null
          last_connected_at?: string | null
          last_disconnected_at?: string | null
          last_qr?: string | null
          metadata?: Json
          phone_number?: string | null
          provider?: string
          push_name?: string | null
          routing_config?: Json
          status?: string
          token_encrypted?: string | null
          updated_at?: string
          webhook_secret?: string | null
          workspace_id: string
        }
        Update: {
          client_token_encrypted?: string | null
          created_at?: string
          id?: string
          instance_id?: string | null
          last_connected_at?: string | null
          last_disconnected_at?: string | null
          last_qr?: string | null
          metadata?: Json
          phone_number?: string | null
          provider?: string
          push_name?: string | null
          routing_config?: Json
          status?: string
          token_encrypted?: string | null
          updated_at?: string
          webhook_secret?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_web_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_automation_runs: {
        Row: {
          actions_summary: Json
          automation_id: string
          created_at: string
          error: string | null
          id: string
          pipeline_id: string
          status: string
          task_id: string | null
          trigger_event: string
          workspace_id: string
        }
        Insert: {
          actions_summary?: Json
          automation_id: string
          created_at?: string
          error?: string | null
          id?: string
          pipeline_id: string
          status?: string
          task_id?: string | null
          trigger_event: string
          workspace_id: string
        }
        Update: {
          actions_summary?: Json
          automation_id?: string
          created_at?: string
          error?: string | null
          id?: string
          pipeline_id?: string
          status?: string
          task_id?: string | null
          trigger_event?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_automation_runs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "workflow_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_automation_runs_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "workflow_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_automation_runs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "workflow_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_automation_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_automations: {
        Row: {
          actions: Json
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          name: string
          pipeline_id: string
          trigger: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          actions?: Json
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          name: string
          pipeline_id: string
          trigger?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          actions?: Json
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          name?: string
          pipeline_id?: string
          trigger?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_automations_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "workflow_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_automations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_employee_of_month: {
        Row: {
          coins: number
          created_at: string
          delivered_at: string | null
          id: string
          kpi_snapshot: Json
          month: string
          points: number
          reviews_approved: number
          reward_delivered: boolean
          reward_id: string | null
          sector_id: string | null
          share_card_url: string | null
          tasks_completed: number
          tasks_late: number
          tasks_on_time: number
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          coins?: number
          created_at?: string
          delivered_at?: string | null
          id?: string
          kpi_snapshot?: Json
          month: string
          points?: number
          reviews_approved?: number
          reward_delivered?: boolean
          reward_id?: string | null
          sector_id?: string | null
          share_card_url?: string | null
          tasks_completed?: number
          tasks_late?: number
          tasks_on_time?: number
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          coins?: number
          created_at?: string
          delivered_at?: string | null
          id?: string
          kpi_snapshot?: Json
          month?: string
          points?: number
          reviews_approved?: number
          reward_delivered?: boolean
          reward_id?: string | null
          sector_id?: string | null
          share_card_url?: string | null
          tasks_completed?: number
          tasks_late?: number
          tasks_on_time?: number
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_employee_of_month_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "workflow_gamification_rewards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_employee_of_month_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "workflow_sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_employee_of_month_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_gamification_config: {
        Row: {
          created_at: string
          current_reward_id: string | null
          enabled: boolean
          prize_description: string | null
          prize_image_url: string | null
          prize_title: string | null
          rules: Json
          scope: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          current_reward_id?: string | null
          enabled?: boolean
          prize_description?: string | null
          prize_image_url?: string | null
          prize_title?: string | null
          rules?: Json
          scope?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          current_reward_id?: string | null
          enabled?: boolean
          prize_description?: string | null
          prize_image_url?: string | null
          prize_title?: string | null
          rules?: Json
          scope?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_gamification_config_current_reward_id_fkey"
            columns: ["current_reward_id"]
            isOneToOne: false
            referencedRelation: "workflow_gamification_rewards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_gamification_config_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_gamification_events: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          month: string
          points: number
          reason: string
          sector_id: string | null
          task_id: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          month: string
          points: number
          reason: string
          sector_id?: string | null
          task_id?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          month?: string
          points?: number
          reason?: string
          sector_id?: string | null
          task_id?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_gamification_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_gamification_rewards: {
        Row: {
          active: boolean
          coin_cost: number
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          position: number
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          coin_cost?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          position?: number
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          coin_cost?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          position?: number
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_gamification_rewards_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_gamification_scores: {
        Row: {
          coins: number
          id: string
          month: string
          points: number
          reviews_approved: number
          reviews_returned: number
          sector_id: string | null
          tasks_completed: number
          tasks_incomplete: number
          tasks_late: number
          tasks_on_time: number
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          coins?: number
          id?: string
          month: string
          points?: number
          reviews_approved?: number
          reviews_returned?: number
          sector_id?: string | null
          tasks_completed?: number
          tasks_incomplete?: number
          tasks_late?: number
          tasks_on_time?: number
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          coins?: number
          id?: string
          month?: string
          points?: number
          reviews_approved?: number
          reviews_returned?: number
          sector_id?: string | null
          tasks_completed?: number
          tasks_incomplete?: number
          tasks_late?: number
          tasks_on_time?: number
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_gamification_scores_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "workflow_sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_gamification_scores_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_gamification_wallets: {
        Row: {
          coins_balance: number
          coins_lifetime: number
          created_at: string
          id: string
          updated_at: string
          user_id: string
          workspace_id: string
          xp_lifetime: number
        }
        Insert: {
          coins_balance?: number
          coins_lifetime?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
          workspace_id: string
          xp_lifetime?: number
        }
        Update: {
          coins_balance?: number
          coins_lifetime?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
          xp_lifetime?: number
        }
        Relationships: [
          {
            foreignKeyName: "workflow_gamification_wallets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_pipelines: {
        Row: {
          color: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          position: number
          sector_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          position?: number
          sector_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          position?: number
          sector_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_pipelines_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "workflow_sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_pipelines_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_sector_members: {
        Row: {
          created_at: string
          id: string
          sector_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          sector_id: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          sector_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_sector_members_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "workflow_sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_sectors: {
        Row: {
          color: string
          created_at: string
          id: string
          manager_id: string | null
          name: string
          position: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          manager_id?: string | null
          name: string
          position?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          manager_id?: string | null
          name?: string
          position?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workflow_stages: {
        Row: {
          color: string
          created_at: string
          id: string
          is_done_stage: boolean
          is_incomplete_stage: boolean
          is_review_stage: boolean
          name: string
          pipeline_id: string
          position: number
          product_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_done_stage?: boolean
          is_incomplete_stage?: boolean
          is_review_stage?: boolean
          name: string
          pipeline_id: string
          position?: number
          product_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_done_stage?: boolean
          is_incomplete_stage?: boolean
          is_review_stage?: boolean
          name?: string
          pipeline_id?: string
          position?: number
          product_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "workflow_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_stages_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_stages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_task_attachments: {
        Row: {
          created_at: string
          file_name: string
          id: string
          mime: string | null
          size_bytes: number | null
          storage_path: string
          task_id: string
          uploaded_by: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          mime?: string | null
          size_bytes?: number | null
          storage_path: string
          task_id: string
          uploaded_by: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          mime?: string | null
          size_bytes?: number | null
          storage_path?: string
          task_id?: string
          uploaded_by?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "workflow_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_task_attachments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_task_checklist: {
        Row: {
          created_at: string
          done: boolean
          id: string
          position: number
          task_id: string
          text: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          id?: string
          position?: number
          task_id: string
          text: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          done?: boolean
          id?: string
          position?: number
          task_id?: string
          text?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_task_checklist_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "workflow_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_task_checklist_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_task_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          task_id: string
          workspace_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          task_id: string
          workspace_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          task_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "workflow_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_task_comments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_tasks: {
        Row: {
          assignee_id: string | null
          automation_state: Json
          completed_at: string | null
          created_at: string
          created_by: string
          credentials: Json
          description: string | null
          due_at: string | null
          estimated_seconds: number | null
          id: string
          incomplete_reason: string | null
          is_review_copy: boolean
          links: Json
          parent_task_id: string | null
          pipeline_id: string
          position: number
          priority: string
          review_copy_of: string | null
          review_notes: string | null
          review_outcome: string | null
          review_round: number
          review_status: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          stage_id: string
          status: string
          submitted_for_review_at: string | null
          tags: Json
          time_spent_seconds: number
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assignee_id?: string | null
          automation_state?: Json
          completed_at?: string | null
          created_at?: string
          created_by: string
          credentials?: Json
          description?: string | null
          due_at?: string | null
          estimated_seconds?: number | null
          id?: string
          incomplete_reason?: string | null
          is_review_copy?: boolean
          links?: Json
          parent_task_id?: string | null
          pipeline_id: string
          position?: number
          priority?: string
          review_copy_of?: string | null
          review_notes?: string | null
          review_outcome?: string | null
          review_round?: number
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          stage_id: string
          status?: string
          submitted_for_review_at?: string | null
          tags?: Json
          time_spent_seconds?: number
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assignee_id?: string | null
          automation_state?: Json
          completed_at?: string | null
          created_at?: string
          created_by?: string
          credentials?: Json
          description?: string | null
          due_at?: string | null
          estimated_seconds?: number | null
          id?: string
          incomplete_reason?: string | null
          is_review_copy?: boolean
          links?: Json
          parent_task_id?: string | null
          pipeline_id?: string
          position?: number
          priority?: string
          review_copy_of?: string | null
          review_notes?: string | null
          review_outcome?: string | null
          review_round?: number
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          stage_id?: string
          status?: string
          submitted_for_review_at?: string | null
          tags?: Json
          time_spent_seconds?: number
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "workflow_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_tasks_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "workflow_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_tasks_review_copy_of_fkey"
            columns: ["review_copy_of"]
            isOneToOne: false
            referencedRelation: "workflow_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_tasks_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "workflow_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_time_sessions: {
        Row: {
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          started_at: string
          task_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          started_at?: string
          task_id: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          started_at?: string
          task_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_time_sessions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "workflow_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_time_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          is_partner: boolean
          modules: string[]
          role_type: string
          status: string
          token: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          is_partner?: boolean
          modules?: string[]
          role_type?: string
          status?: string
          token?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          is_partner?: boolean
          modules?: string[]
          role_type?: string
          status?: string
          token?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          is_partner: boolean
          role: string
          role_type: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_partner?: boolean
          role?: string
          role_type?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_partner?: boolean
          role?: string
          role_type?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_onboarding_steps: {
        Row: {
          completed_at: string
          completed_by: string
          step_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string
          completed_by: string
          step_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          completed_at?: string
          completed_by?: string
          step_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_onboarding_steps_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_security_settings: {
        Row: {
          allowed_ips: string[]
          block_leaked_passwords: boolean
          confirm_bulk_export: boolean
          created_at: string
          device_approval: boolean
          ip_allowlist_desktop_only: boolean
          ip_allowlist_enabled: boolean
          login_alerts: boolean
          require_team_2fa: boolean
          turnstile_enabled: boolean
          updated_at: string
          workspace_id: string
        }
        Insert: {
          allowed_ips?: string[]
          block_leaked_passwords?: boolean
          confirm_bulk_export?: boolean
          created_at?: string
          device_approval?: boolean
          ip_allowlist_desktop_only?: boolean
          ip_allowlist_enabled?: boolean
          login_alerts?: boolean
          require_team_2fa?: boolean
          turnstile_enabled?: boolean
          updated_at?: string
          workspace_id: string
        }
        Update: {
          allowed_ips?: string[]
          block_leaked_passwords?: boolean
          confirm_bulk_export?: boolean
          created_at?: string
          device_approval?: boolean
          ip_allowlist_desktop_only?: boolean
          ip_allowlist_enabled?: boolean
          login_alerts?: boolean
          require_team_2fa?: boolean
          turnstile_enabled?: boolean
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_security_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_storage_addons: {
        Row: {
          addon_code: string
          canceled_at: string | null
          created_at: string
          created_by: string | null
          extra_gb: number
          id: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          addon_code: string
          canceled_at?: string | null
          created_at?: string
          created_by?: string | null
          extra_gb: number
          id?: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          addon_code?: string
          canceled_at?: string | null
          created_at?: string
          created_by?: string | null
          extra_gb?: number
          id?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_storage_addons_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_storage_files: {
        Row: {
          bucket: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          file_name: string
          id: string
          kind: string
          mime: string | null
          size_bytes: number
          source: string
          storage_path: string
          workspace_id: string
        }
        Insert: {
          bucket?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          file_name: string
          id?: string
          kind?: string
          mime?: string | null
          size_bytes?: number
          source?: string
          storage_path: string
          workspace_id: string
        }
        Update: {
          bucket?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          file_name?: string
          id?: string
          kind?: string
          mime?: string | null
          size_bytes?: number
          source?: string
          storage_path?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_storage_files_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          address_city: string | null
          address_complement: string | null
          address_country: string | null
          address_district: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          business_hours: Json
          cnpj: string | null
          contact_email: string | null
          created_at: string
          default_currency: string
          description: string | null
          feature_flags: Json
          id: string
          industry: string | null
          instagram_handle: string | null
          legal_name: string | null
          legal_representative: string | null
          logo_path: string | null
          name: string
          owner_id: string
          phone: string | null
          site_url: string | null
          slug: string
          updated_at: string
          workflow_review_mode: string
        }
        Insert: {
          address_city?: string | null
          address_complement?: string | null
          address_country?: string | null
          address_district?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          business_hours?: Json
          cnpj?: string | null
          contact_email?: string | null
          created_at?: string
          default_currency?: string
          description?: string | null
          feature_flags?: Json
          id?: string
          industry?: string | null
          instagram_handle?: string | null
          legal_name?: string | null
          legal_representative?: string | null
          logo_path?: string | null
          name: string
          owner_id: string
          phone?: string | null
          site_url?: string | null
          slug: string
          updated_at?: string
          workflow_review_mode?: string
        }
        Update: {
          address_city?: string | null
          address_complement?: string | null
          address_country?: string | null
          address_district?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          business_hours?: Json
          cnpj?: string | null
          contact_email?: string | null
          created_at?: string
          default_currency?: string
          description?: string | null
          feature_flags?: Json
          id?: string
          industry?: string | null
          instagram_handle?: string | null
          legal_name?: string | null
          legal_representative?: string | null
          logo_path?: string | null
          name?: string
          owner_id?: string
          phone?: string | null
          site_url?: string | null
          slug?: string
          updated_at?: string
          workflow_review_mode?: string
        }
        Relationships: []
      }
      zapsign_signature_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          document_token: string | null
          id: string
          last_error: string | null
          signed_file_id: string | null
          signer_email: string
          signer_name: string
          signer_token: string | null
          source_file_id: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          document_token?: string | null
          id?: string
          last_error?: string | null
          signed_file_id?: string | null
          signer_email: string
          signer_name: string
          signer_token?: string | null
          source_file_id: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          document_token?: string | null
          id?: string
          last_error?: string | null
          signed_file_id?: string | null
          signer_email?: string
          signer_name?: string
          signer_token?: string | null
          source_file_id?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zapsign_signature_requests_signed_file_id_fkey"
            columns: ["signed_file_id"]
            isOneToOne: false
            referencedRelation: "workspace_storage_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zapsign_signature_requests_source_file_id_fkey"
            columns: ["source_file_id"]
            isOneToOne: false
            referencedRelation: "workspace_storage_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zapsign_signature_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      zapsign_webhook_events: {
        Row: {
          document_token: string | null
          event_key: string
          event_name: string | null
          id: string
          payload: Json
          processed_at: string | null
          processing_started_at: string | null
          received_at: string
        }
        Insert: {
          document_token?: string | null
          event_key: string
          event_name?: string | null
          id?: string
          payload: Json
          processed_at?: string | null
          processing_started_at?: string | null
          received_at?: string
        }
        Update: {
          document_token?: string | null
          event_key?: string
          event_name?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          processing_started_at?: string | null
          received_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      financial_history: {
        Row: {
          amount_cents: number | null
          coupon_code: string | null
          created_at: string | null
          discount_cents: number | null
          id: string | null
          method: string | null
          paid_at: string | null
          period: string | null
          plan_code: string | null
          plan_name: string | null
          status: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_modules: {
        Row: {
          modules: string[] | null
          plan_code: string | null
          plan_name: string | null
          status: string | null
          trial_ends_at: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: Json }
      can_admin_workspace: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      can_manage_workflow: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      can_send_workspace_email: {
        Args: { _email: string; _workspace_id: string }
        Returns: boolean
      }
      can_view_workflow_pipeline: {
        Args: { _pipeline_id: string; _user_id: string }
        Returns: boolean
      }
      claim_crm_form_booking: {
        Args: {
          _client_hash: string
          _form_id: string
          _max_bookings?: number
          _window_seconds?: number
          _workspace_id: string
        }
        Returns: boolean
      }
      claim_crm_form_ingest_idempotency_v1: {
        Args: {
          p_form_id: string
          p_idempotency_key: string
          p_request_hash: string
        }
        Returns: {
          cached_response: Json
          cached_status: number
          disposition: string
          request_id: string
        }[]
      }
      claim_crm_form_upload: {
        Args: {
          _bytes: number
          _client_hash: string
          _form_id: string
          _max_bytes?: number
          _max_files?: number
          _window_seconds?: number
          _workspace_id: string
        }
        Returns: boolean
      }
      complete_crm_form_ingest_idempotency_v1: {
        Args: { p_request_id: string; p_response: Json; p_status: number }
        Returns: boolean
      }
      count_active_whatsapp_sessions: {
        Args: { _workspace_id: string }
        Returns: number
      }
      create_social_post_atomic: {
        Args: {
          _ai_prompt: string
          _ai_provider: string
          _assets: Json
          _briefing: string
          _channels: Json
          _copy: string
          _cta: string
          _hashtags: string[]
          _post_id: string
          _reference_urls: string[]
          _scheduled_at: string
          _status: string
          _targets: Json
          _title: string
          _workspace_id: string
        }
        Returns: string
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      enqueue_social_storage_cleanup: {
        Args: {
          p_bucket?: string
          p_storage_path: string
          p_workspace_id: string
        }
        Returns: string
      }
      expire_trials_and_subs: { Args: never; Returns: undefined }
      f01_company_permission: {
        Args: {
          _action: string
          _responsible_id: string
          _workspace_id: string
        }
        Returns: boolean
      }
      f01_is_valid_cnpj: { Args: { _value: string }; Returns: boolean }
      f01_lead_company_edit_permission: {
        Args: { _lead_responsible_id: string; _workspace_id: string }
        Returns: boolean
      }
      f01_record_crm_form_issuance: {
        Args: {
          _form_id_text: string
          _lead_id: string
          _source_context?: Json
          _source_event_key: string
          _source_kind: string
          _workspace_id: string
        }
        Returns: undefined
      }
      f06_admin_coupon_stats: {
        Args: { _coupon_ids?: string[] }
        Returns: {
          coupon_id: string
          customers: number
          revenue_cents: number
          uses: number
        }[]
      }
      f06_admin_financial_summary: { Args: never; Returns: Json }
      f06_admin_signup_crm_links: {
        Args: { _profile_ids: string[] }
        Returns: {
          crm_source_id: string
          crm_source_name: string
          crm_source_provider: string
          lead_id: string
          profile_id: string
          synced_at: string
          workspace_id: string
        }[]
      }
      f06_delete_admin_coupon: {
        Args: { _coupon_code?: string; _coupon_id: string }
        Returns: boolean
      }
      f06_delete_note_group: {
        Args: { _delete_notes?: boolean; _group_id: string }
        Returns: boolean
      }
      f06_note_group_counts: {
        Args: never
        Returns: {
          group_id: string
          note_count: number
        }[]
      }
      f06_save_admin_coupon: { Args: { _payload: Json }; Returns: string }
      f06_save_internal_campaign: { Args: { _payload: Json }; Returns: string }
      fail_crm_form_ingest_idempotency_v1: {
        Args: {
          p_error: string
          p_request_id: string
          p_response: Json
          p_status: number
        }
        Returns: boolean
      }
      generate_workspace_slug: { Args: { _base: string }; Returns: string }
      get_evolution_credentials: {
        Args: { _key: string; _session_id: string }
        Returns: Json
      }
      get_evolution_credentials_service: {
        Args: { _key: string; _session_id: string }
        Returns: Json
      }
      get_evolution_session_by_secret: {
        Args: { _key: string; _webhook_secret: string }
        Returns: Json
      }
      get_integration_secret: {
        Args: { _key: string; _provider: string; _workspace_id: string }
        Returns: Json
      }
      get_integration_secret_service: {
        Args: { _key: string; _provider: string; _workspace_id: string }
        Returns: Json
      }
      get_meta_page_token:
        | { Args: { _key: string; _page_id: string }; Returns: string }
        | {
            Args: { _key: string; _page_id: string; _workspace_id: string }
            Returns: string
          }
      get_workspace_default_currency: {
        Args: { _workspace_id: string }
        Returns: string
      }
      get_zapi_credentials: {
        Args: { _key: string; _session_id: string }
        Returns: Json
      }
      get_zapi_session_by_secret: {
        Args: { _key: string; _webhook_secret: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_valid_cpf: { Args: { _cpf: string }; Returns: boolean }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      isnumeric_or_empty: { Args: { _t: string }; Returns: boolean }
      list_workspace_users: {
        Args: { _workspace_id: string }
        Returns: {
          email: string
          id: string
          name: string
        }[]
      }
      mark_integration_needs_reconnect: {
        Args: { _error: string; _provider: string; _workspace_id: string }
        Returns: undefined
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      partner_program_admin_dashboard: { Args: never; Returns: Json }
      partner_program_assign_sandbox: {
        Args: {
          p_partner_user_id: string
          p_reason?: string
          p_workspace_id: string
        }
        Returns: string
      }
      partner_program_attach_partner_technical_access: {
        Args: {
          p_partner_user_id: string
          p_reason?: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      partner_program_build_referral_code: {
        Args: { _preferred?: string; _user_id: string }
        Returns: string
      }
      partner_program_claim_attribution: {
        Args: {
          _client_workspace_id?: string
          _signup_user_id: string
          _visitor_token: string
        }
        Returns: Json
      }
      partner_program_complete_academy_lesson: {
        Args: { p_lesson_id: string }
        Returns: Json
      }
      partner_program_correct_attribution: {
        Args: {
          _attribution_id: string
          _new_referrer_user_id: string
          _reason: string
        }
        Returns: Json
      }
      partner_program_create_community_comment: {
        Args: { p_body: string; p_post_id: string; p_role: string }
        Returns: string
      }
      partner_program_create_community_post: {
        Args: { p_audience: string; p_body: string; p_role: string }
        Returns: string
      }
      partner_program_disable_sandbox: {
        Args: { p_reason: string; p_sandbox_id: string }
        Returns: undefined
      }
      partner_program_ensure_referral_code: {
        Args: { p_role: string; p_user_id: string }
        Returns: string
      }
      partner_program_is_admin: {
        Args: { _user_id?: string }
        Returns: boolean
      }
      partner_program_is_approved_partner: {
        Args: { p_user_id?: string }
        Returns: boolean
      }
      partner_program_is_email_confirmed: {
        Args: { _user_id?: string }
        Returns: boolean
      }
      partner_program_join_community: {
        Args: { p_role: string }
        Returns: string
      }
      partner_program_link_customer: {
        Args: {
          p_effective_from: string
          p_partner_user_id: string
          p_reason?: string
          p_workspace_id: string
        }
        Returns: string
      }
      partner_program_moderate_community_content: {
        Args: {
          p_entity: string
          p_id: string
          p_reason: string
          p_status: string
        }
        Returns: undefined
      }
      partner_program_my_academy_progress: { Args: never; Returns: Json }
      partner_program_my_affiliate_dashboard: { Args: never; Returns: Json }
      partner_program_my_identity: { Args: never; Returns: Json }
      partner_program_my_partner_dashboard: { Args: never; Returns: Json }
      partner_program_my_payment_profile: { Args: never; Returns: Json }
      partner_program_normalize_referral_code: {
        Args: { _value: string }
        Returns: string
      }
      partner_program_record_commission: {
        Args: {
          p_gross_amount_cents: number
          p_is_initial?: boolean
          p_metadata?: Json
          p_source_id: string
          p_source_occurred_at: string
          p_source_type: string
          p_workspace_id: string
        }
        Returns: string
      }
      partner_program_request_payout: { Args: never; Returns: string }
      partner_program_request_role: { Args: { _role: string }; Returns: Json }
      partner_program_resolve_commission_rate: {
        Args: {
          p_at: string
          p_kind: string
          p_role: string
          p_user_id: string
        }
        Returns: number
      }
      partner_program_reverse_commission: {
        Args: { p_ledger_id: string; p_reason: string }
        Returns: string
      }
      partner_program_set_commission_override: {
        Args: {
          p_effective_from: string
          p_kind: string
          p_rate_bps: number
          p_reason?: string
          p_role: string
          p_user_id: string
        }
        Returns: string
      }
      partner_program_set_payment_profile_service: {
        Args: {
          p_document: string
          p_document_type: string
          p_encryption_key: string
          p_holder_name: string
          p_pix_key: string
          p_pix_key_type: string
          p_user_id: string
        }
        Returns: string
      }
      partner_program_set_payout_status: {
        Args: {
          p_payment_reference?: string
          p_payout_id: string
          p_proof_reference?: string
          p_reason?: string
          p_status: string
        }
        Returns: undefined
      }
      partner_program_set_role_status: {
        Args: {
          _reason?: string
          _role: string
          _status: string
          _user_id: string
        }
        Returns: Json
      }
      partner_program_verify_payment_profile: {
        Args: { p_reason: string; p_user_id: string; p_verified: boolean }
        Returns: undefined
      }
      partner_program_write_audit: {
        Args: {
          _action: string
          _after?: Json
          _before?: Json
          _entity_id: string
          _entity_type: string
          _reason?: string
          _subject_user_id: string
        }
        Returns: string
      }
      preview_invitation: { Args: { p_token: string }; Returns: Json }
      purge_old_conversation_files: { Args: never; Returns: undefined }
      purge_old_raw_payloads: { Args: never; Returns: undefined }
      purge_old_user_sessions: { Args: never; Returns: undefined }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      refresh_meta_integration_token: {
        Args: {
          _expires_at: string
          _key: string
          _new_plaintext: Json
          _workspace_id: string
        }
        Returns: undefined
      }
      replace_crm_stage_automations: {
        Args: { _automations: Json; _pipeline_id: string }
        Returns: number
      }
      salesbot_batch_decrement: {
        Args: {
          p_next_block_id: string
          p_run_id: string
          p_sender_name: string
          p_sender_phone: string
          p_text: string
        }
        Returns: Json
      }
      salesbot_rr_next: {
        Args: { _block_id: string; _size: number }
        Returns: number
      }
      set_default_social_brand: {
        Args: { _brand_id: string; _workspace_id: string }
        Returns: undefined
      }
      set_evolution_credentials:
        | {
            Args: {
              _api_key: string
              _instance_name: string
              _key: string
              _workspace_id: string
            }
            Returns: string
          }
        | {
            Args: {
              _api_key: string
              _instance_name: string
              _key: string
              _webhook_secret: string
              _workspace_id: string
            }
            Returns: string
          }
      set_integration_secret: {
        Args: {
          _key: string
          _metadata?: Json
          _plaintext: Json
          _provider: string
          _status?: string
          _workspace_id: string
        }
        Returns: undefined
      }
      set_integration_secret_service: {
        Args: {
          _key: string
          _metadata?: Json
          _plaintext: Json
          _provider: string
          _status?: string
          _workspace_id: string
        }
        Returns: undefined
      }
      set_workspace_default_currency: {
        Args: { _currency: string; _workspace_id: string }
        Returns: string
      }
      set_zapi_credentials: {
        Args: {
          _client_token: string
          _instance_id: string
          _key: string
          _token: string
          _workspace_id: string
        }
        Returns: string
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      social_storage_path_is_referenced: {
        Args: { p_storage_path: string; p_workspace_id: string }
        Returns: boolean
      }
      tracked_link_register_click: {
        Args: { _link_id: string }
        Returns: undefined
      }
      tracking_classify_host: { Args: { _url: string }; Returns: string }
      tracking_overview: {
        Args: {
          _days?: number
          _include_internal?: boolean
          _site_id?: string
          _workspace_id: string
        }
        Returns: Json
      }
      update_social_post_atomic: {
        Args: {
          _assets: Json
          _briefing: string
          _copy: string
          _cta: string
          _hashtags: string[]
          _post_id: string
          _scheduled_at: string
          _status: string
          _title: string
          _workspace_id: string
        }
        Returns: string
      }
      whatsapp_number_limit: {
        Args: { _workspace_id: string }
        Returns: number
      }
      workspace_has_module: {
        Args: { _module: string; _ws: string }
        Returns: boolean
      }
      workspace_seat_limit: { Args: { _workspace_id: string }; Returns: number }
    }
    Enums: {
      ai_agent_action_status:
        | "pending"
        | "approved"
        | "rejected"
        | "executed"
        | "failed"
        | "auto_executed"
      ai_agent_mode: "manual" | "semi_auto" | "auto" | "consultor" | "gestor"
      ai_agent_module:
        | "gestor_trafego"
        | "kommo_manager"
        | "salesbot"
        | "inbox"
        | "dashboard"
        | "social_media"
        | "strategist"
        | "support_robot"
      app_role: "super_admin" | "user"
      social_ai_provider:
        | "openai"
        | "gemini"
        | "ideogram"
        | "recraft"
        | "freepik"
      social_channel:
        | "fb_feed"
        | "ig_feed"
        | "ig_story"
        | "ig_reels"
        | "tiktok"
        | "linkedin"
        | "fb_story"
        | "fb_reels"
      social_post_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "scheduled"
        | "publishing"
        | "published"
        | "failed"
        | "rejected"
      task_kind: "tarefa" | "reuniao" | "evento"
      task_status: "pendente" | "concluida" | "cancelada"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ai_agent_action_status: [
        "pending",
        "approved",
        "rejected",
        "executed",
        "failed",
        "auto_executed",
      ],
      ai_agent_mode: ["manual", "semi_auto", "auto", "consultor", "gestor"],
      ai_agent_module: [
        "gestor_trafego",
        "kommo_manager",
        "salesbot",
        "inbox",
        "dashboard",
        "social_media",
        "strategist",
        "support_robot",
      ],
      app_role: ["super_admin", "user"],
      social_ai_provider: [
        "openai",
        "gemini",
        "ideogram",
        "recraft",
        "freepik",
      ],
      social_channel: [
        "fb_feed",
        "ig_feed",
        "ig_story",
        "ig_reels",
        "tiktok",
        "linkedin",
        "fb_story",
        "fb_reels",
      ],
      social_post_status: [
        "draft",
        "pending_approval",
        "approved",
        "scheduled",
        "publishing",
        "published",
        "failed",
        "rejected",
      ],
      task_kind: ["tarefa", "reuniao", "evento"],
      task_status: ["pendente", "concluida", "cancelada"],
    },
  },
} as const

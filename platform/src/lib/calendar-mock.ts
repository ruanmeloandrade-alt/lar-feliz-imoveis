// Tipos do calendário. Sem eventos simulados - serão carregados do banco.

export type CalendarEventKind = "tarefa" | "reuniao" | "evento";

export interface CalendarEvent {
 id: string;
 title: string;
 kind: CalendarEventKind;
 start: string;
 end: string;
 leadId?: string;
 leadName?: string;
 source: "crm" | "manual" | "google";
 externalUrl?: string;
 color?: string;
}

export const CALENDAR_EVENTS: CalendarEvent[] = [];

export const KIND_COLOR: Record<CalendarEventKind, { bg: string; text: string; dot: string }> = {
 tarefa: { bg: "bg-primary/10", text: "text-primary", dot: "bg-primary" },
 reuniao: { bg: "bg-success/10", text: "text-success", dot: "bg-success" },
 evento: { bg: "bg-warning/10", text: "text-warning", dot: "bg-warning" },
};

export const KIND_LABEL: Record<CalendarEventKind, string> = {
 tarefa: "Tarefa",
 reuniao: "Reunião",
 evento: "Evento",
};

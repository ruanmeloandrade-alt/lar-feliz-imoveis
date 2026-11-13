import { useId } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { broadcastLines, MAX_BROADCAST_VARIANTS } from "@/lib/slim-broadcast-rotation";

export function BroadcastRotationFields({ phrases, intervals, setPhrases, setIntervals, disabled }: {
  phrases: string;
  intervals: string;
  setPhrases: (value: string) => void;
  setIntervals: (value: string) => void;
  disabled: boolean;
}) {
  const id = useId();
  const phraseCount = broadcastLines(phrases).length;
  const intervalCount = broadcastLines(intervals).length;

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`${id}-phrases`} className="text-xs">Frases do disparo</Label>
          <span className={phraseCount > MAX_BROADCAST_VARIANTS ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{phraseCount}/50</span>
        </div>
        <Textarea id={`${id}-phrases`} aria-describedby={`${id}-phrase-help`} value={phrases} disabled={disabled} rows={5}
          placeholder="Olá {{nome}}, podemos agendar uma visita?" onChange={event => setPhrases(event.target.value)} />
        <p id={`${id}-phrase-help`} className="text-xs text-muted-foreground">Uma frase por linha. Cada contato recebe a próxima frase da lista. Depois da última, a primeira volta. Use {"{{nome}}"} ou {"{{email}}"} para personalizar.</p>
      </div>
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`${id}-intervals`} className="text-xs">Intervalos entre envios (segundos)</Label>
          <span className={intervalCount > MAX_BROADCAST_VARIANTS ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{intervalCount}/50</span>
        </div>
        <Textarea id={`${id}-intervals`} aria-describedby={`${id}-interval-help`} value={intervals} disabled={disabled} rows={3}
          placeholder={"1,5\n3\n5"} onChange={event => setIntervals(event.target.value)} />
        <p id={`${id}-interval-help`} className="text-xs text-muted-foreground">Um intervalo de 0,5 a 15 segundos por linha. A sequência se repete após o último intervalo.</p>
      </div>
    </div>
  );
}

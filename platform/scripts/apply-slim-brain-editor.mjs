import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const file = fileURLToPath(new URL('../src/routes/crm.agente-ia.tsx', import.meta.url));
let text = fs.readFileSync(file, 'utf8');
if (!text.includes('BrainSourceActions')) {
  const replacements = [
    ['import { BrainCircuit,', 'import { BrainSourceActions, BrainBlockedTermEditor } from "@/components/crm/BrainSourceEditors";\nimport { BrainCircuit,'],
    ['  enabled: boolean;', '  enabled: boolean;\n  updated_at: string;'],
    ['.select("id,title,source_type,content,url,file_name,storage_path,enabled")', '.select("id,title,source_type,content,url,file_name,storage_path,enabled,updated_at")'],
    ['<span>{item.term}</span><button', '<span className="min-w-0 flex-1 break-words">{item.term}</span><BrainBlockedTermEditor item={item} workspaceId={workspaceId} onSaved={() => reload(workspaceId!)} /><button'],
    ['            <button type="button" onClick={() => toggle(source)}', '            <BrainSourceActions source={source} workspaceId={workspaceId} onSaved={() => reload(workspaceId!)} />\n            <button type="button" onClick={() => toggle(source)}'],
    ['<strong className="block truncate text-sm">{source.title}</strong>', '<strong className="block break-words text-sm">{source.title}</strong><p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">{source.content || source.url || source.file_name || "Sem conteúdo complementar"}</p>'],
  ];
  for (const [from, to] of replacements) {
    if (!text.includes(from)) throw new Error('Brain editor integration anchor missing: ' + from.slice(0, 80));
    text = text.replace(from, to);
  }
  text = text.replace('<h2 className="mb-2 font-semibold">Palavras proibidas</h2>', '<h2 className="mb-2 font-semibold">Palavras proibidas</h2>{error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}');
  fs.writeFileSync(file, text);
}
console.log('Saúde Slim: source viewer/editor and blocked-term editor integrated.');

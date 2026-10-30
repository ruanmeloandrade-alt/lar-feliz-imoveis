export function selectCreatedIdeas<T extends { id: string }>(ideas: T[], ideaIds: string[]): T[] {
  if (!ideaIds.length) return [];
  const byId = new Map(ideas.map((idea) => [idea.id, idea] as const));
  return ideaIds.map((id) => byId.get(id)).filter((idea): idea is T => Boolean(idea));
}

export function generationStatusLabel(created: number, imaging: number): string {
  if (imaging > 0) return `Gerando artes de ${imaging} ideia${imaging === 1 ? "" : "s"} em segundo plano…`;
  if (created > 0) return `${created} ideia${created === 1 ? "" : "s"} criada${created === 1 ? "" : "s"} nesta geração.`;
  return "";
}

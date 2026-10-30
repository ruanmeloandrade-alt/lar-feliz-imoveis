// PDF textual simples para relatórios do Gestor de Tráfego.
// Server-only e sem dependência externa: gera um PDF válido com Helvetica,
// paginação automática e conteúdo derivado do mesmo texto já enviado no WhatsApp/e-mail.

function escapePdfText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    // Fonte Helvetica base não cobre emojis; removemos apenas símbolos fora do BMP/ASCII latino.
    .replace(/[\uD800-\uDFFF]/g, "")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function wrapLine(input: string, width = 92): string[] {
  const line = input.replace(/\s+/g, " ").trim();
  if (!line) return [""];
  const words = line.split(" ");
  const out: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      out.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) out.push(current);
  return out;
}

function textLines(text: string) {
  return text
    .replace(/\*/g, "")
    .split(/\r?\n/)
    .flatMap((line) => wrapLine(line));
}

export function renderTrafficReportPdf(input: {
  title: string;
  text: string;
  generatedAt?: Date;
}): Uint8Array {
  const generatedAt = input.generatedAt ?? new Date();
  const lines = [
    input.title,
    `Gerado em ${generatedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
    "",
    ...textLines(input.text),
  ];

  const pageSize = 48;
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += pageSize) pages.push(lines.slice(i, i + pageSize));
  if (!pages.length) pages.push([input.title]);

  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const contentIds: number[] = [];
  for (const page of pages) {
    const commands = ["BT", "/F1 10 Tf", "44 790 Td", "13 TL"];
    page.forEach((line, index) => {
      if (index > 0) commands.push("T*");
      commands.push(`(${escapePdfText(line)}) Tj`);
    });
    commands.push("ET");
    const stream = commands.join("\n");
    contentIds.push(add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`));
  }

  // Reserva o objeto Pages antes dos Page objects para resolver o parent de forma estável.
  const pagesId = add("__PAGES__");
  const pageIds = contentIds.map((contentId) => add(
    `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
  ));
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let pdf = "%PDF-1.4\n%MKTOn\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}

export function reportPdfBase64(input: { title: string; text: string; generatedAt?: Date }) {
  return Buffer.from(renderTrafficReportPdf(input)).toString("base64");
}

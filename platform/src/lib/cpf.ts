export function onlyDigits(v: string): string {
  return (v || "").replace(/\D/g, "");
}

export function formatCPF(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function formatPhone(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d{0,4})(\d{0,4}).*/, (_, a, b, c) =>
      [a && `(${a})`, b && ` ${b}`, c && `-${c}`].filter(Boolean).join(""),
    );
  }
  return d.replace(/(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3");
}

export function isValidCPF(input: string): boolean {
  const cpf = onlyDigits(input);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const digits = cpf.split("").map(Number);
  let s1 = 0;
  for (let i = 0; i < 9; i++) s1 += digits[i] * (10 - i);
  let d1 = (s1 * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== digits[9]) return false;
  let s2 = 0;
  for (let i = 0; i < 10; i++) s2 += digits[i] * (11 - i);
  let d2 = (s2 * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === digits[10];
}

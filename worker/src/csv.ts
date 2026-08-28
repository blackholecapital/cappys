export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field.trim()); field = ""; }
    else if (char === "\n") { row.push(field.trim()); if (row.some(Boolean)) rows.push(row); row = []; field = ""; }
    else if (char !== "\r") field += char;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function columnMap(headers: string[]): Map<string, number> {
  return new Map(headers.map((header, index) => [header.toLowerCase().replace(/[^a-z0-9]/g, ""), index]));
}

export function value(row: string[], map: Map<string, number>, ...names: string[]): string {
  for (const name of names) {
    const index = map.get(name.toLowerCase().replace(/[^a-z0-9]/g, ""));
    if (index !== undefined) return row[index]?.trim() || "";
  }
  return "";
}

export function cents(raw: string): number {
  const parsed = Number(raw.replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
}


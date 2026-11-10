// Gera CSV compatível com Excel em português: separador ";", UTF-8 com BOM e quebra de linha CRLF.
const needsQuote = /[;"\r\n]/;

function cell(value) {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : String(value);
  // Proteção contra "CSV injection": células iniciadas por = + - @ seriam executadas como fórmula no Excel
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return needsQuote.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** columns: [{ key, header }] */
export function toCsv(rows, columns) {
  const head = columns.map((c) => cell(c.header)).join(';');
  const body = rows.map((r) => columns.map((c) => cell(typeof c.key === 'function' ? c.key(r) : r[c.key])).join(';'));
  return `\uFEFF${[head, ...body].join('\r\n')}\r\n`;
}

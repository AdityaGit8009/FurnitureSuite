function csvCell(value) {
  let text = value == null ? "" : String(value);
  const trimmed = text.trimStart();
  const plainNumber = /^-?\d+(?:\.\d+)?$/.test(trimmed);
  if ((/^[=+@-]/.test(trimmed) && !plainNumber) || /^[\t\r\n]/.test(text)) {
    text = "'" + text;
  }
  return '"' + text.replaceAll('"', '""') + '"';
}

export function tableCsv(headers, rows) {
  return "\uFEFF" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function downloadTableCsv(label, headers, rows) {
  const blob = new Blob([tableCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = (label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "records") + ".csv";
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser time to consume the download before releasing its object URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

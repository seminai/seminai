export interface ExportParams {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly filename: string;
}

function toCsv({ headers, rows }: ExportParams): string {
  const escape = (v: string) =>
    v.includes(',') || v.includes('"') || v.includes('\n')
      ? `"${v.replace(/"/g, '""')}"`
      : v;

  const lines = [
    headers.map(escape).join(','),
    ...rows.map((row) => row.map(escape).join(',')),
  ];
  return lines.join('\n');
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob(['\uFEFF' + content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportCsv(params: ExportParams) {
  const csv = toCsv(params);
  downloadBlob(csv, `${params.filename}.csv`, 'text/csv');
}

export function exportExcel(params: ExportParams) {
  const xmlRows = params.rows
    .map(
      (row) =>
        '<Row>' +
        row.map((cell) => `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`).join('') +
        '</Row>',
    )
    .join('\n');

  const xmlHeaders =
    '<Row>' +
    params.headers
      .map((h) => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`)
      .join('') +
    '</Row>';

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Export">
<Table>
${xmlHeaders}
${xmlRows}
</Table>
</Worksheet>
</Workbook>`;

  downloadBlob(xml, `${params.filename}.xls`, 'application/vnd.ms-excel');
}

export function exportPdf(params: ExportParams) {
  const style = `
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
      th { background: #f5f5f5; font-weight: 600; }
      @media print { body { margin: 0; } }
    </style>`;

  const headerRow = params.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const bodyRows = params.rows
    .map(
      (row) =>
        '<tr>' + row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('') + '</tr>',
    )
    .join('\n');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">${style}</head><body>
<table><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table>
</body></html>`;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.print();
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

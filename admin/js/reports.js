/* ==========================================================================
   JOLARDO ADMIN — reports.js
   Powers reports.html: builds a report over a date range (day/week/month/
   year/custom) from income + expenses, renders a table + summary, and
   exports to CSV, Excel (.xls via HTML table trick), and PDF (print dialog).
   ========================================================================== */

(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", async () => {
    const profile = await JolardoAdmin.guard();
    if (!profile) return;
    initReportsPage();
  });

  function fmtDate(d) { return d.toISOString().slice(0, 10); }

  function rangeForPreset(preset) {
    const end = new Date();
    const start = new Date();
    switch (preset) {
      case "daily": start.setDate(end.getDate()); break;
      case "weekly": start.setDate(end.getDate() - 7); break;
      case "monthly": start.setMonth(end.getMonth() - 1); break;
      case "yearly": start.setFullYear(end.getFullYear() - 1); break;
      default: start.setMonth(end.getMonth() - 1);
    }
    return { start: fmtDate(start), end: fmtDate(end) };
  }

  function initReportsPage() {
    const presetSelect = document.getElementById("reportPreset");
    const startInput = document.getElementById("reportStart");
    const endInput = document.getElementById("reportEnd");
    const generateBtn = document.getElementById("generateReportBtn");
    const exportCsvBtn = document.getElementById("exportCsvBtn");
    const exportExcelBtn = document.getElementById("exportExcelBtn");
    const exportPdfBtn = document.getElementById("exportPdfBtn");

    const revenueTile = document.getElementById("reportRevenueTile");
    const expenseTile = document.getElementById("reportExpenseTile");
    const netTile = document.getElementById("reportNetTile");
    const countTile = document.getElementById("reportCountTile");
    const tbody = document.getElementById("reportTableBody");

    let currentRows = [];

    function applyPreset() {
      if (presetSelect.value === "custom") return;
      const { start, end } = rangeForPreset(presetSelect.value);
      startInput.value = start;
      endInput.value = end;
    }
    presetSelect.addEventListener("change", applyPreset);
    applyPreset();

    async function generate() {
      const start = startInput.value;
      const end = endInput.value;
      if (!start || !end) { window.JolardoDB.toast("Choose a start and end date.", "error"); return; }

      tbody.innerHTML = `<tr><td colspan="5" class="a-empty">Generating report…</td></tr>`;

      const [{ data: income, error: incomeErr }, { data: expenses, error: expenseErr }] = await Promise.all([
        window.sb.from("income").select("*").gte("income_date", start).lte("income_date", end),
        window.sb.from("expenses").select("*").gte("expense_date", start).lte("expense_date", end),
      ]);
      if (incomeErr || expenseErr) { window.JolardoDB.toast("Could not generate report.", "error"); return; }

      const rows = [
        ...(income || []).map((r) => ({ date: r.income_date, type: "Income", category: r.category, description: r.notes || "—", amount: Number(r.amount) })),
        ...(expenses || []).map((r) => ({ date: r.expense_date, type: "Expense", category: r.category.replace("_", " "), description: r.description, amount: -Number(r.amount) })),
      ].sort((a, b) => new Date(b.date) - new Date(a.date));

      currentRows = rows;

      const totalRevenue = (income || []).reduce((s, r) => s + Number(r.amount), 0);
      const totalExpenses = (expenses || []).reduce((s, r) => s + Number(r.amount), 0);
      revenueTile.textContent = window.JolardoDB.formatEGP(totalRevenue);
      expenseTile.textContent = window.JolardoDB.formatEGP(totalExpenses);
      netTile.textContent = window.JolardoDB.formatEGP(totalRevenue - totalExpenses);
      countTile.textContent = rows.length.toLocaleString();

      if (!rows.length) { tbody.innerHTML = `<tr><td colspan="5" class="a-empty">No transactions in this range.</td></tr>`; return; }

      tbody.innerHTML = rows.map((r) => `
        <tr>
          <td>${new Date(r.date).toLocaleDateString()}</td>
          <td><span class="a-badge ${r.type === "Income" ? "completed" : "cancelled"}">${r.type}</span></td>
          <td style="text-transform:capitalize;">${r.category}</td>
          <td>${r.description}</td>
          <td style="color:${r.amount >= 0 ? "var(--a-success)" : "var(--a-danger)"}; font-weight:600;">${window.JolardoDB.formatEGP(Math.abs(r.amount))}</td>
        </tr>`).join("");
    }

    generateBtn.addEventListener("click", generate);
    generate();

    /* -------------------- Export: CSV -------------------- */
    exportCsvBtn.addEventListener("click", () => {
      if (!currentRows.length) { window.JolardoDB.toast("Generate a report first.", "error"); return; }
      const header = ["Date", "Type", "Category", "Description", "Amount (EGP)"];
      const csv = [header.join(",")]
        .concat(currentRows.map((r) => [r.date, r.type, r.category, `"${(r.description || "").replace(/"/g, '""')}"`, r.amount].join(",")))
        .join("\n");
      downloadBlob(csv, "jolardo-report.csv", "text/csv");
    });

    /* -------------------- Export: Excel (.xls via HTML table) -------------------- */
    exportExcelBtn.addEventListener("click", () => {
      if (!currentRows.length) { window.JolardoDB.toast("Generate a report first.", "error"); return; }
      const rowsHtml = currentRows.map((r) => `<tr><td>${r.date}</td><td>${r.type}</td><td>${r.category}</td><td>${r.description}</td><td>${r.amount}</td></tr>`).join("");
      const table = `<table><tr><th>Date</th><th>Type</th><th>Category</th><th>Description</th><th>Amount (EGP)</th></tr>${rowsHtml}</table>`;
      downloadBlob(table, "jolardo-report.xls", "application/vnd.ms-excel");
    });

    /* -------------------- Export: PDF (print-to-PDF) -------------------- */
    exportPdfBtn.addEventListener("click", () => {
      if (!currentRows.length) { window.JolardoDB.toast("Generate a report first.", "error"); return; }
      const win = window.open("", "_blank");
      const rowsHtml = currentRows.map((r) => `<tr><td>${r.date}</td><td>${r.type}</td><td>${r.category}</td><td>${r.description}</td><td>${window.JolardoDB.formatEGP(Math.abs(r.amount))}</td></tr>`).join("");
      win.document.write(`
        <html><head><title>Jolardo Report</title>
        <style>
          body{ font-family: Arial, sans-serif; padding: 30px; color:#111; }
          h1{ margin-bottom:4px; } p{ color:#555; margin-top:0; }
          table{ width:100%; border-collapse:collapse; margin-top:20px; }
          th,td{ border:1px solid #ddd; padding:8px 10px; font-size:13px; text-align:left; }
          th{ background:#f4f4f4; }
        </style></head>
        <body>
          <h1>Jolardo — Financial Report</h1>
          <p>${startInput.value} to ${endInput.value} · Generated ${new Date().toLocaleString()}</p>
          <table><tr><th>Date</th><th>Type</th><th>Category</th><th>Description</th><th>Amount</th></tr>${rowsHtml}</table>
        </body></html>`);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 400);
    });

    function downloadBlob(content, filename, mime) {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      window.JolardoDB.toast("Report exported.", "success");
    }
  }
})();

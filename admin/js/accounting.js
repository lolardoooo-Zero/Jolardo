/* ==========================================================================
   JOLARDO ADMIN — accounting.js
   Financial control: per-admin profit shares, accounts, income, expenses, txs.
   ========================================================================== */

(function () {
  "use strict";

  const EXPENSE_CATEGORIES = ["marketing", "advertising", "office_rent", "internet", "employees", "equipment", "software", "hosting", "transport", "utilities", "other"];

  document.addEventListener("DOMContentLoaded", async () => {
    const profile = await JolardoAdmin.guard();
    if (!profile) return;
    initTabs();
    initFinancialControl(profile);
  });

  function initTabs() {
    const tabs = document.querySelectorAll(".a-sub-tab");
    const panels = document.querySelectorAll(".tab-content-panel");
    const cachedTab = localStorage.getItem("jolardo_admin_finance_tab") || "overview";
    switchTab(cachedTab);

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const tabName = tab.dataset.tab;
        switchTab(tabName);
        localStorage.setItem("jolardo_admin_finance_tab", tabName);
      });
    });

    function switchTab(tabName) {
      tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === tabName));
      panels.forEach((p) => p.classList.toggle("active", p.id === `tab-${tabName}`));
    }
  }

  function initFinancialControl(profile) {
    let allIncome = [];
    let allExpenses = [];
    let allAccounts = [];
    let editingIncomeId = null;
    let editingExpenseId = null;

    const grossEl = document.getElementById("profitGross");
    const expEl = document.getElementById("profitExpenses");
    const netEl = document.getElementById("profitNet");
    const allocatedEl = document.getElementById("profitAllocated");
    const sharePctTotal = document.getElementById("sharePctTotal");
    const saveSharesBtn = document.getElementById("saveSharesBtn");
    const allocateSharesBtn = document.getElementById("allocateSharesBtn");
    const equalSplitBtn = document.getElementById("equalSplitBtn");
    const accountsGrid = document.getElementById("adminAccountsGrid");
    const txTableBody = document.getElementById("transactionsTableBody");
    const txModal = document.getElementById("txModal");
    const txForm = document.getElementById("txForm");

    const incomeTbody = document.getElementById("incomeTableBody");
    const incomeSearch = document.getElementById("incomeSearch");
    const incomeMethodFilter = document.getElementById("incomeMethodFilter");
    const incomeTotalTile = document.getElementById("incomeTotalTile");
    const incomeMonthTile = document.getElementById("incomeMonthTile");
    const incomeCountTile = document.getElementById("incomeCountTile");
    const incomeAvgTile = document.getElementById("incomeAvgTile");
    const incomeModal = document.getElementById("incomeModal");
    const incomeForm = document.getElementById("incomeForm");
    const addIncomeBtn = document.getElementById("addIncomeBtn");

    const expenseTbody = document.getElementById("expenseTableBody");
    const expenseSearch = document.getElementById("expenseSearch");
    const expenseCategoryFilter = document.getElementById("expenseCategoryFilter");
    const expenseTotalTile = document.getElementById("expenseTotalTile");
    const expenseMonthTile = document.getElementById("expenseMonthTile");
    const expenseTopCatTile = document.getElementById("expenseTopCatTile");
    const expenseCountTile = document.getElementById("expenseCountTile");
    const expenseModal = document.getElementById("expenseModal");
    const expenseForm = document.getElementById("expenseForm");
    const addExpenseBtn = document.getElementById("addExpenseBtn");

    if (expenseCategoryFilter) {
      expenseCategoryFilter.innerHTML = `<option value="">All Categories</option>` +
        EXPENSE_CATEGORIES.map((c) => `<option value="${c}">${c.replace("_", " ")}</option>`).join("");
    }

    function netPool() {
      const gross = allIncome.reduce((s, r) => s + Number(r.amount), 0);
      const expenses = allExpenses.reduce((s, r) => s + Number(r.amount), 0);
      return { gross, expenses, net: gross - expenses };
    }

    function readShareInputs() {
      const inputs = accountsGrid.querySelectorAll("[data-share-pct]");
      const map = {};
      inputs.forEach((inp) => {
        map[inp.dataset.sharePct] = Math.min(100, Math.max(0, parseFloat(inp.value) || 0));
      });
      return map;
    }

    async function loadAllData() {
      incomeTbody.innerHTML = `<tr><td colspan="6" class="a-empty">Loading income records…</td></tr>`;
      expenseTbody.innerHTML = `<tr><td colspan="5" class="a-empty">Loading expense records…</td></tr>`;
      accountsGrid.innerHTML = `<div class="a-empty">Loading financial accounts…</div>`;
      txTableBody.innerHTML = `<tr><td colspan="6" class="a-empty">Loading transaction history…</td></tr>`;

      try {
        const [
          { data: incomeRows },
          { data: expenseRows },
          accountRows,
          { data: txRows },
        ] = await Promise.all([
          window.sb.from("income").select("*").order("income_date", { ascending: false }),
          window.sb.from("expenses").select("*").order("expense_date", { ascending: false }),
          window.JolardoFinance.loadAccountsWithShares(),
          window.sb.from("transactions").select("*, profiles!transactions_admin_id_fkey(full_name)").order("created_at", { ascending: false }).limit(40),
        ]);

        allIncome = incomeRows || [];
        allExpenses = expenseRows || [];
        allAccounts = accountRows || [];

        renderOverview();
        renderIncome();
        renderExpenses();
        renderTransactions(txRows || []);
      } catch (err) {
        console.error("Failed to load financial data", err);
        window.JolardoDB.toast("Failed to load financial records. Run migration_v4.sql if needed.", "error");
      }
    }

    function renderOverview() {
      const { gross, expenses, net } = netPool();
      grossEl.textContent = window.JolardoDB.formatEGP(gross);
      expEl.textContent = window.JolardoDB.formatEGP(expenses);
      netEl.textContent = window.JolardoDB.formatEGP(net);

      const totalPct = allAccounts.reduce((s, a) => s + Number(a.profit_share_pct || 0), 0);
      const allocated = allAccounts.reduce((s, a) => s + net * (Number(a.profit_share_pct || 0) / 100), 0);
      allocatedEl.textContent = window.JolardoDB.formatEGP(allocated);
      sharePctTotal.textContent = `Shares: ${totalPct.toFixed(1)}%`;
      sharePctTotal.style.color = totalPct > 100.01 ? "var(--a-danger)" : "var(--a-gold-light)";

      if (!allAccounts.length) {
        accountsGrid.innerHTML = `<div class="a-empty">No admin financial accounts found. Promote a user to admin first.</div>`;
        return;
      }

      accountsGrid.innerHTML = allAccounts.map((acc) => {
        const name = acc.profiles ? acc.profiles.full_name : "Admin";
        const pct = Number(acc.profit_share_pct || 0);
        const shareEGP = net * (pct / 100);
        return `
        <div class="acc-account-card">
          <div style="display:flex; align-items:center; gap:12px;">
            <div class="a-user-avatar">${name.charAt(0).toUpperCase()}</div>
            <div>
              <b style="display:block;">${escapeHtml(name)}</b>
              <span style="font-size:12px;color:var(--a-muted);">${escapeHtml(acc.profiles ? acc.profiles.email : "")}</span>
            </div>
          </div>

          <div class="a-form-group" style="margin:16px 0 8px;">
            <label>Share of Net Profit (%)</label>
            <input type="number" min="0" max="100" step="0.5" value="${pct}"
              data-share-pct="${acc.admin_id}" style="font-size:18px; font-weight:700; color:var(--a-gold-light);" />
          </div>
          <div style="font-size:13px; color:var(--a-ink-dim); margin-bottom:12px;">
            Estimated share: <b style="color:var(--a-gold-light);">${window.JolardoDB.formatEGP(shareEGP)}</b>
          </div>

          <div class="acc-account-grid-inner">
            <div><span>Current Balance</span><b style="color:var(--a-gold-light);">${window.JolardoDB.formatEGP(acc.current_balance)}</b></div>
            <div><span>Profit Credited</span><b>${window.JolardoDB.formatEGP(acc.profit_share)}</b></div>
            <div><span>Withdrawn</span><b>${window.JolardoDB.formatEGP(acc.withdrawn)}</b></div>
            <div><span>Available</span><b style="color:var(--a-success);">${window.JolardoDB.formatEGP(acc.available_amount)}</b></div>
          </div>
          <div style="display:flex; gap:8px; margin-top:16px; flex-wrap:wrap;">
            <button class="a-btn a-btn-sm" data-tx="deposit" data-admin="${acc.admin_id}">Add Money</button>
            <button class="a-btn a-btn-sm" data-tx="withdrawal" data-admin="${acc.admin_id}">Withdraw</button>
            <button class="a-btn a-btn-sm" data-tx="transfer_out" data-admin="${acc.admin_id}">Transfer</button>
          </div>
        </div>`;
      }).join("");

      accountsGrid.querySelectorAll("[data-tx]").forEach((btn) => {
        btn.addEventListener("click", () => openTxModal(btn.dataset.tx, btn.dataset.admin));
      });

      accountsGrid.querySelectorAll("[data-share-pct]").forEach((inp) => {
        inp.addEventListener("input", () => {
          const shares = readShareInputs();
          const total = Object.values(shares).reduce((s, n) => s + n, 0);
          sharePctTotal.textContent = `Shares: ${total.toFixed(1)}%`;
          sharePctTotal.style.color = total > 100.01 ? "var(--a-danger)" : "var(--a-gold-light)";
          const { net } = netPool();
          const card = inp.closest(".acc-account-card");
          const est = card && card.querySelector("div[style*='Estimated'] b");
          if (est) est.textContent = window.JolardoDB.formatEGP(net * ((parseFloat(inp.value) || 0) / 100));
          const alloc = Object.values(shares).reduce((s, pct) => s + net * (pct / 100), 0);
          allocatedEl.textContent = window.JolardoDB.formatEGP(alloc);
        });
      });
    }

    if (equalSplitBtn) {
      equalSplitBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const inputs = accountsGrid.querySelectorAll("[data-share-pct]");
        if (!inputs.length) {
          window.JolardoDB.toast("No admin accounts loaded yet.", "info");
          return;
        }
        const n = inputs.length;
        const base = Math.floor((100 / n) * 100) / 100;
        let remaining = 100;
        inputs.forEach((inp, i) => {
          const val = i === n - 1 ? Math.round(remaining * 100) / 100 : base;
          inp.value = val;
          remaining = Math.round((remaining - val) * 100) / 100;
          inp.dispatchEvent(new Event("input"));
        });
      });
    }

    if (saveSharesBtn) {
      saveSharesBtn.type = "button";
      saveSharesBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const shares = readShareInputs();
        const total = Object.values(shares).reduce((s, n) => s + n, 0);
        if (total > 100.01) {
          window.JolardoDB.toast("Total admin shares cannot exceed 100%.", "error");
          return;
        }
        if (Object.keys(shares).length === 0) {
          window.JolardoDB.toast("No admin accounts to save. Promote a user to admin first.", "error");
          return;
        }
        const prevLabel = saveSharesBtn.textContent;
        saveSharesBtn.disabled = true;
        saveSharesBtn.textContent = "Saving…";
        try {
          if (!window.JolardoFinance) throw new Error("Finance module missing — refresh the page.");
          const result = await window.JolardoFinance.saveShares(shares);
          if (result.local) {
            window.JolardoDB.toast(result.warning || "Saved locally. Run migration_v4.sql for full sync.", "info");
          } else {
            window.JolardoDB.toast(`Shares saved (${total.toFixed(1)}% total).`, "success");
          }
          // Update in-memory accounts so UI reflects immediately
          allAccounts = allAccounts.map((a) => ({
            ...a,
            profit_share_pct: shares[a.admin_id] != null ? shares[a.admin_id] : a.profit_share_pct,
          }));
          renderOverview();
        } catch (err) {
          console.error(err);
          window.JolardoDB.toast(err.message || "Could not save shares.", "error");
        } finally {
          saveSharesBtn.disabled = false;
          saveSharesBtn.textContent = prevLabel || "Save Shares";
        }
      });
    }

    if (allocateSharesBtn) {
      allocateSharesBtn.type = "button";
      allocateSharesBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        const { net } = netPool();
        const shares = readShareInputs();
        const total = Object.values(shares).reduce((s, n) => s + n, 0);
        if (total <= 0) {
          window.JolardoDB.toast("Set at least one admin share % first, then Save Shares.", "error");
          return;
        }
        if (!confirm("Sync each admin wallet to match their % of the current net pool?")) return;

        allocateSharesBtn.disabled = true;
        try {
          await window.JolardoFinance.saveShares(shares);

          let credited = 0;
          let debited = 0;

          for (const acc of allAccounts) {
            const pct = Number(shares[acc.admin_id] || 0);
            const entitled = window.JolardoFinance.round2(net * (pct / 100));
            const already = Number(acc.profit_share || 0);
            const delta = window.JolardoFinance.round2(entitled - already);
            if (Math.abs(delta) < 0.01) continue;

            if (delta > 0) {
              const { error } = await window.sb.from("transactions").insert([{
                admin_id: acc.admin_id,
                amount: delta,
                description: `Balance sync (+${pct}% of net pool)`,
                type: "profit_allocation",
                status: "completed",
                created_by: profile.id,
              }]);
              if (error) throw error;
              await window.sb.from("admin_accounts")
                .update({ profit_share: entitled })
                .eq("admin_id", acc.admin_id);
              credited += delta;
            } else {
              const { error } = await window.sb.from("transactions").insert([{
                admin_id: acc.admin_id,
                amount: Math.abs(delta),
                description: "Balance sync (expense / share adjust)",
                type: "withdrawal",
                status: "completed",
                created_by: profile.id,
              }]);
              if (error) throw error;
              await window.sb.from("admin_accounts")
                .update({ profit_share: entitled })
                .eq("admin_id", acc.admin_id);
              debited += Math.abs(delta);
            }
          }

          window.JolardoDB.toast(
            `Synced. Credited ${window.JolardoDB.formatEGP(credited)}, debited ${window.JolardoDB.formatEGP(debited)}.`,
            "success"
          );
          await loadAllData();
        } catch (err) {
          console.error(err);
          window.JolardoDB.toast(err.message || "Sync failed.", "error");
        } finally {
          allocateSharesBtn.disabled = false;
        }
      });
    }

    function openTxModal(type, adminId) {
      txForm.dataset.type = type;
      txForm.dataset.adminId = adminId;
      const titles = { deposit: "Add Money", withdrawal: "Withdraw Money", transfer_out: "Transfer Between Admins" };
      document.getElementById("txModalTitle").textContent = titles[type] || "Transaction";

      const counterpartyGroup = document.getElementById("txCounterpartyGroup");
      counterpartyGroup.style.display = type === "transfer_out" ? "block" : "none";

      if (type === "transfer_out") {
        const select = document.getElementById("txCounterparty");
        select.innerHTML = allAccounts
          .filter((a) => a.admin_id !== adminId)
          .map((a) => `<option value="${a.admin_id}">${escapeHtml(a.profiles ? a.profiles.full_name : "Admin")}</option>`)
          .join("");
      }
      txForm.reset();
      txModal.classList.add("is-open");
    }

    txForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const type = txForm.dataset.type;
      const adminId = txForm.dataset.adminId;
      const amount = parseFloat(txForm.amount.value);
      const description = txForm.description.value.trim();
      if (!amount || amount <= 0) { window.JolardoDB.toast("Enter a valid amount.", "error"); return; }

      const payload = {
        admin_id: adminId,
        amount,
        description: description || null,
        type,
        status: "completed",
        created_by: profile.id,
      };
      if (type === "transfer_out") {
        payload.counterparty_id = document.getElementById("txCounterparty").value;
      }

      const { error } = await window.sb.from("transactions").insert([payload]);
      if (error) { window.JolardoDB.toast("Transaction failed.", "error"); return; }
      window.JolardoDB.toast("Transaction recorded successfully.", "success");
      txModal.classList.remove("is-open");
      loadAllData();
    });

    /* ---- Income ---- */
    function renderIncome() {
      const q = (incomeSearch.value || "").toLowerCase();
      const method = incomeMethodFilter.value;
      const filtered = allIncome.filter((r) => {
        const matchesQ = !q || (r.category || "").toLowerCase().includes(q) || (r.notes || "").toLowerCase().includes(q);
        const matchesMethod = !method || r.payment_method === method;
        return matchesQ && matchesMethod;
      });

      const total = allIncome.reduce((s, r) => s + Number(r.amount), 0);
      const now = new Date();
      const thisMonth = allIncome.filter((r) => {
        const d = new Date(r.income_date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }).reduce((s, r) => s + Number(r.amount), 0);

      incomeTotalTile.textContent = window.JolardoDB.formatEGP(total);
      incomeMonthTile.textContent = window.JolardoDB.formatEGP(thisMonth);
      incomeCountTile.textContent = allIncome.length.toLocaleString();
      incomeAvgTile.textContent = window.JolardoDB.formatEGP(allIncome.length ? total / allIncome.length : 0);

      if (!filtered.length) {
        incomeTbody.innerHTML = `<tr><td colspan="6" class="a-empty">No income records found.</td></tr>`;
        return;
      }

      incomeTbody.innerHTML = filtered.map((r) => `
        <tr>
          <td>${new Date(r.income_date).toLocaleDateString()}</td>
          <td>${escapeHtml(r.category)}</td>
          <td style="color:var(--a-success); font-weight:600;">${window.JolardoDB.formatEGP(r.amount)}</td>
          <td><span class="category-pill">${escapeHtml((r.payment_method || "").replace("_", " "))}</span></td>
          <td>${escapeHtml(r.notes || "—")}</td>
          <td>
            <div class="a-row-actions">
              <button class="a-icon-action" data-edit-inc="${r.id}" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
              <button class="a-icon-action" data-delete-inc="${r.id}" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/></svg></button>
            </div>
          </td>
        </tr>`).join("");

      incomeTbody.querySelectorAll("[data-edit-inc]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const row = allIncome.find((r) => String(r.id) === btn.dataset.editInc);
          openIncomeModal(row);
        });
      });
      incomeTbody.querySelectorAll("[data-delete-inc]").forEach((btn) => {
        btn.addEventListener("click", () => removeIncomeRow(btn.dataset.deleteInc));
      });
    }

    function openIncomeModal(row) {
      editingIncomeId = row ? row.id : null;
      document.getElementById("incomeModalTitle").textContent = row ? "Edit Income" : "Add Income";
      incomeForm.amount.value = row ? row.amount : "";
      incomeForm.category.value = row ? row.category : "";
      incomeForm.payment_method.value = row ? row.payment_method : "bank_transfer";
      incomeForm.income_date.value = row ? row.income_date : new Date().toISOString().slice(0, 10);
      incomeForm.notes.value = row ? row.notes || "" : "";
      incomeModal.classList.add("is-open");
    }

    async function removeIncomeRow(id) {
      if (!confirm("Delete this income record?")) return;
      const { error } = await window.sb.from("income").delete().eq("id", id);
      if (error) { window.JolardoDB.toast("Failed to delete record.", "error"); return; }
      window.JolardoDB.toast("Income record deleted.", "success");
      loadAllData();
    }

    addIncomeBtn?.addEventListener("click", (e) => { e.preventDefault(); openIncomeModal(null); });
    incomeSearch?.addEventListener("input", renderIncome);
    incomeMethodFilter?.addEventListener("change", renderIncome);

    incomeForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const amount = parseFloat(incomeForm.amount.value);
      const category = incomeForm.category.value.trim();
      const payment_method = incomeForm.payment_method.value;
      const income_date = incomeForm.income_date.value;
      const notes = incomeForm.notes.value.trim() || null;
      if (!amount || amount <= 0 || !category) {
        window.JolardoDB.toast("Amount and category are required.", "error");
        return;
      }
      const payload = { amount, category, payment_method, income_date, notes, created_by: profile.id };
      const query = editingIncomeId
        ? window.sb.from("income").update(payload).eq("id", editingIncomeId)
        : window.sb.from("income").insert([payload]);
      const { error } = await query;
      if (error) { window.JolardoDB.toast("Failed to save income record.", "error"); return; }

      // New income → split into admin wallets by share %
      if (!editingIncomeId) {
        try {
          const dist = await window.JolardoFinance.onIncomeAdded(amount, category, profile.id);
          if (dist.reason === "no_shares") {
            window.JolardoDB.toast("Income saved. Set & save admin shares to auto-split.", "info");
          } else if (!dist.skipped) {
            window.JolardoDB.toast(`Income saved & split ${window.JolardoDB.formatEGP(dist.distributed)} by shares.`, "success");
          } else {
            window.JolardoDB.toast("Income added.", "success");
          }
        } catch (err) {
          console.error(err);
          window.JolardoDB.toast("Income saved, but share split failed.", "error");
        }
      } else {
        window.JolardoDB.toast("Income updated.", "success");
      }

      incomeModal.classList.remove("is-open");
      loadAllData();
    });

    /* ---- Expenses ---- */
    function renderExpenses() {
      const q = (expenseSearch.value || "").toLowerCase();
      const cat = expenseCategoryFilter.value;
      const filtered = allExpenses.filter((r) => {
        const matchesQ = !q || (r.description || "").toLowerCase().includes(q);
        const matchesCat = !cat || r.category === cat;
        return matchesQ && matchesCat;
      });

      const total = allExpenses.reduce((s, r) => s + Number(r.amount), 0);
      const now = new Date();
      const thisMonth = allExpenses.filter((r) => {
        const d = new Date(r.expense_date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }).reduce((s, r) => s + Number(r.amount), 0);

      const categoryTotals = {};
      allExpenses.forEach((r) => {
        categoryTotals[r.category] = (categoryTotals[r.category] || 0) + Number(r.amount);
      });
      const topCat = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];

      expenseTotalTile.textContent = window.JolardoDB.formatEGP(total);
      expenseMonthTile.textContent = window.JolardoDB.formatEGP(thisMonth);
      expenseTopCatTile.textContent = topCat ? topCat[0].replace("_", " ") : "—";
      expenseCountTile.textContent = allExpenses.length.toLocaleString();

      if (!filtered.length) {
        expenseTbody.innerHTML = `<tr><td colspan="5" class="a-empty">No expenses found.</td></tr>`;
        return;
      }

      expenseTbody.innerHTML = filtered.map((r) => `
        <tr>
          <td>${new Date(r.expense_date).toLocaleDateString()}</td>
          <td><span class="category-pill">${escapeHtml(r.category.replace("_", " "))}</span></td>
          <td>${escapeHtml(r.description)}</td>
          <td style="color:var(--a-danger); font-weight:600;">${window.JolardoDB.formatEGP(r.amount)}</td>
          <td>
            <div class="a-row-actions">
              <button class="a-icon-action" data-edit-exp="${r.id}" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
              <button class="a-icon-action" data-delete-exp="${r.id}" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/></svg></button>
            </div>
          </td>
        </tr>`).join("");

      expenseTbody.querySelectorAll("[data-edit-exp]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const row = allExpenses.find((r) => String(r.id) === btn.dataset.editExp);
          openExpenseModal(row);
        });
      });
      expenseTbody.querySelectorAll("[data-delete-exp]").forEach((btn) => {
        btn.addEventListener("click", () => removeExpenseRow(btn.dataset.deleteExp));
      });
    }

    function openExpenseModal(row) {
      editingExpenseId = row ? row.id : null;
      document.getElementById("expenseModalTitle").textContent = row ? "Edit Expense" : "Add Expense";
      expenseForm.amount.value = row ? row.amount : "";
      expenseForm.category.value = row ? row.category : "other";
      expenseForm.description.value = row ? row.description : "";
      expenseForm.expense_date.value = row ? row.expense_date : new Date().toISOString().slice(0, 10);
      expenseModal.classList.add("is-open");
    }

    async function removeExpenseRow(id) {
      if (!confirm("Delete this expense record?")) return;
      const { error } = await window.sb.from("expenses").delete().eq("id", id);
      if (error) { window.JolardoDB.toast("Failed to delete record.", "error"); return; }
      window.JolardoDB.toast("Expense record deleted.", "success");
      loadAllData();
    }

    addExpenseBtn?.addEventListener("click", (e) => { e.preventDefault(); openExpenseModal(null); });
    expenseSearch?.addEventListener("input", renderExpenses);
    expenseCategoryFilter?.addEventListener("change", renderExpenses);

    expenseForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const amount = parseFloat(expenseForm.amount.value);
      const category = expenseForm.category.value;
      const description = expenseForm.description.value.trim();
      const expense_date = expenseForm.expense_date.value;
      if (!amount || amount <= 0 || !description) {
        window.JolardoDB.toast("Amount and description are required.", "error");
        return;
      }
      const payload = { amount, category, description, expense_date, created_by: profile.id };
      const query = editingExpenseId
        ? window.sb.from("expenses").update(payload).eq("id", editingExpenseId)
        : window.sb.from("expenses").insert([payload]);
      const { error } = await query;
      if (error) { window.JolardoDB.toast("Failed to save expense record.", "error"); return; }

      // New expense → deduct from admin wallets by share % (from profit)
      if (!editingExpenseId) {
        try {
          const dist = await window.JolardoFinance.onExpenseAdded(amount, description, profile.id);
          if (dist.reason === "no_shares") {
            window.JolardoDB.toast("Expense saved. Set & save admin shares to auto-deduct.", "info");
          } else if (!dist.skipped) {
            window.JolardoDB.toast(`Expense saved & deducted ${window.JolardoDB.formatEGP(dist.distributed)} by shares.`, "success");
          } else {
            window.JolardoDB.toast("Expense added.", "success");
          }
        } catch (err) {
          console.error(err);
          window.JolardoDB.toast("Expense saved, but share deduction failed.", "error");
        }
      } else {
        window.JolardoDB.toast("Expense updated.", "success");
      }

      expenseModal.classList.remove("is-open");
      loadAllData();
    });

    function renderTransactions(rows) {
      if (!rows.length) {
        txTableBody.innerHTML = `<tr><td colspan="6" class="a-empty">No transactions recorded yet.</td></tr>`;
        return;
      }
      txTableBody.innerHTML = rows.map((t) => `
        <tr>
          <td>${new Date(t.created_at).toLocaleString()}</td>
          <td>${escapeHtml(t.profiles ? t.profiles.full_name : "—")}</td>
          <td><span class="a-badge ${t.type === "withdrawal" || t.type === "transfer_out" ? "cancelled" : "completed"}">${t.type.replace(/_/g, " ")}</span></td>
          <td>${window.JolardoDB.formatEGP(t.amount)}</td>
          <td style="font-family:'IBM Plex Mono',monospace; font-size:12px;">${escapeHtml(t.reference_number)}</td>
          <td><span class="a-badge ${t.status}">${t.status}</span></td>
        </tr>`).join("");
    }

    document.querySelectorAll(".a-modal-backdrop .a-modal-close, .a-modal-backdrop [data-cancel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        incomeModal.classList.remove("is-open");
        expenseModal.classList.remove("is-open");
        txModal.classList.remove("is-open");
      });
    });

    loadAllData();
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
})();

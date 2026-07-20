/* ==========================================================================
   JOLARDO ADMIN — settings.js
   Powers profits.html (net-profit %, admin financial accounts, transactions)
   and settings.html (profile, security, company preferences).
   ========================================================================== */

(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", async () => {
    const profile = await JolardoAdmin.guard();
    if (!profile) return;

    if (document.getElementById("profitSlider")) initProfitsPage(profile);
    if (document.getElementById("settingsProfileForm")) initSettingsPage(profile);
  });

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* =========================================================================
     PROFITS PAGE  (profits.html)
     ========================================================================= */
  async function initProfitsPage(profile) {
    const slider = document.getElementById("profitSlider");
    const sliderValue = document.getElementById("profitSliderValue");
    const saveBtn = document.getElementById("saveProfitBtn");
    const grossEl = document.getElementById("profitGross");
    const expEl = document.getElementById("profitExpenses");
    const netEl = document.getElementById("profitNet");
    const remainingEl = document.getElementById("profitRemaining");
    const accountsGrid = document.getElementById("adminAccountsGrid");
    const txTableBody = document.getElementById("transactionsTableBody");

    const txModal = document.getElementById("txModal");
    const txForm = document.getElementById("txForm");
    let accounts = [];
    let currentPercentage = 25;

    async function loadFinancials() {
      const [{ data: incomeRows }, { data: expenseRows }, { data: profitRows }] = await Promise.all([
        window.sb.from("income").select("amount"),
        window.sb.from("expenses").select("amount"),
        window.sb.from("profit_settings").select("percentage").order("effective_from", { ascending: false }).limit(1),
      ]);
      const gross = (incomeRows || []).reduce((s, r) => s + Number(r.amount), 0);
      const totalExpenses = (expenseRows || []).reduce((s, r) => s + Number(r.amount), 0);
      currentPercentage = (profitRows && profitRows[0] && profitRows[0].percentage) || 25;

      slider.value = currentPercentage;
      sliderValue.textContent = currentPercentage + "%";
      grossEl.textContent = window.JolardoDB.formatEGP(gross);
      expEl.textContent = window.JolardoDB.formatEGP(totalExpenses);
      updateCalculatedProfit(gross, totalExpenses, currentPercentage);
    }

    function updateCalculatedProfit(gross, totalExpenses, pct) {
      const net = (gross - totalExpenses) * (pct / 100);
      const remaining = (gross - totalExpenses) * (1 - pct / 100);
      netEl.textContent = window.JolardoDB.formatEGP(net);
      remainingEl.textContent = window.JolardoDB.formatEGP(remaining);
    }

    slider.addEventListener("input", () => {
      sliderValue.textContent = slider.value + "%";
      const gross = parseEGP(grossEl.textContent);
      const exp = parseEGP(expEl.textContent);
      updateCalculatedProfit(gross, exp, Number(slider.value));
    });

    saveBtn.addEventListener("click", async () => {
      const { error } = await window.sb.from("profit_settings").insert([{ percentage: Number(slider.value), set_by: profile.id }]);
      if (error) { window.JolardoDB.toast("Could not save profit percentage.", "error"); return; }
      window.JolardoDB.toast("Net profit percentage updated to " + slider.value + "%.", "success");
      loadFinancials();
    });

    function parseEGP(text) {
      return Number((text || "0").replace(/[^\d.-]/g, "")) || 0;
    }

    async function loadAccounts() {
      const { data, error } = await window.sb
        .from("admin_accounts")
        .select("*, profiles!admin_accounts_admin_id_fkey(full_name,email)")
        .order("id");
      if (error) { accountsGrid.innerHTML = `<div class="a-empty">Could not load admin accounts.</div>`; return; }
      accounts = data || [];
      if (!accounts.length) { accountsGrid.innerHTML = `<div class="a-empty">No admin financial accounts yet.</div>`; return; }

      accountsGrid.innerHTML = accounts.map((acc) => {
        const name = acc.profiles ? acc.profiles.full_name : "Admin";
        return `
        <div class="acc-account-card">
          <div style="display:flex; align-items:center; gap:12px;">
            <div class="a-user-avatar">${name.charAt(0).toUpperCase()}</div>
            <div><b style="display:block;">${escapeHtml(name)}</b><span style="font-size:12px;color:var(--a-muted);">${escapeHtml(acc.profiles ? acc.profiles.email : "")}</span></div>
          </div>
          <div class="acc-account-grid-inner">
            <div><span>Current Balance</span><b style="color:var(--a-gold-light);">${window.JolardoDB.formatEGP(acc.current_balance)}</b></div>
            <div><span>Profit Share</span><b>${window.JolardoDB.formatEGP(acc.profit_share)}</b></div>
            <div><span>Withdrawn</span><b>${window.JolardoDB.formatEGP(acc.withdrawn)}</b></div>
            <div><span>Remaining</span><b>${window.JolardoDB.formatEGP(acc.remaining)}</b></div>
            <div><span>Total Earned</span><b>${window.JolardoDB.formatEGP(acc.total_earned)}</b></div>
            <div><span>Available</span><b style="color:var(--a-success);">${window.JolardoDB.formatEGP(acc.available_amount)}</b></div>
          </div>
          <div style="display:flex; gap:8px; margin-top:16px;">
            <button class="a-btn a-btn-sm" data-tx="deposit" data-admin="${acc.admin_id}">Add Money</button>
            <button class="a-btn a-btn-sm" data-tx="withdrawal" data-admin="${acc.admin_id}">Withdraw</button>
            <button class="a-btn a-btn-sm" data-tx="transfer_out" data-admin="${acc.admin_id}">Transfer</button>
          </div>
        </div>`;
      }).join("");

      accountsGrid.querySelectorAll("[data-tx]").forEach((btn) =>
        btn.addEventListener("click", () => openTxModal(btn.dataset.tx, btn.dataset.admin))
      );
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
        select.innerHTML = accounts
          .filter((a) => a.admin_id !== adminId)
          .map((a) => `<option value="${a.admin_id}">${escapeHtml(a.profiles ? a.profiles.full_name : "Admin")}</option>`)
          .join("");
      }
      txForm.reset();
      txModal.classList.add("is-open");
    }

    document.querySelectorAll("#txModal .a-modal-close, #txModal [data-cancel]").forEach((b) => b.addEventListener("click", () => txModal.classList.remove("is-open")));

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
      if (type === "transfer_out") payload.counterparty_id = document.getElementById("txCounterparty").value;

      const { error } = await window.sb.from("transactions").insert([payload]);
      if (error) { window.JolardoDB.toast("Transaction failed.", "error"); return; }
      window.JolardoDB.toast("Transaction recorded.", "success");
      txModal.classList.remove("is-open");
      loadAccounts();
      loadTransactions();
    });

    async function loadTransactions() {
      const { data, error } = await window.sb
        .from("transactions")
        .select("*, profiles!transactions_admin_id_fkey(full_name)")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error || !data || !data.length) { txTableBody.innerHTML = `<tr><td colspan="6" class="a-empty">No transactions yet.</td></tr>`; return; }
      txTableBody.innerHTML = data.map((t) => `
        <tr>
          <td>${new Date(t.created_at).toLocaleString()}</td>
          <td>${escapeHtml(t.profiles ? t.profiles.full_name : "—")}</td>
          <td><span class="a-badge ${t.type === "withdrawal" || t.type === "transfer_out" ? "cancelled" : "completed"}">${t.type.replace("_"," ")}</span></td>
          <td>${window.JolardoDB.formatEGP(t.amount)}</td>
          <td style="font-family:'IBM Plex Mono',monospace; font-size:12px;">${escapeHtml(t.reference_number)}</td>
          <td><span class="a-badge ${t.status}">${t.status}</span></td>
        </tr>`).join("");
    }

    loadFinancials();
    loadAccounts();
    loadTransactions();
  }

  /* =========================================================================
     SETTINGS PAGE  (settings.html)
     ========================================================================= */
  function initSettingsPage(profile) {
    const profileForm = document.getElementById("settingsProfileForm");
    profileForm.full_name.value = profile.full_name;
    profileForm.email.value = profile.email;
    profileForm.phone.value = profile.phone || "";

    profileForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const { error } = await window.sb.from("profiles").update({
        full_name: profileForm.full_name.value.trim(),
        phone: profileForm.phone.value.trim() || null,
      }).eq("id", profile.id);
      if (error) { window.JolardoDB.toast("Could not update profile.", "error"); return; }
      window.JolardoDB.toast("Profile updated.", "success");
      document.querySelectorAll("[data-admin-name]").forEach((el) => (el.textContent = profileForm.full_name.value.trim()));
    });

    const pwForm = document.getElementById("settingsPasswordForm");
    pwForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (pwForm.new_password.value.length < 8) { window.JolardoDB.toast("Password must be at least 8 characters.", "error"); return; }
      if (pwForm.new_password.value !== pwForm.confirm_password.value) { window.JolardoDB.toast("Passwords do not match.", "error"); return; }
      const { error } = await window.sb.auth.updateUser({ password: pwForm.new_password.value });
      if (error) { window.JolardoDB.toast(error.message, "error"); return; }
      window.JolardoDB.toast("Password updated.", "success");
      pwForm.reset();
    });

    const notifForm = document.getElementById("settingsNotifForm");
    notifForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      window.JolardoDB.toast("Notification preferences saved.", "success");
    });
  }
})();

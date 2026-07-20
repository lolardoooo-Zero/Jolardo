/* ==========================================================================
   JOLARDO ADMIN — projects.js
   Client projects, progress tracking, and payment / amount-owed handling.
   ========================================================================== */

(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", async () => {
    const profile = await JolardoAdmin.guard();
    if (!profile) return;
    initProjectsPage(profile);
  });

  function initProjectsPage(profile) {
    let allProjects = [];
    let clientProfiles = [];
    let editingProjectId = null;
    let paymentProjectId = null;

    const tbody = document.getElementById("projectsTableBody");
    const searchInput = document.getElementById("projectSearch");
    const statusFilter = document.getElementById("projectStatusFilter");

    const totalTile = document.getElementById("projectsTotalTile");
    const activeTile = document.getElementById("projectsActiveTile");
    const paidTile = document.getElementById("projectsPaidTile");
    const owedTile = document.getElementById("projectsOwedTile");

    const modal = document.getElementById("projectModal");
    const form = document.getElementById("projectForm");
    const addBtn = document.getElementById("addProjectBtn");
    const progressSlider = document.getElementById("projProgress");
    const progressValLabel = document.getElementById("projProgressVal");
    const clientSelect = document.getElementById("projClientId");

    const paymentModal = document.getElementById("paymentModal");
    const paymentForm = document.getElementById("paymentForm");

    progressSlider.addEventListener("input", () => {
      progressValLabel.textContent = progressSlider.value + "%";
    });

    async function loadData() {
      tbody.innerHTML = `<tr><td colspan="8" class="a-empty">Loading projects…</td></tr>`;

      try {
        const { data: userProfiles, error: profilesErr } = await window.sb
          .from("profiles")
          .select("id, full_name, email")
          .eq("role", "user")
          .eq("status", "active")
          .order("full_name");

        if (profilesErr) throw profilesErr;
        clientProfiles = userProfiles || [];
        populateClientSelect();

        const { data: projectsData, error: projectsErr } = await window.sb
          .from("projects")
          .select("*, profiles!projects_client_id_fkey(full_name,email)")
          .order("created_at", { ascending: false });

        if (projectsErr) throw projectsErr;
        allProjects = projectsData || [];

        renderSummary();
        renderTable();
      } catch (err) {
        console.error("Failed to load projects", err);
        window.JolardoDB.toast("Failed to load projects.", "error");
      }
    }

    function populateClientSelect() {
      clientSelect.innerHTML = `<option value="">Unassigned (Select User Account...)</option>` +
        clientProfiles.map((p) => `<option value="${p.id}">${escapeHtml(p.full_name)} (${escapeHtml(p.email)})</option>`).join("");
    }

    function owedOf(p) {
      return Math.max(0, Number(p.budget || 0) - Number(p.amount_paid || 0));
    }

    function renderSummary() {
      const totalCount = allProjects.length;
      const activeCount = allProjects.filter((p) => p.status === "in_progress").length;
      const totalPaid = allProjects.reduce((s, p) => s + Number(p.amount_paid || 0), 0);
      const totalOwed = allProjects.reduce((s, p) => s + owedOf(p), 0);

      totalTile.textContent = totalCount.toLocaleString();
      activeTile.textContent = activeCount.toLocaleString();
      paidTile.textContent = window.JolardoDB.formatEGP(totalPaid);
      owedTile.textContent = window.JolardoDB.formatEGP(totalOwed);
    }

    function renderTable() {
      const q = (searchInput.value || "").toLowerCase();
      const status = statusFilter.value;

      const filtered = allProjects.filter((p) => {
        const matchesQ = !q || p.name.toLowerCase().includes(q) || p.client_name.toLowerCase().includes(q);
        const matchesStatus = !status || p.status === status;
        return matchesQ && matchesStatus;
      });

      if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="a-empty">No projects found.</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map((p) => {
        const clientCell = p.profiles
          ? `<div><b>${escapeHtml(p.profiles.full_name)}</b><span style="display:block;font-size:11.5px;color:var(--a-muted);">${escapeHtml(p.profiles.email)}</span></div>`
          : `<span class="a-badge" style="background:rgba(255,255,255,0.05);color:var(--a-muted);">Unassigned</span>`;

        const paid = Number(p.amount_paid || 0);
        const owed = owedOf(p);
        const statusClass = p.status === "completed" ? "completed" : p.status === "in_progress" ? "pending" : p.status === "cancelled" ? "cancelled" : "info";

        return `
        <tr>
          <td>
            <div style="font-weight:600;font-size:14.5px;">${escapeHtml(p.name)}</div>
            <span style="font-size:11.5px;color:var(--a-muted);">${escapeHtml(p.client_name)} · ${escapeHtml(p.current_phase)}</span>
          </td>
          <td>${clientCell}</td>
          <td style="font-weight:600;color:var(--a-gold-light);">${window.JolardoDB.formatEGP(p.budget)}</td>
          <td style="color:var(--a-success);font-weight:600;">${window.JolardoDB.formatEGP(paid)}</td>
          <td style="color:${owed > 0 ? "var(--a-danger)" : "var(--a-success)"};font-weight:600;">${window.JolardoDB.formatEGP(owed)}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="flex:1;height:5px;background:rgba(255,255,255,0.05);border-radius:4px;overflow:hidden;min-width:60px;">
                <div style="height:100%;width:${p.progress_pct}%;background:var(--a-gradient-gold);border-radius:4px;"></div>
              </div>
              <span style="font-size:12px;font-weight:500;min-width:30px;text-align:right;">${p.progress_pct}%</span>
            </div>
          </td>
          <td><span class="a-badge ${statusClass}">${escapeHtml(p.status.replace("_", " "))}</span></td>
          <td>
            <div class="a-row-actions">
              <button class="a-btn a-btn-sm a-btn-gold" data-pay="${p.id}" title="Record Payment" ${owed <= 0 ? "disabled" : ""}>Pay</button>
              <button class="a-icon-action" data-edit="${p.id}" title="Edit Project"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
              <button class="a-icon-action" data-delete="${p.id}" title="Delete Project"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/></svg></button>
            </div>
          </td>
        </tr>`;
      }).join("");

      tbody.querySelectorAll("[data-edit]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const proj = allProjects.find((p) => String(p.id) === btn.dataset.edit);
          openProjectModal(proj);
        });
      });
      tbody.querySelectorAll("[data-delete]").forEach((btn) => {
        btn.addEventListener("click", () => deleteProject(btn.dataset.delete));
      });
      tbody.querySelectorAll("[data-pay]").forEach((btn) => {
        btn.addEventListener("click", () => openPaymentModal(btn.dataset.pay));
      });
    }

    function openProjectModal(proj) {
      editingProjectId = proj ? proj.id : null;
      document.getElementById("projectModalTitle").textContent = proj ? "Edit Project" : "Add Project";

      form.name.value = proj ? proj.name : "";
      form.client_name.value = proj ? proj.client_name : "";
      form.client_id.value = proj && proj.client_id ? proj.client_id : "";
      form.budget.value = proj ? proj.budget : "";
      form.status.value = proj ? proj.status : "pending";
      form.current_phase.value = proj ? proj.current_phase : "Briefing";
      form.progress_pct.value = proj ? proj.progress_pct : 0;
      progressValLabel.textContent = (proj ? proj.progress_pct : 0) + "%";
      form.status_notes.value = proj ? proj.status_notes || "" : "";
      form.started_at.value = proj && proj.started_at ? proj.started_at : new Date().toISOString().slice(0, 10);
      form.due_at.value = proj && proj.due_at ? proj.due_at : "";

      modal.classList.add("is-open");
    }

    function openPaymentModal(projectId) {
      const proj = allProjects.find((p) => String(p.id) === String(projectId));
      if (!proj) return;
      paymentProjectId = proj.id;
      const owed = owedOf(proj);
      document.getElementById("paymentProjectLabel").textContent =
        `${proj.name} · Budget ${window.JolardoDB.formatEGP(proj.budget)} · Already paid ${window.JolardoDB.formatEGP(proj.amount_paid || 0)}`;
      document.getElementById("paymentOwedHint").textContent =
        `Outstanding balance: ${window.JolardoDB.formatEGP(owed)}`;
      paymentForm.amount.value = owed > 0 ? owed : "";
      paymentForm.payment_date.value = new Date().toISOString().slice(0, 10);
      paymentForm.payment_method.value = "bank_transfer";
      paymentForm.notes.value = "";
      paymentModal.classList.add("is-open");
    }

    async function deleteProject(id) {
      if (!confirm("Delete this project? Associated payment history will also be removed.")) return;
      const { error } = await window.sb.from("projects").delete().eq("id", id);
      if (error) { window.JolardoDB.toast("Failed to delete project.", "error"); return; }
      window.JolardoDB.toast("Project deleted successfully.", "success");
      loadData();
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const budget = parseFloat(form.budget.value);
      if (!budget || budget < 0) {
        window.JolardoDB.toast("Please enter a valid budget amount.", "error");
        return;
      }

      const previous = editingProjectId
        ? allProjects.find((p) => String(p.id) === String(editingProjectId))
        : null;
      const newStatus = form.status.value;
      const becameComplete = newStatus === "completed" && (!previous || previous.status !== "completed");

      const payload = {
        name: form.name.value.trim(),
        client_name: form.client_name.value.trim(),
        client_id: form.client_id.value || null,
        budget,
        status: newStatus,
        current_phase: form.current_phase.value,
        progress_pct: parseInt(form.progress_pct.value, 10),
        status_notes: form.status_notes.value.trim() || null,
        started_at: form.started_at.value || null,
        due_at: form.due_at.value || null,
        created_by: profile.id,
      };

      if (becameComplete) {
        payload.progress_pct = 100;
        if (payload.current_phase !== "Completed") payload.current_phase = "Completed";
      }

      const query = editingProjectId
        ? window.sb.from("projects").update(payload).eq("id", editingProjectId).select("id, name, budget, amount_paid, status").single()
        : window.sb.from("projects").insert([payload]).select("id, name, budget, amount_paid, status").single();

      const { data: saved, error } = await query;
      if (error) {
        console.error("Save project error", error);
        window.JolardoDB.toast("Failed to save project.", "error");
        return;
      }

      if (becameComplete && window.JolardoFinance) {
        try {
          const projectRef = {
            id: (saved && saved.id) || editingProjectId,
            name: payload.name,
            budget: payload.budget,
            amount_paid: previous ? previous.amount_paid : 0,
          };
          const result = await window.JolardoFinance.onProjectCompleted(projectRef, profile.id);
          if (result.incomeAdded > 0) {
            const splitMsg = result.distributed
              ? ` Split ${window.JolardoDB.formatEGP(result.distributed)} by admin shares.`
              : result.reason === "no_shares"
                ? " Set admin shares in Financial Control to auto-split."
                : "";
            window.JolardoDB.toast(
              `Project completed. ${window.JolardoDB.formatEGP(result.incomeAdded)} added to Financial Control.${splitMsg}`,
              "success"
            );
          } else {
            window.JolardoDB.toast("Project completed. Budget was already in Financial Control.", "success");
          }
        } catch (err) {
          console.error(err);
          window.JolardoDB.toast("Project saved, but finance sync failed. Run migration_v4.sql.", "error");
        }
      } else {
        window.JolardoDB.toast(editingProjectId ? "Project updated." : "Project created.", "success");
      }

      modal.classList.remove("is-open");
      loadData();
    });

    paymentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const proj = allProjects.find((p) => String(p.id) === String(paymentProjectId));
      if (!proj) return;

      const amount = parseFloat(paymentForm.amount.value);
      const owed = owedOf(proj);
      if (!amount || amount <= 0) {
        window.JolardoDB.toast("Enter a valid payment amount.", "error");
        return;
      }
      if (amount > owed + 0.01) {
        window.JolardoDB.toast(`Amount exceeds outstanding balance (${window.JolardoDB.formatEGP(owed)}).`, "error");
        return;
      }

      const payload = {
        project_id: proj.id,
        client_id: proj.client_id || null,
        amount,
        payment_method: paymentForm.payment_method.value,
        notes: paymentForm.notes.value.trim() || null,
        payment_date: paymentForm.payment_date.value,
        created_by: profile.id,
      };

      const { error } = await window.sb.from("client_payments").insert([payload]);
      if (error) {
        console.error("[payment]", error);
        const hint = (error.message || "").includes("does not exist")
          || (error.code === "42P01")
          || (error.code === "PGRST205")
          ? " Run sql/RUN_THIS_FIX.sql in Supabase SQL Editor."
          : "";
        window.JolardoDB.toast((error.message || "Payment failed.") + hint, "error");
        return;
      }

      // Payment already mirrored to income via DB trigger — split to admins by %
      if (window.JolardoFinance) {
        try {
          const dist = await window.JolardoFinance.onIncomeAdded(
            amount,
            `Client payment — ${proj.name}`,
            profile.id
          );
          if (dist.reason === "no_shares") {
            window.JolardoDB.toast("Payment recorded. Save admin shares to auto-split.", "info");
          } else if (!dist.skipped) {
            window.JolardoDB.toast(
              `Payment recorded & split ${window.JolardoDB.formatEGP(dist.distributed)} by shares.`,
              "success"
            );
          } else {
            window.JolardoDB.toast(`Payment of ${window.JolardoDB.formatEGP(amount)} recorded.`, "success");
          }
        } catch (err) {
          console.error(err);
          window.JolardoDB.toast("Payment recorded, but share split failed.", "error");
        }
      } else {
        window.JolardoDB.toast(`Payment of ${window.JolardoDB.formatEGP(amount)} recorded.`, "success");
      }

      paymentModal.classList.remove("is-open");
      loadData();
    });

    addBtn.addEventListener("click", () => openProjectModal(null));
    searchInput.addEventListener("input", renderTable);
    statusFilter.addEventListener("change", renderTable);

    document.querySelectorAll("#projectModal .a-modal-close, #projectModal [data-cancel]").forEach((btn) => {
      btn.addEventListener("click", () => modal.classList.remove("is-open"));
    });
    document.querySelectorAll("#paymentModal .a-modal-close, #paymentModal [data-cancel]").forEach((btn) => {
      btn.addEventListener("click", () => paymentModal.classList.remove("is-open"));
    });

    loadData();
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
})();

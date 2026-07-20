/* ==========================================================================
   JOLARDO ADMIN — applications.js
   Simple per-service fields: first pay, monthly, net-profit %.
   ========================================================================== */

(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", async () => {
    const profile = await JolardoAdmin.guard();
    if (!profile) return;
    initApplicationsPage();
  });

  function initApplicationsPage() {
    const servicesBody = document.getElementById("servicesBody");
    const addServiceBtn = document.getElementById("addServiceBtn");
    const modal = document.getElementById("svcModal");
    const form = document.getElementById("svcForm");

    let editingId = null;
    let allServices = [];

    const toast = (msg, type) => window.JolardoDB.toast(msg, type);
    const money = (n) => window.JolardoDB.formatEGP(n);
    const escapeHtml = (str) =>
      String(str ?? "").replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
      );

    async function loadServices() {
      servicesBody.innerHTML = `<tr><td colspan="7" class="a-empty">Loading…</td></tr>`;
      const { data, error } = await window.sb
        .from("application_services")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) {
        servicesBody.innerHTML = `<tr><td colspan="7" class="a-empty">Run APPLICATION_SETUP.sql + APPLICATION_SERVICE_PLAN.sql</td></tr>`;
        toast(error.message || "Failed to load services.", "error");
        return;
      }

      allServices = data || [];
      if (!allServices.length) {
        servicesBody.innerHTML = `<tr><td colspan="7" class="a-empty">No services yet. Add one.</td></tr>`;
        return;
      }

      servicesBody.innerHTML = allServices
        .map(
          (s) => `
        <tr class="${s.is_active ? "" : "svc-row-inactive"}">
          <td>${s.sort_order}</td>
          <td>
            <b>${escapeHtml(s.title)}</b>
            <span style="display:block;font-size:12px;color:var(--a-muted);max-width:220px;">${escapeHtml(s.description || "")}</span>
          </td>
          <td style="color:var(--a-gold-light);font-weight:600;">${money(s.down_egp)}</td>
          <td>${money(s.monthly_egp)}</td>
          <td>${Number(s.profit_share_percent) || 0}%</td>
          <td><span class="a-badge ${s.is_active ? "completed" : "cancelled"}">${s.is_active ? "Active" : "Off"}</span></td>
          <td>
            <div class="a-row-actions">
              <button class="a-btn a-btn-sm" data-edit="${s.id}">Edit</button>
              <button class="a-btn a-btn-sm a-btn-danger" data-del="${s.id}">Delete</button>
            </div>
          </td>
        </tr>`
        )
        .join("");

      servicesBody.querySelectorAll("[data-edit]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const row = allServices.find((s) => String(s.id) === btn.dataset.edit);
          openModal(row);
        });
      });
      servicesBody.querySelectorAll("[data-del]").forEach((btn) => {
        btn.addEventListener("click", () => removeService(btn.dataset.del));
      });
    }

    function openModal(row) {
      editingId = row ? row.id : null;
      document.getElementById("svcModalTitle").textContent = row ? "Edit Service" : "Add Service";
      form.title.value = row ? row.title : "";
      form.description.value = row ? row.description || "" : "";
      document.getElementById("svcFirstPay").value = row ? row.down_egp || 0 : 0;
      document.getElementById("svcMonthly").value = row ? row.monthly_egp || 0 : 0;
      document.getElementById("svcProfitPct").value = row ? row.profit_share_percent || 0 : 0;
      form.sort_order.value = row ? row.sort_order : allServices.length + 1;
      document.getElementById("svcActive").checked = row ? !!row.is_active : true;
      modal.classList.add("is-open");
    }

    async function removeService(id) {
      if (!confirm("Delete this service?")) return;
      const { error } = await window.sb.from("application_services").delete().eq("id", id);
      if (error) {
        toast(error.message || "Delete failed.", "error");
        return;
      }
      toast("Service deleted.", "success");
      loadServices();
    }

    addServiceBtn.addEventListener("click", () => openModal(null));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const first = parseFloat(document.getElementById("svcFirstPay").value) || 0;
      const monthly = parseFloat(document.getElementById("svcMonthly").value) || 0;
      const profit = parseFloat(document.getElementById("svcProfitPct").value) || 0;
      const payload = {
        title: form.title.value.trim(),
        description: form.description.value.trim(),
        price_egp: first,
        sort_order: parseInt(form.sort_order.value, 10) || 0,
        down_egp: first,
        monthly_egp: monthly,
        profit_share_percent: profit,
        is_active: document.getElementById("svcActive").checked,
        updated_at: new Date().toISOString(),
      };
      if (!payload.title) {
        toast("Title is required.", "error");
        return;
      }

      const query = editingId
        ? window.sb.from("application_services").update(payload).eq("id", editingId)
        : window.sb.from("application_services").insert([payload]);

      const { error } = await query;
      if (error) {
        toast(
          (error.message || "Save failed.") +
            (String(error.message || "").includes("profit_share")
              ? " Run sql/APPLICATION_SERVICE_PLAN.sql"
              : ""),
          "error"
        );
        return;
      }
      toast(editingId ? "Service updated." : "Service added.", "success");
      modal.classList.remove("is-open");
      loadServices();
    });

    modal.querySelectorAll("[data-cancel], .a-modal-close").forEach((btn) => {
      btn.addEventListener("click", () => modal.classList.remove("is-open"));
    });

    loadServices();
  }
})();

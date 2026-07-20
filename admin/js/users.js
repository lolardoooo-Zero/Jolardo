/* ==========================================================================
   JOLARDO ADMIN — users.js
   Powers users.html: list/search/filter, create, edit, suspend, change role,
   reset password (sends a Supabase reset email), and delete.
   ========================================================================== */

(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", async () => {
    const profile = await JolardoAdmin.guard();
    if (!profile) return;
    initUsersPage(profile);
  });

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function initUsersPage(currentProfile) {
    const tbody = document.getElementById("usersTableBody");
    if (!tbody) return;

    const searchInput = document.getElementById("userSearch");
    const roleFilter = document.getElementById("userRoleFilter");
    const statusFilter = document.getElementById("userStatusFilter");
    const countTile = document.getElementById("userCountTile");
    const adminCountTile = document.getElementById("userAdminCountTile");
    const activeCountTile = document.getElementById("userActiveCountTile");
    const suspendedCountTile = document.getElementById("userSuspendedCountTile");

    const modal = document.getElementById("userModal");
    const form = document.getElementById("userForm");
    const addBtn = document.getElementById("addUserBtn");

    let allUsers = [];
    let editingId = null;

    async function load() {
      tbody.innerHTML = `<tr><td colspan="7" class="a-empty">Loading users…</td></tr>`;
      const { data, error } = await window.sb.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) { window.JolardoDB.toast("Failed to load users.", "error"); return; }
      allUsers = data || [];
      renderSummary();
      render();
    }

    function renderSummary() {
      countTile.textContent = allUsers.length.toLocaleString();
      adminCountTile.textContent = allUsers.filter((u) => u.role === "admin").length.toLocaleString();
      activeCountTile.textContent = allUsers.filter((u) => u.status === "active").length.toLocaleString();
      suspendedCountTile.textContent = allUsers.filter((u) => u.status === "suspended").length.toLocaleString();
    }

    function render() {
      const q = (searchInput.value || "").toLowerCase();
      const role = roleFilter.value;
      const status = statusFilter.value;
      const filtered = allUsers.filter((u) => {
        const matchesQ = !q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
        const matchesRole = !role || u.role === role;
        const matchesStatus = !status || u.status === status;
        return matchesQ && matchesRole && matchesStatus;
      });
      if (!filtered.length) { tbody.innerHTML = `<tr><td colspan="7" class="a-empty">No users found.</td></tr>`; return; }

      tbody.innerHTML = filtered.map((u) => `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:10px;">
              <div class="a-user-avatar" style="width:32px;height:32px;font-size:13px;">${u.full_name.charAt(0).toUpperCase()}</div>
              <div><b style="font-size:13.5px;">${escapeHtml(u.full_name)}</b></div>
            </div>
          </td>
          <td>${escapeHtml(u.email)}</td>
          <td>${escapeHtml(u.phone || "—")}</td>
          <td><span class="a-badge ${u.role === "admin" ? "completed" : "pending"}">${u.role}</span></td>
          <td><span class="a-badge ${u.status}">${u.status}</span></td>
          <td>${new Date(u.created_at).toLocaleDateString()}</td>
          <td>
            <div class="a-row-actions">
              <button class="a-icon-action" data-edit="${u.id}" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
              <button class="a-icon-action" data-reset="${u.id}" title="Send Password Reset"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><path d="M3 12a9 9 0 1 1 3 6.7"/><path d="M3 16v-4h4"/></svg></button>
              <button class="a-icon-action" data-toggle-status="${u.id}" title="${u.status === "active" ? "Suspend" : "Activate"}">
                ${u.status === "active"
                  ? `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M8 8l8 8"/></svg>`
                  : `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>`}
              </button>
              <button class="a-icon-action" data-delete="${u.id}" title="Delete" ${u.id === currentProfile.id ? "disabled style='opacity:.3;'" : ""}><svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/></svg></button>
            </div>
          </td>
        </tr>`).join("");

      tbody.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openModal(allUsers.find((u) => u.id === b.dataset.edit))));
      tbody.querySelectorAll("[data-reset]").forEach((b) => b.addEventListener("click", () => resetPassword(b.dataset.reset)));
      tbody.querySelectorAll("[data-toggle-status]").forEach((b) => b.addEventListener("click", () => toggleStatus(b.dataset.toggleStatus)));
      tbody.querySelectorAll("[data-delete]:not([disabled])").forEach((b) => b.addEventListener("click", () => deleteUser(b.dataset.delete)));
    }

    function openModal(user) {
      editingId = user ? user.id : null;
      document.getElementById("userModalTitle").textContent = user ? "Edit User" : "User details";
      form.full_name.value = user ? user.full_name : "";
      form.email.value = user ? user.email : "";
      form.email.disabled = true; // email changes must go through Supabase Auth, not editable here
      form.phone.value = user ? user.phone || "" : "";
      form.role.value = user ? user.role : "user";
      form.status.value = user ? user.status : "active";
      document.getElementById("userCreateNote").style.display = user ? "none" : "block";
      modal.classList.add("is-open");
    }

    async function resetPassword(id) {
      const user = allUsers.find((u) => u.id === id);
      if (!user) return;
      const { error } = await window.sb.auth.resetPasswordForEmail(user.email, { redirectTo: window.location.origin + "/login.html" });
      if (error) { window.JolardoDB.toast("Could not send reset email.", "error"); return; }
      window.JolardoDB.toast("Password reset link sent to " + user.email, "success");
    }

    async function toggleStatus(id) {
      const user = allUsers.find((u) => u.id === id);
      if (!user) return;
      const newStatus = user.status === "active" ? "suspended" : "active";
      const { error } = await window.sb.from("profiles").update({ status: newStatus }).eq("id", id);
      if (error) { window.JolardoDB.toast("Could not update status.", "error"); return; }
      window.JolardoDB.toast(`User ${newStatus === "suspended" ? "suspended" : "activated"}.`, "success");
      load();
    }

    async function deleteUser(id) {
      if (!confirm("Delete this user's profile record? This cannot be undone.")) return;
      const { error } = await window.sb.from("profiles").delete().eq("id", id);
      if (error) { window.JolardoDB.toast("Delete failed.", "error"); return; }
      window.JolardoDB.toast("User deleted.", "success");
      load();
    }

    addBtn.addEventListener("click", () => {
      window.JolardoDB.toast("New users register via the public /register.html page. Once registered, edit their role/status here.", "info");
    });

    document.querySelectorAll("#userModal .a-modal-close, #userModal [data-cancel]").forEach((b) => b.addEventListener("click", () => modal.classList.remove("is-open")));
    searchInput.addEventListener("input", render);
    roleFilter.addEventListener("change", render);
    statusFilter.addEventListener("change", render);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!editingId) { modal.classList.remove("is-open"); return; }
      const payload = {
        full_name: form.full_name.value.trim(),
        phone: form.phone.value.trim() || null,
        role: form.role.value,
        status: form.status.value,
      };
      if (!payload.full_name) { window.JolardoDB.toast("Full name is required.", "error"); return; }

      const { error } = await window.sb.from("profiles").update(payload).eq("id", editingId);
      if (error) { window.JolardoDB.toast("Save failed.", "error"); return; }
      window.JolardoDB.toast("User updated.", "success");
      modal.classList.remove("is-open");
      load();
    });

    load();
  }
})();

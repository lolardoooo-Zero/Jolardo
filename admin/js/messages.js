/* ==========================================================================
   JOLARDO ADMIN — messages.js
   Contact Us inbox: list, read, mark unread/read, delete.
   ========================================================================== */

(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", async () => {
    const profile = await JolardoAdmin.guard();
    if (!profile) return;
    initMessagesPage();
  });

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function initMessagesPage() {
    const tbody = document.getElementById("messagesTableBody");
    const searchInput = document.getElementById("msgSearch");
    const filterSelect = document.getElementById("msgFilter");
    const modal = document.getElementById("msgModal");
    const markAllBtn = document.getElementById("markAllReadBtn");
    const deleteBtn = document.getElementById("msgDeleteBtn");

    let allMessages = [];
    let activeId = null;

    async function load() {
      tbody.innerHTML = `<tr><td colspan="6" class="a-empty">Loading messages…</td></tr>`;
      const { data, error } = await window.sb
        .from("contact_messages")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
        window.JolardoDB.toast("Failed to load messages.", "error");
        tbody.innerHTML = `<tr><td colspan="6" class="a-empty">Could not load messages.</td></tr>`;
        return;
      }

      allMessages = data || [];
      renderSummary();
      render();
      if (window.JolardoAdmin && JolardoAdmin.refreshMessageBadge) {
        JolardoAdmin.refreshMessageBadge();
      }
    }

    function renderSummary() {
      const unread = allMessages.filter((m) => !m.is_read).length;
      const read = allMessages.length - unread;
      const today = new Date().toDateString();
      const todayCount = allMessages.filter((m) => new Date(m.created_at).toDateString() === today).length;

      document.getElementById("msgTotalTile").textContent = allMessages.length.toLocaleString();
      document.getElementById("msgUnreadTile").textContent = unread.toLocaleString();
      document.getElementById("msgReadTile").textContent = read.toLocaleString();
      document.getElementById("msgTodayTile").textContent = todayCount.toLocaleString();
    }

    function render() {
      const q = (searchInput.value || "").toLowerCase();
      const filter = filterSelect.value;

      const filtered = allMessages.filter((m) => {
        const hay = `${m.full_name} ${m.email} ${m.subject} ${m.message}`.toLowerCase();
        const matchesQ = !q || hay.includes(q);
        const matchesFilter =
          !filter ||
          (filter === "unread" && !m.is_read) ||
          (filter === "read" && m.is_read);
        return matchesQ && matchesFilter;
      });

      if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="a-empty">No messages found.</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map((m) => {
        const preview = (m.message || "").slice(0, 80) + ((m.message || "").length > 80 ? "…" : "");
        return `
        <tr style="${m.is_read ? "" : "background:rgba(212,175,55,0.06);"}">
          <td><span class="a-badge ${m.is_read ? "completed" : "pending"}">${m.is_read ? "Read" : "Unread"}</span></td>
          <td>
            <b style="display:block;font-size:13.5px;">${escapeHtml(m.full_name)}</b>
            <span style="font-size:12px;color:var(--a-muted);">${escapeHtml(m.email)}</span>
          </td>
          <td>${escapeHtml(m.subject || "General Inquiry")}</td>
          <td style="color:var(--a-ink-dim); max-width:240px;">${escapeHtml(preview)}</td>
          <td style="font-size:12.5px;white-space:nowrap;">${new Date(m.created_at).toLocaleString()}</td>
          <td>
            <div class="a-row-actions">
              <button class="a-icon-action" data-view="${m.id}" title="Open"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
              <button class="a-icon-action" data-delete="${m.id}" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/></svg></button>
            </div>
          </td>
        </tr>`;
      }).join("");

      tbody.querySelectorAll("[data-view]").forEach((btn) => {
        btn.addEventListener("click", () => openMessage(btn.dataset.view));
      });
      tbody.querySelectorAll("[data-delete]").forEach((btn) => {
        btn.addEventListener("click", () => removeMessage(btn.dataset.delete));
      });
    }

    async function openMessage(id) {
      const msg = allMessages.find((m) => String(m.id) === String(id));
      if (!msg) return;
      activeId = msg.id;

      document.getElementById("msgModalSubject").textContent = msg.subject || "General Inquiry";
      document.getElementById("msgModalFrom").textContent = msg.full_name;
      document.getElementById("msgModalContact").textContent =
        [msg.email, msg.phone].filter(Boolean).join(" · ");
      document.getElementById("msgModalDate").textContent = new Date(msg.created_at).toLocaleString();
      document.getElementById("msgModalBody").textContent = msg.message;
      document.getElementById("msgReplyBtn").href =
        `mailto:${encodeURIComponent(msg.email)}?subject=${encodeURIComponent("Re: " + (msg.subject || "Your inquiry"))}`;

      modal.classList.add("is-open");

      if (!msg.is_read) {
        const { error } = await window.sb.from("contact_messages").update({ is_read: true }).eq("id", msg.id);
        if (!error) {
          msg.is_read = true;
          renderSummary();
          render();
          if (JolardoAdmin.refreshMessageBadge) JolardoAdmin.refreshMessageBadge();
        }
      }
    }

    async function removeMessage(id) {
      if (!confirm("Delete this message permanently?")) return;
      const { error } = await window.sb.from("contact_messages").delete().eq("id", id);
      if (error) { window.JolardoDB.toast("Could not delete message.", "error"); return; }
      window.JolardoDB.toast("Message deleted.", "success");
      if (String(activeId) === String(id)) modal.classList.remove("is-open");
      load();
    }

    markAllBtn.addEventListener("click", async () => {
      const unreadIds = allMessages.filter((m) => !m.is_read).map((m) => m.id);
      if (!unreadIds.length) {
        window.JolardoDB.toast("No unread messages.", "info");
        return;
      }
      const { error } = await window.sb.from("contact_messages").update({ is_read: true }).in("id", unreadIds);
      if (error) { window.JolardoDB.toast("Could not update messages.", "error"); return; }
      window.JolardoDB.toast("All messages marked as read.", "success");
      load();
    });

    deleteBtn.addEventListener("click", () => {
      if (activeId != null) removeMessage(activeId);
    });

    searchInput.addEventListener("input", render);
    filterSelect.addEventListener("change", render);

    modal.querySelectorAll("[data-cancel], .a-modal-close").forEach((btn) => {
      btn.addEventListener("click", () => modal.classList.remove("is-open"));
    });

    load();
  }
})();

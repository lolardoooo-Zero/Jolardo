/* ==========================================================================
   JOLARDO ADMIN — admin.js
   Route guard (singleton), shell wiring, dashboard stats.
   ========================================================================== */

const JolardoAdmin = (function () {
  "use strict";

  let _guardPromise = null;
  let _shellWired = false;

  /**
   * Single shared guard — safe to call from admin.js AND page scripts.
   * Prevents the double-hide race that broke all admin buttons.
   */
  function guard() {
    if (_guardPromise) return _guardPromise;

    _guardPromise = (async () => {
      try {
        document.documentElement.style.visibility = "hidden";

        if (!window.sb) {
          window.location.replace("../login.html");
          return null;
        }

        const { data: sessionData, error: sessionErr } = await window.sb.auth.getSession();
        if (sessionErr) console.error("[admin] getSession", sessionErr);

        const session = sessionData && sessionData.session;
        if (!session) {
          window.location.replace("../login.html");
          return null;
        }

        const profile = await window.JolardoDB.getProfile(session.user.id);
        if (!profile || profile.role !== "admin" || profile.status !== "active") {
          window.location.replace("../index.html");
          return null;
        }

        document.documentElement.style.visibility = "visible";
        renderUserChip(profile);
        return profile;
      } catch (err) {
        console.error("[admin] guard failed", err);
        document.documentElement.style.visibility = "visible";
        window.JolardoDB?.toast?.("Admin session error. Try refreshing.", "error");
        return null;
      }
    })();

    return _guardPromise;
  }

  function renderUserChip(profile) {
    if (!profile) return;
    document.querySelectorAll("[data-admin-name]").forEach((el) => (el.textContent = profile.full_name));
    document.querySelectorAll("[data-admin-initial]").forEach((el) => (el.textContent = (profile.full_name || "A").charAt(0).toUpperCase()));
    document.querySelectorAll("[data-admin-role]").forEach((el) => (el.textContent = profile.role));
  }

  function wireShell() {
    if (_shellWired) return;
    _shellWired = true;

    const sidebar = document.querySelector(".a-sidebar");
    const openBtn = document.querySelector(".a-sidebar-toggle");
    const closeBtn = document.querySelector(".a-sidebar-close");
    openBtn?.addEventListener("click", () => sidebar?.classList.add("is-open"));
    closeBtn?.addEventListener("click", () => sidebar?.classList.remove("is-open"));

    const current = (location.pathname.split("/").pop() || "index.html").split("?")[0];
    document.querySelectorAll(".a-nav a").forEach((a) => {
      const href = (a.getAttribute("href") || "").split("?")[0];
      if (href === current) a.classList.add("active");
    });

    document.body.classList.remove("theme-light");
    localStorage.setItem("jolardo_admin_theme", "dark");
    const themeBtn = document.querySelector("#themeToggle");
    if (themeBtn) themeBtn.style.display = "none";

    document.querySelectorAll("[data-sign-out]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          await window.sb.auth.signOut();
        } catch (_) { /* ignore */ }
        window.location.href = "../login.html";
      });
    });

    refreshMessageBadge();
  }

  async function refreshMessageBadge() {
    const badges = document.querySelectorAll("[data-msg-badge]");
    if (!badges.length) return;
    try {
      const { count, error } = await window.sb
        .from("contact_messages")
        .select("*", { count: "exact", head: true })
        .eq("is_read", false);
      if (error) return;
      const n = count || 0;
      badges.forEach((el) => {
        if (n > 0) {
          el.style.display = "inline-flex";
          el.textContent = n > 99 ? "99+" : String(n);
        } else {
          el.style.display = "none";
        }
      });
    } catch (_) { /* ignore */ }
  }

  async function loadDashboard() {
    const els = {
      totalUsers: document.querySelector("#statTotalUsers"),
      totalRevenue: document.querySelector("#statTotalRevenue"),
      netProfit: document.querySelector("#statNetProfit"),
      totalExpenses: document.querySelector("#statTotalExpenses"),
      projects: document.querySelector("#statProjects"),
      pendingPayments: document.querySelector("#statPendingPayments"),
      completedProjects: document.querySelector("#statCompletedProjects"),
      monthlyBars: document.querySelector("#monthlyBars"),
      activityFeed: document.querySelector("#activityFeed"),
    };
    if (!els.totalRevenue) return;

    try {
      const [usersRes, incomeRes, expenseRes, projectsRes, activityRes] = await Promise.all([
        window.sb.from("profiles").select("*", { count: "exact", head: true }),
        window.sb.from("income").select("amount, income_date"),
        window.sb.from("expenses").select("amount, expense_date"),
        window.sb.from("projects").select("status, budget, amount_paid"),
        window.sb.from("activity_log").select("action, entity, created_at").order("created_at", { ascending: false }).limit(6),
      ]);

      const income = incomeRes.data || [];
      const expenses = expenseRes.data || [];
      const projects = projectsRes.data || [];

      const totalRevenue = income.reduce((sum, r) => sum + Number(r.amount), 0);
      const totalExpenses = expenses.reduce((sum, r) => sum + Number(r.amount), 0);
      const netProfit = totalRevenue - totalExpenses;
      const pendingPayments = projects.filter((p) => Number(p.budget || 0) - Number(p.amount_paid || 0) > 0.01).length;
      const completedProjects = projects.filter((p) => p.status === "completed").length;

      els.totalUsers.textContent = (usersRes.count || 0).toLocaleString();
      els.totalRevenue.textContent = window.JolardoDB.formatEGP(totalRevenue);
      els.netProfit.textContent = window.JolardoDB.formatEGP(netProfit);
      els.totalExpenses.textContent = window.JolardoDB.formatEGP(totalExpenses);
      els.projects.textContent = projects.length.toLocaleString();
      els.pendingPayments.textContent = pendingPayments.toLocaleString();
      els.completedProjects.textContent = completedProjects.toLocaleString();

      if (els.monthlyBars) {
        const months = [...Array(6)].map((_, i) => {
          const d = new Date();
          d.setMonth(d.getMonth() - (5 - i));
          return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString("en-US", { month: "short" }) };
        });
        const totals = months.map((m) => {
          const [y, mo] = m.key.split("-").map(Number);
          return income
            .filter((r) => {
              const d = new Date(r.income_date);
              return d.getFullYear() === y && d.getMonth() === mo;
            })
            .reduce((sum, r) => sum + Number(r.amount), 0);
        });
        const max = Math.max(...totals, 1);
        els.monthlyBars.innerHTML = months
          .map((m, i) => `<div class="bar" style="height:${Math.max((totals[i] / max) * 100, 6)}%" title="${m.label}: ${window.JolardoDB.formatEGP(totals[i])}"></div>`)
          .join("");
      }

      if (els.activityFeed) {
        if (!activityRes.data || !activityRes.data.length) {
          els.activityFeed.innerHTML = `<div class="a-empty">No recent activity yet.</div>`;
        } else {
          els.activityFeed.innerHTML = activityRes.data
            .map(
              (a) => `
              <div class="activity-item">
                <span class="activity-dot"></span>
                <div>
                  <b>${a.action}${a.entity ? " · " + a.entity : ""}</b>
                  <span>${new Date(a.created_at).toLocaleString()}</span>
                </div>
              </div>`
            )
            .join("");
        }
      }
    } catch (err) {
      console.error("[admin.js] dashboard load failed", err);
      window.JolardoDB.toast("Could not load dashboard data.", "error");
    }
  }

  async function init() {
    const profile = await guard();
    if (!profile) return null;
    wireShell();
    await loadDashboard();
    return profile;
  }

  return { guard, init, wireShell, refreshMessageBadge };
})();

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await JolardoAdmin.init();
  } catch (err) {
    console.error("[admin] init crash", err);
    document.documentElement.style.visibility = "visible";
  }
});

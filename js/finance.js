/* ==========================================================================
   JOLARDO — Shared finance helpers
   ========================================================================== */

const JolardoFinance = (function () {
  "use strict";

  const LOCAL_SHARES_KEY = "jolardo_admin_shares_v1";

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function readLocalShares() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_SHARES_KEY) || "{}") || {};
    } catch (_) {
      return {};
    }
  }

  function writeLocalShares(shareMap) {
    const clean = {};
    Object.entries(shareMap || {}).forEach(([id, pct]) => {
      clean[id] = round2(Math.min(100, Math.max(0, Number(pct) || 0)));
    });
    localStorage.setItem(LOCAL_SHARES_KEY, JSON.stringify(clean));
    return clean;
  }

  async function loadAccountsWithShares() {
    let accounts = [];
    let accErr = null;

    // Try join first; fall back to plain select if FK name differs
    {
      const res = await window.sb
        .from("admin_accounts")
        .select("*, profiles!admin_accounts_admin_id_fkey(full_name,email)")
        .order("id");
      if (res.error) {
        accErr = res.error;
        const res2 = await window.sb.from("admin_accounts").select("*").order("id");
        if (res2.error) throw res2.error;
        accounts = res2.data || [];

        // Attach profile names manually
        if (accounts.length) {
          const ids = accounts.map((a) => a.admin_id);
          const { data: profiles } = await window.sb
            .from("profiles")
            .select("id, full_name, email")
            .in("id", ids);
          const map = {};
          (profiles || []).forEach((p) => { map[p.id] = p; });
          accounts = accounts.map((a) => ({ ...a, profiles: map[a.admin_id] || null }));
        }
      } else {
        accounts = res.data || [];
      }
    }

    const local = readLocalShares();
    let shareMap = { ...local };

    const { data: shares, error: shareErr } = await window.sb
      .from("admin_profit_shares")
      .select("admin_id, percentage");

    if (!shareErr && shares && shares.length) {
      shares.forEach((s) => { shareMap[s.admin_id] = Number(s.percentage) || 0; });
    } else {
      (accounts || []).forEach((a) => {
        if (shareMap[a.admin_id] == null && a.profit_share_pct != null) {
          shareMap[a.admin_id] = Number(a.profit_share_pct) || 0;
        }
      });
    }

    return (accounts || []).map((a) => ({
      ...a,
      profit_share_pct: shareMap[a.admin_id] != null ? Number(shareMap[a.admin_id]) : 0,
    }));
  }

  /**
   * Always persists locally first (so Save never "does nothing"),
   * then tries DB tables. Returns { mode, total }.
   */
  async function saveShares(shareMap) {
    const entries = Object.entries(shareMap || {}).map(([adminId, pct]) => ({
      admin_id: adminId,
      percentage: round2(Math.min(100, Math.max(0, Number(pct) || 0))),
      updated_at: new Date().toISOString(),
    }));

    if (!entries.length) throw new Error("No admin shares to save.");

    const total = entries.reduce((s, e) => s + e.percentage, 0);
    if (total > 100.01) throw new Error("Total shares cannot exceed 100%.");

    // 1) Always save locally so UI works even without migrations
    const localMap = {};
    entries.forEach((e) => { localMap[e.admin_id] = e.percentage; });
    writeLocalShares(localMap);

    // 2) Try dedicated shares table
    const { error: upsertErr } = await window.sb
      .from("admin_profit_shares")
      .upsert(entries, { onConflict: "admin_id" });

    if (!upsertErr) {
      // best-effort mirror
      await Promise.all(entries.map((e) =>
        window.sb.from("admin_accounts").update({ profit_share_pct: e.percentage }).eq("admin_id", e.admin_id)
      ));
      return { mode: "db", total, local: false };
    }

    // 3) Try column on admin_accounts
    let columnOk = true;
    for (const e of entries) {
      const { error } = await window.sb
        .from("admin_accounts")
        .update({ profit_share_pct: e.percentage })
        .eq("admin_id", e.admin_id);
      if (error) { columnOk = false; break; }
    }
    if (columnOk) return { mode: "column", total, local: false };

    // 4) Local-only success (still a successful Save for the user)
    return {
      mode: "local",
      total,
      local: true,
      warning: "Saved in this browser. Run sql/migration_v4.sql in Supabase to sync for all admins.",
    };
  }

  async function distributeByShares({ amount, direction, description, createdBy }) {
    const amt = round2(amount);
    if (!amt || amt <= 0) return { distributed: 0, skipped: true };

    const accounts = await loadAccountsWithShares();
    const active = accounts.filter((a) => Number(a.profit_share_pct) > 0);
    if (!active.length) return { distributed: 0, skipped: true, reason: "no_shares" };

    let distributed = 0;
    for (const acc of active) {
      const slice = round2(amt * (Number(acc.profit_share_pct) / 100));
      if (slice <= 0) continue;

      const type = direction === "debit" ? "withdrawal" : "profit_allocation";
      const { error } = await window.sb.from("transactions").insert([{
        admin_id: acc.admin_id,
        amount: slice,
        description: description || (direction === "debit" ? "Expense share" : "Profit share"),
        type,
        status: "completed",
        created_by: createdBy || null,
      }]);
      if (error) throw error;

      const prev = Number(acc.profit_share || 0);
      const next = direction === "debit" ? round2(prev - slice) : round2(prev + slice);
      await window.sb.from("admin_accounts").update({ profit_share: next }).eq("admin_id", acc.admin_id);

      distributed = round2(distributed + slice);
    }

    return { distributed, skipped: false };
  }

  async function onProjectCompleted(project, createdBy) {
    if (!project || !project.id) return { incomeAdded: 0 };

    const budget = Number(project.budget) || 0;
    const { data: existingIncome } = await window.sb
      .from("income")
      .select("amount")
      .eq("project_id", project.id);

    const already = (existingIncome || []).reduce((s, r) => s + Number(r.amount), 0);
    const gap = round2(Math.max(budget - already, 0));

    if (gap > 0) {
      const { error: incErr } = await window.sb.from("income").insert([{
        amount: gap,
        category: "Project Completion",
        payment_method: "bank_transfer",
        notes: `Auto: project completed — ${project.name}`,
        project_id: project.id,
        income_date: new Date().toISOString().slice(0, 10),
        created_by: createdBy || null,
      }]);
      if (incErr) throw incErr;

      await window.sb.from("projects").update({
        amount_paid: budget,
        progress_pct: 100,
        current_phase: "Completed",
      }).eq("id", project.id);

      const dist = await distributeByShares({
        amount: gap,
        direction: "credit",
        description: `Project complete share — ${project.name}`,
        createdBy,
      });

      return { incomeAdded: gap, ...dist };
    }

    await window.sb.from("projects").update({
      amount_paid: Math.max(Number(project.amount_paid) || 0, already),
      progress_pct: 100,
    }).eq("id", project.id);

    return { incomeAdded: 0, skipped: true };
  }

  async function onExpenseAdded(amount, description, createdBy) {
    return distributeByShares({
      amount,
      direction: "debit",
      description: description ? `Expense share — ${description}` : "Expense share",
      createdBy,
    });
  }

  async function onIncomeAdded(amount, description, createdBy) {
    return distributeByShares({
      amount,
      direction: "credit",
      description: description ? `Income share — ${description}` : "Income share",
      createdBy,
    });
  }

  return {
    loadAccountsWithShares,
    saveShares,
    distributeByShares,
    onProjectCompleted,
    onExpenseAdded,
    onIncomeAdded,
    round2,
    readLocalShares,
  };
})();

window.JolardoFinance = JolardoFinance;

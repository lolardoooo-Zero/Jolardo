/* ==========================================================================
   JOLARDO — Supabase Client Bootstrap
   Loaded on every page BEFORE any other page script.
   Uses the Supabase JS CDN build (no bundler / no frameworks).
   ========================================================================== */

// 1) Replace these with your project's values (Project Settings > API).
//    The anon/public key is safe to expose on the client — Row Level Security
//    in sql/database.sql is what actually protects the data.
const SUPABASE_URL = "https://nxmpzhvloxqipyputxvw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54bXB6aHZsb3hxaXB5cHV0eHZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNzEwNDEsImV4cCI6MjA5OTk0NzA0MX0.ibG3B3_CcXmLUGOwhQBwKp9Fw4o_jUv-rba6sj-vyzM";

// 2) Create a single shared client for the whole site.
const { createClient } = supabase; // `supabase` global comes from the CDN script tag
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/* ---------------------------------------------------------------------
   Shared helpers used by auth.js, contact.js, admin/*.js
   --------------------------------------------------------------------- */
const JolardoDB = {
  /** Returns the current session (or null). */
  async getSession() {
    const { data, error } = await sb.auth.getSession();
    if (error) { console.error("[supabase] getSession", error); return null; }
    return data.session;
  },

  /** Returns the logged-in user's row from `profiles` (id, full_name, role, status...). */
  async getProfile(userId) {
    const { data, error } = await sb
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (error) { console.error("[supabase] getProfile", error); return null; }
    return data;
  },

  /** True only if the current user exists, is active, and role = admin. */
  async isAdmin() {
    const session = await this.getSession();
    if (!session) return false;
    const profile = await this.getProfile(session.user.id);
    return !!profile && profile.role === "admin" && profile.status === "active";
  },

  /** Formats a number as Egyptian Pound currency, e.g. "EGP 20,000". */
  formatEGP(amount) {
    const n = Number(amount || 0);
    return "EGP " + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  },

  /** Small toast/notification renderer used across the whole site + admin panel. */
  toast(message, type = "info") {
    let wrap = document.querySelector(".jl-toast-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "jl-toast-wrap";
      document.body.appendChild(wrap);
    }
    const el = document.createElement("div");
    el.className = `jl-toast ${type}`;
    el.textContent = message;
    wrap.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .4s ease, transform .4s ease";
      el.style.opacity = "0";
      el.style.transform = "translateX(20px)";
      setTimeout(() => el.remove(), 400);
    }, 3600);
  },
};

// Guard against double-loading on pages that include supabase.js twice.
window.sb = sb;
window.JolardoDB = JolardoDB;

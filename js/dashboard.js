/* ==========================================================================
   JOLARDO Front-End — dashboard.js
   Route guard, project loader, and profile manager for client-dashboard.html.
   ========================================================================== */

(function () {
  "use strict";

  const PHASES = ["Briefing", "Research & Moodboard", "Concept Design", "Revisions", "Handover", "Completed"];

  document.addEventListener("DOMContentLoaded", async () => {
    // 1. Guard route: hide page by default
    document.documentElement.style.visibility = "hidden";

    if (!window.sb) {
      window.location.replace("login.html");
      return;
    }

    const { data: sessionData } = await window.sb.auth.getSession();
    const session = sessionData && sessionData.session;
    if (!session) {
      window.location.replace("login.html");
      return;
    }

    const profile = await window.JolardoDB.getProfile(session.user.id);
    if (!profile) {
      window.location.replace("login.html");
      return;
    }

    if (profile.status !== "active") {
      await window.sb.auth.signOut();
      window.location.replace("login.html");
      return;
    }

    if (profile.role === "admin") {
      // Admins belong in the admin panel
      window.location.replace("admin/index.html");
      return;
    }

    // Show workspace and boot
    document.documentElement.style.visibility = "visible";
    initDashboard(profile);
  });

  async function initDashboard(profile) {
    // Welcome & greeting
    document.getElementById("userGreetingName").textContent = profile.full_name;
    
    // Wire Sign Out
    document.getElementById("signOutBtn").addEventListener("click", async () => {
      await window.sb.auth.signOut();
      window.location.replace("login.html");
    });

    // Populate Settings forms
    const profileForm = document.getElementById("profileForm");
    profileForm.full_name.value = profile.full_name;
    profileForm.phone.value = profile.phone || "";

    // Load active projects
    await loadClientProjects(profile.id);

    // Wire Forms
    profileForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const newName = profileForm.full_name.value.trim();
      const newPhone = profileForm.phone.value.trim() || null;

      if (!newName) {
        window.JolardoDB.toast("Name cannot be empty.", "error");
        return;
      }

      const { error } = await window.sb
        .from("profiles")
        .update({ full_name: newName, phone: newPhone })
        .eq("id", profile.id);

      if (error) {
        window.JolardoDB.toast("Failed to update profile.", "error");
        return;
      }

      window.JolardoDB.toast("Profile details updated successfully.", "success");
      document.getElementById("userGreetingName").textContent = newName;
    });

    const passwordForm = document.getElementById("passwordForm");
    passwordForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const newPw = passwordForm.new_password.value;
      const confPw = passwordForm.confirm_password.value;

      if (newPw.length < 8) {
        window.JolardoDB.toast("Password must be at least 8 characters.", "error");
        return;
      }
      if (newPw !== confPw) {
        window.JolardoDB.toast("Passwords do not match.", "error");
        return;
      }

      const { error } = await window.sb.auth.updateUser({ password: newPw });
      if (error) {
        window.JolardoDB.toast(error.message || "Failed to update password.", "error");
        return;
      }

      window.JolardoDB.toast("Password updated successfully.", "success");
      passwordForm.reset();
    });
  }

  async function loadClientProjects(clientId) {
    const dashWorkspace = document.getElementById("dashWorkspace");
    const dashEmptyState = document.getElementById("dashEmptyState");

    try {
      const { data: projects, error } = await window.sb
        .from("projects")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (!projects || !projects.length) {
        // Show empty state
        dashWorkspace.style.display = "none";
        dashEmptyState.style.display = "block";
        return;
      }

      // Show project workspace
      dashEmptyState.style.display = "none";
      dashWorkspace.style.display = "grid";

      // Select active project (the newest one)
      const activeProj = projects[0];
      
      // Update basic fields
      document.getElementById("projClientBrand").textContent = (activeProj.client_name || "Identity").toUpperCase();
      document.getElementById("projNameTitle").textContent = activeProj.name;
      document.getElementById("projProgressPct").textContent = activeProj.progress_pct + "%";
      document.getElementById("projProgressFill").style.width = activeProj.progress_pct + "%";
      
      document.getElementById("projStatusLabel").textContent = activeProj.status.replace("_", " ");
      document.getElementById("projStatusNotesText").textContent = activeProj.status_notes || "Our design directors are current finalizing the visual brief.";

      document.getElementById("specBudget").textContent = window.JolardoDB.formatEGP(activeProj.budget);
      document.getElementById("specStarted").textContent = activeProj.started_at ? new Date(activeProj.started_at).toLocaleDateString("en-US", { dateStyle: "medium" }) : "Pending";
      document.getElementById("specDue").textContent = activeProj.due_at ? new Date(activeProj.due_at).toLocaleDateString("en-US", { dateStyle: "medium" }) : "Pending";

      // Update Stepper Timeline Highlight
      updateTimelineStepper(activeProj.current_phase);

    } catch (err) {
      console.error("Failed to load client projects", err);
      dashWorkspace.style.display = "none";
      dashEmptyState.style.display = "block";
    }
  }

  function updateTimelineStepper(currentPhase) {
    const steps = document.querySelectorAll(".timeline-step");
    const phaseIndex = PHASES.indexOf(currentPhase);

    steps.forEach((step, idx) => {
      // Step phases are mapped in order of index (0: Briefing, 1: Research, 2: Concept Design, 3: Revisions, 4: Handover)
      // Current phase is checked against these indices.
      step.classList.remove("completed", "active");
      
      if (idx < phaseIndex) {
        step.classList.add("completed");
      } else if (idx === phaseIndex) {
        step.classList.add("active");
      }
    });

    // If currentPhase is "Completed" (index 5), all steps 0..4 should be marked completed!
    if (currentPhase === "Completed") {
      steps.forEach((step) => step.classList.add("completed"));
    }
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
})();

/* ==========================================================================
   JOLARDO — auth.js
   Powers login.html and register.html: Supabase Auth sign-in / sign-up,
   forgot-password modal, live password validation, and "remember me".
   ========================================================================== */

(function () {
  "use strict";

  const showError = (input, msg) => {
    const group = input.closest(".form-group");
    if (!group) return;
    const err = group.querySelector(".form-error");
    if (err) err.textContent = msg || "";
  };

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /* ---------------------------------------------------------------
     Password strength: length, upper/lower, number, symbol
     --------------------------------------------------------------- */
  function evaluatePassword(pw) {
    const checks = {
      length: pw.length >= 8,
      upper: /[A-Z]/.test(pw),
      lower: /[a-z]/.test(pw),
      number: /[0-9]/.test(pw),
      symbol: /[^A-Za-z0-9]/.test(pw),
    };
    const score = Object.values(checks).filter(Boolean).length;
    return { checks, score };
  }

  function wirePasswordMeter(input) {
    const wrap = input.closest(".form-group");
    if (!wrap) return;
    const meterFill = wrap.querySelector(".pw-meter-fill");
    const hintItems = wrap.querySelectorAll(".pw-hint li");

    input.addEventListener("input", () => {
      const { checks, score } = evaluatePassword(input.value);
      if (meterFill) {
        const pct = (score / 5) * 100;
        meterFill.style.width = pct + "%";
        meterFill.style.background =
          score <= 2 ? "#c9645f" : score <= 4 ? "linear-gradient(90deg,#d4af37,#f0d78c)" : "linear-gradient(90deg,#8fbf8f,#d4af37)";
      }
      hintItems.forEach((li) => {
        const key = li.dataset.check;
        li.classList.toggle("ok", !!checks[key]);
      });
    });
  }

  /* ---------------------------------------------------------------
     Show / hide password
     --------------------------------------------------------------- */
  document.querySelectorAll(".pw-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const isPw = input.type === "password";
      input.type = isPw ? "text" : "password";
      btn.textContent = isPw ? "Hide" : "Show";
    });
  });

  /* ---------------------------------------------------------------
     LOGIN FORM
     --------------------------------------------------------------- */
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    const email = document.getElementById("lEmail");
    const password = document.getElementById("lPassword");
    const remember = document.getElementById("lRemember");
    const submitBtn = document.getElementById("lSubmit");

    // Restore remembered email
    const rememberedEmail = localStorage.getItem("jolardo_remember_email");
    if (rememberedEmail && email) {
      email.value = rememberedEmail;
      if (remember) remember.checked = true;
    }

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      let valid = true;
      if (!emailPattern.test(email.value.trim())) { showError(email, "Enter a valid email."); valid = false; } else showError(email, "");
      if (!password.value) { showError(password, "Password is required."); valid = false; } else showError(password, "");
      if (!valid) return;

      submitBtn.disabled = true;
      submitBtn.textContent = "Signing in...";

      try {
        const { data, error } = await window.sb.auth.signInWithPassword({
          email: email.value.trim(),
          password: password.value,
        });
        if (error) throw error;

        if (remember && remember.checked) {
          localStorage.setItem("jolardo_remember_email", email.value.trim());
        } else {
          localStorage.removeItem("jolardo_remember_email");
        }

        const profile = await window.JolardoDB.getProfile(data.user.id);
        if (!profile) throw new Error("Profile not found.");
        if (profile.status !== "active") {
          await window.sb.auth.signOut();
          throw new Error("Your account is suspended. Contact support.");
        }

        window.JolardoDB.toast("Welcome back, " + profile.full_name.split(" ")[0] + ".", "success");
        setTimeout(() => {
          window.location.href = profile.role === "admin" ? "admin/index.html" : "dashboard.html";
        }, 700);
      } catch (err) {
        console.error("[auth.js] login failed", err);
        window.JolardoDB.toast(err.message || "Login failed. Check your credentials.", "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Sign In";
      }
    });
  }

  /* ---------------------------------------------------------------
     FORGOT PASSWORD (modal)
     --------------------------------------------------------------- */
  const forgotLink = document.getElementById("forgotLink");
  const forgotBackdrop = document.getElementById("forgotBackdrop");
  const forgotForm = document.getElementById("forgotForm");
  if (forgotLink && forgotBackdrop) {
    const open = () => forgotBackdrop.classList.add("is-open");
    const close = () => forgotBackdrop.classList.remove("is-open");
    forgotLink.addEventListener("click", (e) => { e.preventDefault(); open(); });
    forgotBackdrop.addEventListener("click", (e) => { if (e.target === forgotBackdrop) close(); });
    document.querySelectorAll(".jl-modal-close").forEach((b) => b.addEventListener("click", close));

    forgotForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fEmail = document.getElementById("fEmail");
      if (!emailPattern.test(fEmail.value.trim())) { showError(fEmail, "Enter a valid email."); return; }
      showError(fEmail, "");
      try {
        const { error } = await window.sb.auth.resetPasswordForEmail(fEmail.value.trim(), {
          redirectTo: window.location.origin + "/login.html",
        });
        if (error) throw error;
        window.JolardoDB.toast("Password reset link sent — check your inbox.", "success");
        close();
      } catch (err) {
        window.JolardoDB.toast(err.message || "Could not send reset email.", "error");
      }
    });
  }

  /* ---------------------------------------------------------------
     REGISTER FORM
     --------------------------------------------------------------- */
  const registerForm = document.getElementById("registerForm");
  if (registerForm) {
    const fullName = document.getElementById("rFullName");
    const rEmail = document.getElementById("rEmail");
    const phone = document.getElementById("rPhone");
    const password = document.getElementById("rPassword");
    const confirm = document.getElementById("rConfirm");
    const terms = document.getElementById("rTerms");
    const submitBtn = document.getElementById("rSubmit");
    const verifyBanner = document.getElementById("verifyBanner");

    wirePasswordMeter(password);

    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      let valid = true;

      if (!fullName.value.trim() || fullName.value.trim().length < 2) { showError(fullName, "Enter your full name."); valid = false; } else showError(fullName, "");
      if (!emailPattern.test(rEmail.value.trim())) { showError(rEmail, "Enter a valid email."); valid = false; } else showError(rEmail, "");
      if (phone.value.trim() && !/^[0-9+\-\s()]{7,20}$/.test(phone.value.trim())) { showError(phone, "Enter a valid phone number."); valid = false; } else showError(phone, "");

      const { score } = evaluatePassword(password.value);
      if (score < 4) { showError(password, "Password is too weak — use 8+ chars, upper/lowercase, a number, and a symbol."); valid = false; } else showError(password, "");

      if (confirm.value !== password.value || !confirm.value) { showError(confirm, "Passwords do not match."); valid = false; } else showError(confirm, "");

      if (terms && !terms.checked) { showError(terms, "Please accept the Terms to continue."); valid = false; } else if (terms) showError(terms, "");

      if (!valid) return;

      submitBtn.disabled = true;
      submitBtn.textContent = "Creating account...";

      try {
        const { data, error } = await window.sb.auth.signUp({
          email: rEmail.value.trim(),
          password: password.value,
          options: {
            data: { full_name: fullName.value.trim(), phone: phone.value.trim() || null },
            emailRedirectTo: window.location.origin + "/login.html",
          },
        });
        if (error) throw error;

        // The `handle_new_user` trigger (see sql/database.sql) auto-creates the
        // matching row in `profiles` with role='user' and status='active'.
        if (verifyBanner) verifyBanner.classList.add("is-visible");
        window.JolardoDB.toast("Account created — check your email to verify.", "success");
        registerForm.reset();
      } catch (err) {
        console.error("[auth.js] register failed", err);
        window.JolardoDB.toast(err.message || "Could not create account.", "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Create Account";
      }
    });
  }
})();

/* ==========================================================================
   JOLARDO — app.js
   Shared front-end behavior for every public page: navbar, mobile menu,
   scroll-reveal animation, animated counters, and session-aware nav actions.
   ========================================================================== */

(function () {
  "use strict";

  /* ---------- Navbar scroll state ---------- */
  const navbar = document.querySelector(".navbar");
  const onScroll = () => {
    if (!navbar) return;
    navbar.classList.toggle("is-scrolled", window.scrollY > 40);
  };
  document.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile nav toggle ---------- */
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", () => {
      toggle.classList.toggle("is-open");
      links.classList.toggle("is-open");
    });
    links.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => {
        toggle.classList.remove("is-open");
        links.classList.remove("is-open");
      })
    );
  }

  /* ---------- Highlight active nav link ---------- */
  const current = (location.pathname.split("/").pop() || "index.html");
  document.querySelectorAll(".nav-links a").forEach((a) => {
    const href = a.getAttribute("href");
    if (href === current || (current === "" && href === "index.html")) {
      a.classList.add("active");
    }
  });

  /* ---------- Scroll reveal ---------- */
  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealEls.length) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    revealEls.forEach((el, i) => {
      el.style.setProperty("--i", i % 6);
      io.observe(el);
    });
  } else {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }

  /* ---------- Animated counters (data-count="1250") ---------- */
  const counters = document.querySelectorAll("[data-count]");
  if (counters.length) {
    const animateCount = (el) => {
      const target = parseFloat(el.dataset.count);
      const suffix = el.dataset.suffix || "";
      const duration = 1600;
      const start = performance.now();
      const step = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const value = Math.floor(target * eased);
        el.textContent = value.toLocaleString("en-US") + suffix;
        if (progress < 1) requestAnimationFrame(step);
        else el.textContent = target.toLocaleString("en-US") + suffix;
      };
      requestAnimationFrame(step);
    };
    if ("IntersectionObserver" in window) {
      const cio = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              animateCount(entry.target);
              cio.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.5 }
      );
      counters.forEach((el) => cio.observe(el));
    } else {
      counters.forEach(animateCount);
    }
  }

  /* ---------- Nav actions: swap Login/Register for a "Dashboard" link if signed in ---------- */
  async function reflectAuthState() {
    const actions = document.querySelector(".nav-actions");
    if (!actions || !window.sb) return;
    try {
      const { data } = await window.sb.auth.getSession();
      if (data && data.session) {
        const profile = await window.JolardoDB.getProfile(data.session.user.id);
        actions.innerHTML = `
          <a class="btn btn-ghost btn-sm" href="${profile && profile.role === "admin" ? "admin/index.html" : "dashboard.html"}">
            ${profile ? profile.full_name.split(" ")[0] : "Account"}
          </a>
          <button class="btn btn-gold btn-sm" id="navSignOut" type="button">Sign Out</button>
        `;
        document.getElementById("navSignOut").addEventListener("click", async () => {
          await window.sb.auth.signOut();
          window.location.href = "login.html";
        });
      }
    } catch (err) {
      console.warn("[app.js] auth state check skipped:", err.message);
    }
  }
  if (window.sb) reflectAuthState();
})();

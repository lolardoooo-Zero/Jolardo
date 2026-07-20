/* ==========================================================================
   JOLARDO — about.js
   Page-specific behavior for about.html. Base nav/reveal/counter logic
   lives in app.js and runs automatically on every page that includes it.
   ========================================================================== */

(function () {
  "use strict";

  // Subtle parallax tilt on the story figure, mouse-driven, desktop only.
  const figure = document.querySelector(".story-figure");
  if (figure && window.matchMedia("(pointer: fine)").matches) {
    figure.addEventListener("mousemove", (e) => {
      const rect = figure.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      figure.style.transform = `perspective(800px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg)`;
    });
    figure.addEventListener("mouseleave", () => {
      figure.style.transform = "none";
    });
  }
})();

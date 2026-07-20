/* ==========================================================================
   JOLARDO — contact.js
   Validates the contact form and submits it to Supabase (contact_messages).
   ========================================================================== */

(function () {
  "use strict";

  const form = document.getElementById("contactForm");
  if (!form) return;

  const fields = {
    full_name: form.querySelector("#cFullName"),
    email: form.querySelector("#cEmail"),
    phone: form.querySelector("#cPhone"),
    subject: form.querySelector("#cSubject"),
    message: form.querySelector("#cMessage"),
  };
  const submitBtn = form.querySelector("#cSubmit");

  const showError = (input, msg) => {
    const err = input.closest(".form-group").querySelector(".form-error");
    if (err) err.textContent = msg || "";
  };

  const validate = () => {
    let valid = true;

    if (!fields.full_name.value.trim() || fields.full_name.value.trim().length < 2) {
      showError(fields.full_name, "Please enter your full name.");
      valid = false;
    } else showError(fields.full_name, "");

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(fields.email.value.trim())) {
      showError(fields.email, "Please enter a valid email address.");
      valid = false;
    } else showError(fields.email, "");

    if (fields.phone.value.trim() && !/^[0-9+\-\s()]{7,20}$/.test(fields.phone.value.trim())) {
      showError(fields.phone, "Please enter a valid phone number.");
      valid = false;
    } else showError(fields.phone, "");

    if (!fields.message.value.trim() || fields.message.value.trim().length < 10) {
      showError(fields.message, "Message should be at least 10 characters.");
      valid = false;
    } else showError(fields.message, "");

    return valid;
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validate()) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";

    try {
      const { error } = await window.sb.from("contact_messages").insert([
        {
          full_name: fields.full_name.value.trim(),
          email: fields.email.value.trim(),
          phone: fields.phone.value.trim() || null,
          subject: fields.subject.value.trim() || "General Inquiry",
          message: fields.message.value.trim(),
        },
      ]);

      if (error) throw error;

      window.JolardoDB.toast("Message sent — we'll reply within one business day.", "success");
      form.reset();
    } catch (err) {
      console.error("[contact.js] submit failed", err);
      window.JolardoDB.toast("Something went wrong. Please try again.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send Message";
    }
  });
})();

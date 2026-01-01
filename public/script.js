document.addEventListener("DOMContentLoaded", () => {
  const buttons = document.querySelectorAll(".tab-button");
  const sections = document.querySelectorAll(".content-section");

  function showSection(id) {
    sections.forEach((s) => (s.style.display = "none"));
    buttons.forEach((b) => b.classList.remove("active"));

    const targetSect = document.getElementById(`sect-${id}`);
    const targetBtn = document.querySelector(`[data-section="${id}"]`);

    if (targetSect && targetBtn) {
      targetSect.style.display = "block";
      targetBtn.classList.add("active");
      window.location.hash = id;
    }
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => showSection(btn.dataset.section));
  });

  // KEYBOARD SHORTCUTS
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    const key = e.key.toLowerCase();
    const map = { a: "about", c: "cv", p: "papers" };

    if (map[key]) {
      e.preventDefault();
      showSection(map[key]);
    }
  });

  // Handle Browser History
  const init = () => showSection(window.location.hash.substring(1) || "about");
  window.addEventListener("popstate", init);
  init();
});

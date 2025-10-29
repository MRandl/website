document.addEventListener("DOMContentLoaded", () => {
  const nav = document.getElementById("tab-navigation");
  const contentArea = document.getElementById("content-area");
  const defaultSectionId = "about";
  // Cache to store loaded HTML content
  const contentCache = {};
  let currentSectionId = null;

  function getCurrentHashSectionId() {
    const hash = window.location.hash.substring(1);
    return hash || defaultSectionId;
  }

  async function switchSection(sectionId, updateHistory = true) {
    if (sectionId === currentSectionId) return;

    if (updateHistory) {
      history.replaceState(null, "", "#" + sectionId);
    }

    // 1. Update button styles
    nav.querySelectorAll(".tab-button").forEach((btn) => {
      btn.classList.remove("active");
      if (btn.getAttribute("data-section") === sectionId) {
        btn.classList.add("active");
      }
    });

    currentSectionId = sectionId;

    // 2. Load content (from cache or network)
    if (!contentCache[sectionId]) {
      try {
        // Fetch the HTML fragment
        const response = await fetch(`${sectionId}.html`);
        if (!response.ok) throw new Error(`Failed to load ${sectionId}.html`);

        const htmlContent = await response.text();
        contentCache[sectionId] = htmlContent;
      } catch (error) {
        console.error("Error loading content:", error);
        contentArea.innerHTML = `<div class="p-6 md:p-10 text-red-400">Error loading content for ${sectionId}.</div>`;
        return;
      }
    }

    // 3. Insert content with animation
    // Use a slight delay to trigger the CSS transition/animation
    contentArea.style.opacity = "0";
    contentArea.style.transform = "translateY(10px)";

    setTimeout(() => {
      contentArea.innerHTML = contentCache[sectionId];
      contentArea.style.opacity = "1";
      contentArea.style.transform = "translateY(0)";
    }, 100);
  }

  // --- Initialization ---

  const initialSectionId = getCurrentHashSectionId();
  switchSection(initialSectionId, false);

  // --- Event Listeners ---

  // Navigation click handler
  nav.addEventListener("click", (event) => {
    const target = event.target.closest(".tab-button");
    if (target) {
      const sectionId = target.getAttribute("data-section");
      switchSection(sectionId);
    }
  });

  // Handle browser back/forward buttons
  window.addEventListener("popstate", () => {
    const newSectionId = getCurrentHashSectionId();
    switchSection(newSectionId, false);
  });

  // Keyboard shortcut handler
  document.addEventListener("keydown", (e) => {
    const activeEl = document.activeElement;
    const tag = activeEl && activeEl.tagName;

    if (e.ctrlKey || e.altKey || e.metaKey) {
      return;
    }
    if (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      (activeEl && activeEl.isContentEditable)
    ) {
      return;
    }

    const key = (e.key || "").toLowerCase();
    const map = { a: "about", c: "cv", p: "papers" };

    if (map[key]) {
      e.preventDefault();
      switchSection(map[key]);
    }
  });
});

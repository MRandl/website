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

      // If blog section, load the blog posts
      if (sectionId === "blog") {
        loadBlogPosts();
        setupFilterToggle();
      }
    }, 100);
  }

  function setupFilterToggle() {
    const toggleBtn = document.getElementById("toggle-filters-button");
    const filtersContainer = document.getElementById("blog-filters-container");

    if (!toggleBtn || !filtersContainer) return;

    toggleBtn.addEventListener("click", () => {
      const isHidden = filtersContainer.classList.contains("hidden");

      if (isHidden) {
        filtersContainer.classList.remove("hidden");
        toggleBtn.querySelector("span").textContent = "Hide filters";
        toggleBtn.querySelector("svg").style.transform = "rotate(180deg)";
      } else {
        filtersContainer.classList.add("hidden");
        toggleBtn.querySelector("span").textContent = "Show filters";
        toggleBtn.querySelector("svg").style.transform = "rotate(0deg)";
      }
    });
  }

  let allBlogPosts = [];
  let selectedTags = new Set();
  let searchQuery = "";

  async function loadBlogPosts() {
    const container = document.getElementById("blog-posts-container");
    if (!container) return;

    try {
      const response = await fetch("blog/metadata.json");
      if (!response.ok) throw new Error("Failed to load blog metadata");

      const data = await response.json();
      allBlogPosts = data.posts || [];

      if (allBlogPosts.length === 0) {
        container.innerHTML =
          '<div class="text-gray-400">No posts yet. Check back soon!</div>';
        return;
      }

      // Sort posts by date (newest first)
      allBlogPosts.sort((a, b) => new Date(b.date) - new Date(a.date));

      // Build tag filter UI
      buildTagFilters();

      // Set up search input listener
      const searchInput = document.getElementById("blog-search-input");
      if (searchInput) {
        searchInput.addEventListener("input", (e) => {
          searchQuery = e.target.value.toLowerCase();
          renderBlogPosts();
        });
      }

      // Initial render
      renderBlogPosts();
    } catch (error) {
      console.error("Error loading blog posts:", error);
      container.innerHTML =
        '<div class="text-red-400">Error loading blog posts. Please try again later.</div>';
    }
  }

  function buildTagFilters() {
    const tagsContainer = document.getElementById("blog-tags-container");
    if (!tagsContainer) return;

    // Collect all unique tags
    const allTags = new Set();
    allBlogPosts.forEach((post) => {
      if (post.tags && post.tags.length > 0) {
        post.tags.forEach((tag) => allTags.add(tag));
      }
    });

    if (allTags.size === 0) {
      tagsContainer.innerHTML =
        '<div class="text-gray-500 text-sm">No tags available</div>';
      return;
    }

    // Create tag buttons
    const sortedTags = Array.from(allTags).sort();
    tagsContainer.innerHTML = sortedTags
      .map((tag) => {
        const isSelected = selectedTags.has(tag);
        return `
        <button
          class="tag-filter-btn px-3 py-1 rounded-full text-sm transition-colors ${
            isSelected
              ? "bg-indigo-600 text-white"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }"
          data-tag="${tag}"
        >
          ${tag}
        </button>
      `;
      })
      .join("");

    // Add click handlers
    tagsContainer.querySelectorAll(".tag-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tag = btn.getAttribute("data-tag");
        if (selectedTags.has(tag)) {
          selectedTags.delete(tag);
        } else {
          selectedTags.add(tag);
        }
        buildTagFilters();
        renderBlogPosts();
        updateClearButton();
      });
    });

    updateClearButton();
  }

  function updateClearButton() {
    const clearBtn = document.getElementById("clear-tags-button");
    if (!clearBtn) return;

    if (selectedTags.size > 0) {
      clearBtn.classList.remove("hidden");
      clearBtn.onclick = () => {
        selectedTags.clear();
        buildTagFilters();
        renderBlogPosts();
        updateClearButton();
      };
    } else {
      clearBtn.classList.add("hidden");
    }
  }

  function renderBlogPosts() {
    const container = document.getElementById("blog-posts-container");
    if (!container) return;

    // Filter posts
    let filteredPosts = allBlogPosts;

    // Filter by tags
    if (selectedTags.size > 0) {
      filteredPosts = filteredPosts.filter((post) => {
        if (!post.tags || post.tags.length === 0) return false;
        return Array.from(selectedTags).some((tag) => post.tags.includes(tag));
      });
    }

    // Filter by search query
    if (searchQuery) {
      filteredPosts = filteredPosts.filter((post) => {
        const titleMatch = post.title.toLowerCase().includes(searchQuery);
        const summaryMatch = post.summary.toLowerCase().includes(searchQuery);
        return titleMatch || summaryMatch;
      });
    }

    // Render filtered posts
    if (filteredPosts.length === 0) {
      container.innerHTML =
        '<div class="text-gray-400">No posts match your filters.</div>';
      return;
    }

    container.innerHTML = filteredPosts
      .map((post) => {
        const date = new Date(post.date).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });

        const tags =
          post.tags && post.tags.length > 0
            ? post.tags
                .map(
                  (tag) =>
                    `<span class="inline-block bg-indigo-900/30 text-indigo-300 px-2 py-1 rounded text-xs">${tag}</span>`,
                )
                .join(" ")
            : "";

        return `
          <article class="border border-gray-700 rounded-lg p-6 hover:border-indigo-500 transition-colors">
            <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
              <h3 class="text-xl font-semibold text-white">
                <a href="blog-post.html#${post.id}" class="hover:text-indigo-400 transition-colors">
                  ${post.title}
                </a>
              </h3>
              <time class="text-sm text-gray-400 whitespace-nowrap">${date}</time>
            </div>
            <p class="text-gray-300 mb-4">${post.summary}</p>
            ${tags ? `<div class="flex flex-wrap gap-2 mb-4">${tags}</div>` : ""}
            <a href="blog-post.html#${post.id}" class="text-indigo-400 hover:text-indigo-300 text-sm font-medium">
              Read more →
            </a>
          </article>
        `;
      })
      .join("");
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

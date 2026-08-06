document.addEventListener("DOMContentLoaded", () => {
  const mobileToggle = document.querySelector(".mobile-toggle");
  const navMenu = document.querySelector("#nav-menu");
  const menuLabel = mobileToggle?.querySelector("strong");
  const dropdown = document.querySelector(".dropdown");
  const dropdownToggle = document.querySelector(".dropdown-toggle");
  const dropdownMenu = document.querySelector(".dropdown-menu");
  const siteHeader = document.querySelector(".site-header");

  const closeDropdown = () => {
    dropdown?.classList.remove("open");
    dropdownMenu?.classList.remove("is-open");
    dropdownToggle?.setAttribute("aria-expanded", "false");
  };

  const setMenuState = (isOpen) => {
    if (!mobileToggle || !navMenu) return;

    navMenu.classList.toggle("is-open", isOpen);
    mobileToggle.classList.toggle("is-open", isOpen);
    mobileToggle.setAttribute("aria-expanded", String(isOpen));
    mobileToggle.setAttribute(
      "aria-label",
      isOpen ? "Close navigation menu" : "Open navigation menu"
    );
    document.body.classList.toggle("menu-open", isOpen);

    if (menuLabel) {
      menuLabel.textContent = isOpen ? "Close" : "Menu";
    }

    if (!isOpen) closeDropdown();
  };

  if (mobileToggle && navMenu) {
    mobileToggle.addEventListener("click", () => {
      setMenuState(!navMenu.classList.contains("is-open"));
    });

    navMenu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => setMenuState(false));
    });

    document.addEventListener("click", (event) => {
      if (
        navMenu.classList.contains("is-open") &&
        siteHeader &&
        !siteHeader.contains(event.target)
      ) {
        setMenuState(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && navMenu.classList.contains("is-open")) {
        setMenuState(false);
        mobileToggle.focus();
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 900) setMenuState(false);
    });
  }

  if (dropdownToggle && dropdownMenu) {
    dropdownToggle.addEventListener("click", (event) => {
      event.preventDefault();
      const isOpen = !dropdownMenu.classList.contains("is-open");
      dropdown?.classList.toggle("open", isOpen);
      dropdownMenu.classList.toggle("is-open", isOpen);
      dropdownToggle.setAttribute("aria-expanded", String(isOpen));
    });
  }

  const estimatorShells = document.querySelectorAll("[data-estimator]");

  const loadEstimator = (shell) => {
    const iframe = shell.querySelector("iframe[data-src]");
    if (!iframe) return;

    if (!iframe.getAttribute("src")) {
      iframe.setAttribute("src", iframe.dataset.src);
    }

    iframe.hidden = false;
    shell.classList.add("is-loaded");
  };

  estimatorShells.forEach((shell) => {
    const launchButton = shell.querySelector(".estimator-launch");
    launchButton?.addEventListener("click", () => loadEstimator(shell));
  });

  document.querySelectorAll('a[href="#estimate"]').forEach((link) => {
    link.addEventListener("click", () => {
      estimatorShells.forEach(loadEstimator);
    });
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const mobileToggle = document.querySelector(".mobile-toggle");
  const navMenu = document.querySelector("#nav-menu");
  const dropdownToggle = document.querySelector(".dropdown-toggle");
  const dropdownMenu = document.querySelector(".dropdown-menu");

  if (mobileToggle && navMenu) {
    mobileToggle.addEventListener("click", () => {
      const isOpen = navMenu.classList.toggle("is-open");

      mobileToggle.setAttribute("aria-expanded", String(isOpen));
      mobileToggle.classList.toggle("is-open", isOpen);
    });
  }

  if (dropdownToggle && dropdownMenu) {
    dropdownToggle.addEventListener("click", (event) => {
      event.preventDefault();

      const isOpen = dropdownMenu.classList.toggle("is-open");

      dropdownToggle.setAttribute("aria-expanded", String(isOpen));
    });
  }

  if (navMenu && mobileToggle) {
    navMenu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        navMenu.classList.remove("is-open");
        mobileToggle.classList.remove("is-open");
        mobileToggle.setAttribute("aria-expanded", "false");
      });
    });
  }
});

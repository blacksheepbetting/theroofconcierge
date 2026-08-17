document.addEventListener("DOMContentLoaded", () => {
  const mobileToggle = document.querySelector(".mobile-toggle");
  const navMenu = document.querySelector("#nav-menu");
  const menuLabel = mobileToggle?.querySelector("strong");
  const dropdowns = Array.from(document.querySelectorAll(".dropdown"));
  const siteHeader = document.querySelector(".site-header");

  const closeDropdowns = (except = null) => {
    dropdowns.forEach((dropdown) => {
      if (dropdown === except) return;
      dropdown.classList.remove("open");
      dropdown.querySelector(".dropdown-menu")?.classList.remove("is-open");
      dropdown.querySelector(".dropdown-toggle")?.setAttribute("aria-expanded", "false");
    });
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

    if (!isOpen) closeDropdowns();
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
      if (event.key === "Escape") {
        closeDropdowns();
        if (navMenu.classList.contains("is-open")) {
          setMenuState(false);
          mobileToggle.focus();
        }
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 980) setMenuState(false);
    });
  }

  dropdowns.forEach((dropdown) => {
    const dropdownToggle = dropdown.querySelector(".dropdown-toggle");
    const dropdownMenu = dropdown.querySelector(".dropdown-menu");
    if (!dropdownToggle || !dropdownMenu) return;

    dropdownToggle.addEventListener("click", (event) => {
      event.preventDefault();
      const isOpen = !dropdownMenu.classList.contains("is-open");
      closeDropdowns(dropdown);
      dropdown.classList.toggle("open", isOpen);
      dropdownMenu.classList.toggle("is-open", isOpen);
      dropdownToggle.setAttribute("aria-expanded", String(isOpen));
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest?.(".dropdown")) closeDropdowns();
  });

  const trackAnalyticsEvent = (eventName, parameters = {}) => {
    if (typeof window.gtag !== "function") return;

    window.gtag("event", eventName, {
      page_path: window.location.pathname,
      ...parameters
    });
  };

  const inferPlacement = (control) => {
    if (control.dataset.ctaPlacement) return control.dataset.ctaPlacement;
    const container = control.closest?.("section, header, footer, nav");
    if (!container) return "unknown";
    return (
      container.id ||
      container.className?.toString().trim().split(/\s+/)[0] ||
      container.tagName?.toLowerCase() ||
      "unknown"
    );
  };

  const getTrackingContext = (control) => {
    const page = document.body?.dataset || {};
    return {
      service_category:
        control.dataset.serviceCategory || page.serviceCategory || "roofing",
      service_name: control.dataset.serviceName || page.serviceName || "",
      page_type: page.pageType || "website",
      cta_placement: inferPlacement(control),
      link_url: control.href || control.getAttribute?.("href") || undefined,
      link_text: control.textContent.trim().replace(/\s+/g, " ").slice(0, 100),
      page_location: window.location.href
    };
  };

  const ga4MeasurementId = "G-C4HSNT9BY1";

  const getAnalyticsField = (fieldName, timeoutMs = 2500) =>
    new Promise((resolve) => {
      if (typeof window.gtag !== "function") {
        resolve(undefined);
        return;
      }

      let isSettled = false;
      const settle = (value) => {
        if (isSettled) return;
        isSettled = true;
        window.clearTimeout(timeoutId);
        resolve(value || undefined);
      };
      const timeoutId = window.setTimeout(() => settle(undefined), timeoutMs);

      window.gtag("get", ga4MeasurementId, fieldName, settle);
    });

  const createAttributionToken = async () => {
    const [clientId, sessionId] = await Promise.all([
      getAnalyticsField("client_id"),
      getAnalyticsField("session_id")
    ]);

    if (!clientId || !sessionId || typeof window.fetch !== "function") {
      return undefined;
    }

    const controller = new AbortController();
    // Allow enough time for a cold GA4/Cloudflare load on mobile and Safari.
    // Failure still opens the estimator without inventing a conversion.
    const timeoutId = window.setTimeout(() => controller.abort(), 3000);

    try {
      const response = await window.fetch("/api/analytics-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({
          clientId,
          sessionId,
          entryPath: window.location.pathname
        })
      });

      if (!response.ok) return undefined;
      const { token } = await response.json();
      return /^[0-9a-f-]{36}$/i.test(token || "") ? token : undefined;
    } catch {
      return undefined;
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const conversionEvents = {
    phone_call: "phone_click",
    email_click: "email_click"
  };

  document.querySelectorAll("[data-conversion]").forEach((control) => {
    control.addEventListener("click", () => {
      const conversionType = control.dataset.conversion;
      const eventName = conversionEvents[conversionType] || "conversion_intent";

      trackAnalyticsEvent(eventName, {
        conversion_type: conversionType,
        ...getTrackingContext(control)
      });
    });
  });

  document.querySelectorAll("[data-analytics-event]").forEach((control) => {
    control.addEventListener("click", () => {
      trackAnalyticsEvent(control.dataset.analyticsEvent, getTrackingContext(control));
    });
  });

  const estimatorShells = document.querySelectorAll("[data-estimator]");

  const loadEstimator = async (shell) => {
    const iframe = shell.querySelector("iframe[data-src]");
    if (!iframe) return;

    if (iframe.getAttribute("src")) {
      iframe.hidden = false;
      shell.classList.add("is-loaded");
      return;
    }

    // Prevent two fast clicks from loading the iframe and firing estimate_start twice.
    if (shell.dataset.estimatorLoading === "true") return;
    shell.dataset.estimatorLoading = "true";

    try {
      const estimatorUrl = new URL(iframe.dataset.src, window.location.href);
      const pageParams = new URLSearchParams(window.location.search);
      const attributionToken = await createAttributionToken();

      [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_id",
        "utm_term",
        "utm_content",
        "gclid",
        "gbraid",
        "wbraid"
      ].forEach((key) => {
        const value = pageParams.get(key);
        if (value) estimatorUrl.searchParams.set(key, value);
      });

      // Roofr stores this URL after creating a lead. The opaque, one-time token
      // can be resolved by our server without exposing GA identifiers to Roofr.
      if (attributionToken) {
        estimatorUrl.searchParams.set("bp_attribution_token", attributionToken);
      }
      estimatorUrl.searchParams.set("bp_entry_path", window.location.pathname);
      estimatorUrl.searchParams.set("bp_tracking_version", "1");

      iframe.setAttribute("src", estimatorUrl.toString());
      trackAnalyticsEvent("estimate_start", {
        estimator_provider: "Roofr",
        estimator_entry_path: window.location.pathname,
        attribution_token_attached: Boolean(attributionToken)
      });

      iframe.hidden = false;
      shell.classList.add("is-loaded");
    } finally {
      delete shell.dataset.estimatorLoading;
    }
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

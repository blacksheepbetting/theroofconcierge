import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";


const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const domain = "https://www.theroofconcierge.com";

const expansionPages = [
  "basement-flood-services.html",
  "basement-water-removal.html",
  "basement-waterproofing.html",
  "sump-pump-drainage.html",
  "water-damage-restoration.html",
  "flood-prevention.html",
  "basement-flood-services-carmel.html",
  "basement-flood-services-fishers.html",
  "basement-flood-services-noblesville.html",
  "basement-flood-services-westfield.html",
  "basement-flood-services-zionsville.html",
  "basement-flood-services-avon.html"
];

const integratedPages = [
  "index.html",
  "carmel.html",
  "fishers.html",
  "noblesville.html",
  "westfield.html",
  "zionsville.html",
  "avon.html",
  "privacy.html"
];

const resourcePages = ["indiana-flood-recovery-fema-guidance.html"];

const matchOne = (source, expression, label) => {
  const matches = [...source.matchAll(expression)];
  assert.equal(matches.length, 1, `${label} should appear exactly once`);
  return matches[0][1];
};

test("expansion pages have production-ready SEO metadata and valid JSON-LD", async () => {
  const canonicals = new Set();

  for (const filename of expansionPages) {
    const source = await readFile(path.join(root, filename), "utf8");
    const title = matchOne(source, /<title>(.*?)<\/title>/gsi, `${filename} title`).trim();
    const description = matchOne(
      source,
      /<meta\s+name="description"\s+content="([^"]+)"/gsi,
      `${filename} meta description`
    );
    const canonical = matchOne(
      source,
      /<link\s+rel="canonical"\s+href="([^"]+)"/gsi,
      `${filename} canonical`
    );
    const h1 = [...source.matchAll(/<h1\b[^>]*>/gsi)];
    const jsonLd = [...source.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gsi)];

    assert.ok(title.length >= 35 && title.length <= 65, `${filename} title length is ${title.length}`);
    assert.ok(
      description.length >= 110 && description.length <= 170,
      `${filename} description length is ${description.length}`
    );
    assert.equal(h1.length, 1, `${filename} should have one H1`);
    assert.match(source, /<meta\s+name="robots"\s+content="index, follow">/i);
    assert.ok(canonical.startsWith(`${domain}/`));
    assert.ok(!canonical.endsWith(".html"), `${filename} canonical should be extensionless`);
    assert.ok(!canonicals.has(canonical), `${filename} canonical should be unique`);
    canonicals.add(canonical);
    assert.ok(source.includes("G-C4HSNT9BY1"), `${filename} should load the production GA4 property`);
    assert.ok(jsonLd.length >= 1, `${filename} should include JSON-LD`);
    jsonLd.forEach(([, payload]) => JSON.parse(payload));
    assert.doesNotMatch(source, /noindex|draft-banner|test service expansion|not published|launch gate/i);
  }
});

test("homepage and existing pages link visitors into basement and flood services", async () => {
  for (const filename of integratedPages) {
    const source = await readFile(path.join(root, filename), "utf8");
    assert.match(source, /basement-flood-services\.html/);
    assert.match(source, /basement-water-removal\.html/);
    assert.match(source, /class="dropdown services-dropdown"/);
    assert.doesNotMatch(source, /noindex|draft-banner|not published|launch gate/i);
  }

  const homepage = await readFile(path.join(root, "index.html"), "utf8");
  assert.match(homepage, /class="emergency-water-bar"/);
  assert.match(homepage, /Flood alert/i);
  assert.match(homepage, /class="emergency-ticker-track"/);
  assert.match(homepage, /style\.css\?v=31/);
  assert.match(homepage, /indiana-flood-recovery-fema-guidance\.html/);
  assert.match(homepage, /class="flood-home-feature"/);
  assert.match(homepage, /24\/7 Basement &amp; Flood Support/);
  assert.match(homepage, /<title>Indianapolis Roofing Company \| The Roof Concierge<\/title>/);
  assert.match(homepage, /<h1[^>]*>\s*Reliable Roofing Services/i);
});

test("homepage emergency ticker is accessible and motion-safe", async () => {
  const homepage = await readFile(path.join(root, "index.html"), "utf8");
  const styles = await readFile(path.join(root, "style.css"), "utf8");

  assert.match(homepage, /class="visually-hidden">Impacted by recent flooding/i);
  assert.match(homepage, /aria-hidden="true" class="emergency-ticker-track"/);
  assert.match(styles, /@keyframes emergency-ticker-scroll/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.match(styles, /animation-play-state:\s*paused/);
});

test("flood recovery resource is sourced, cautious, trackable, and indexable", async () => {
  for (const filename of resourcePages) {
    const source = await readFile(path.join(root, filename), "utf8");
    const canonical = matchOne(source, /<link\s+rel="canonical"\s+href="([^"]+)"/gsi, `${filename} canonical`);
    const jsonLd = [...source.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gsi)];

    assert.equal([...source.matchAll(/<h1\b[^>]*>/gsi)].length, 1);
    assert.equal(canonical, `${domain}/indiana-flood-recovery-fema-guidance`);
    assert.match(source, /FEMA assistance[^<]*not currently available/i);
    assert.match(source, /not affiliated with FEMA/i);
    assert.match(source, /not legal, insurance, financial, or eligibility advice/i);
    assert.match(source, /State Disaster Relief Fund/i);
    assert.match(source, /866-211-9966/);
    assert.match(source, /G-C4HSNT9BY1/);
    assert.match(source, /data-page-type="resource"/);
    jsonLd.forEach(([, payload]) => JSON.parse(payload));
  }
});

test("local HTML links resolve and sitemap contains every expansion canonical", async () => {
  const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");

  for (const filename of expansionPages) {
    const source = await readFile(path.join(root, filename), "utf8");
    const canonical = matchOne(
      source,
      /<link\s+rel="canonical"\s+href="([^"]+)"/gsi,
      `${filename} canonical`
    );
    assert.ok(sitemap.includes(`<loc>${canonical}</loc>`), `${filename} canonical missing from sitemap`);

    const hrefs = [...source.matchAll(/href="([^"]+)"/gsi)].map((match) => match[1]);
    for (const href of hrefs) {
      if (!href.endsWith(".html") || href.startsWith("http")) continue;
      await access(path.join(root, href));
    }
  }

  for (const filename of resourcePages) {
    const source = await readFile(path.join(root, filename), "utf8");
    const canonical = matchOne(source, /<link\s+rel="canonical"\s+href="([^"]+)"/gsi, `${filename} canonical`);
    assert.ok(sitemap.includes(`<loc>${canonical}</loc>`), `${filename} canonical missing from sitemap`);
  }
});

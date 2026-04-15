# Platform integration recommendations

Last checked: 2026-04-15

This note turns the proposed Products, Investment, Health, and News verticals into concrete source/platform recommendations for Curyo.

Important distinction: Curyo has two layers now.

- Trust verticals are the user-facing discovery buckets, stored for new submissions as reserved `vertical:<slug>` tags.
- Platforms/websites are still CategoryRegistry source categories. Adding one is not a smart contract code change, but it is an on-chain data/governance or deployment seeding action because approved platform domains live in CategoryRegistry.

The recommendations below separate three integration levels:

- **URL-only:** users can submit a public URL, title, and description. Curyo should render a link and avoid copying article/product text or images unless the source terms permit it.
- **Metadata/API:** Curyo can enrich submissions or validate URLs using an official API.
- **Automated source adapter:** the bot can discover and submit items periodically.

## Recommendation summary

| Vertical | Platform | Domain to register | Recommendation | Integration check |
| --- | --- | --- | --- | --- |
| Products | Open Food Facts | `openfoodfacts.org` | Add now | API and data reuse are intentionally open, with ODbL/DBCL and image license obligations. |
| Products | Best Buy | `bestbuy.com` | Add now, with constraints | Official product API allows applications/websites, but requires an API key, attribution, limited caching, and careful category exclusions. |
| Products | Product Hunt | `producthunt.com` | Add URL-only now; API only after approval | Public API exists, but Product Hunt says commercial/business API use requires contacting them. |
| Investment | SEC EDGAR | `sec.gov` | Add now | Official REST APIs expose public filings and XBRL JSON without auth keys, subject to fair access. |
| Investment | FRED | `fred.stlouisfed.org` | Add now | Official API permits applications that interoperate with FRED, but requires API keys and source/endorsement notices. |
| Investment | Nasdaq Data Link | `data.nasdaq.com` | Defer unless using a specific licensed/free dataset | API integration is supported, but free/premium dataset rights vary by feed and use case. |
| Health | PubMed | `pubmed.ncbi.nlm.nih.gov` | Add now | NCBI E-utilities are public APIs for PubMed, subject to tool/email identification and request limits. |
| Health | ClinicalTrials.gov | `clinicaltrials.gov` | Add now | API v2 is a public REST/OpenAPI service for trial records. |
| Health | FDA/openFDA | `fda.gov` | Add now | openFDA data is generally CC0/public-domain-like, with explicit caveats for some third-party data. |
| News | The Guardian | `theguardian.com` | Add URL-only now; API only with the right key | Developer API is for non-commercial usage; commercial Curyo use should request a commercial key. |
| News | AP News | `apnews.com` | Add URL-only only; API after contract | AP supports licensed API integrations, but API access and content use depend on contract terms. |

## Add now

### Open Food Facts

**Why it fits Curyo:** Product labels, nutrition claims, ingredients, allergens, and environmental labels are exactly the kind of evidence-heavy product information where verified human raters matter. Bots can parse labels, but humans are better at spotting misleading framing and deciding whether a product page is trustworthy.

**Integration fit:** Add as a Products platform now. Start with URL-only submissions and a lightweight API adapter later.

**Compliance notes:**

- The API docs say Open Food Facts is open data and that anyone can reuse it for any purpose, but the database is under the Open Database License, database contents are under the Database Contents License, and product images are Creative Commons Attribution-ShareAlike with possible additional rights.
- Read API calls do not require authentication beyond a custom User-Agent. Write calls require authentication.
- Rate limits are explicit: 100 read product requests per minute, 10 search requests per minute, and 2 facet requests per minute.
- Fill out their API usage form before production automation.

**Suggested subcategories:** Food, Nutrition, Ingredients, Allergens, Labels.

Sources: [Open Food Facts API docs](https://openfoodfacts.github.io/openfoodfacts-server/api/), [Open Food Facts data page](https://world.openfoodfacts.org/data).

### Best Buy

**Why it fits Curyo:** Consumer electronics and appliances are high-stakes enough for human judgement. Verified raters can evaluate whether a product looks reliable, overpriced, obsolete, or review-gamed without Curyo needing to ingest user reviews.

**Integration fit:** Add as a Products platform now. Prefer URL-only first, then an API-backed metadata adapter for product name, SKU, category, price, and canonical links.

**Compliance notes:**

- Best Buy provides Products, Stores, and Categories APIs and lets developers query product data.
- The API terms grant a limited license for applications/websites connected to Best Buy product/service offers or sales.
- Content must be attributed to Best Buy, links and notices must not be obscured, and API content may only be cached temporarily, not beyond 72 hours.
- The terms exclude Games, CDs, DVDs, and Blu-ray content unless Curyo is an affiliate or has a separate signed agreement. Keep the initial scope to electronics, computing, appliances, smart home, and similar hard goods.

**Suggested subcategories:** Electronics, Computing, Appliances, Gaming Hardware, Smart Home.

Sources: [Best Buy Developer API documentation](https://developer.bestbuy.com/documentation/products-api), [Best Buy API terms](https://developers.bestbuy.com/legal).

### SEC EDGAR

**Why it fits Curyo:** Filings are public, consequential, and hard to interpret. Verified humans can rate whether a filing, risk disclosure, S-1, 8-K, or shareholder communication is clear, material, and not being misrepresented by surrounding hype.

**Integration fit:** Add as an Investment platform now. A bot adapter can later ingest recent filings, but human submit is already useful.

**Compliance notes:**

- SEC publishes RESTful JSON APIs for submissions and XBRL data via `data.sec.gov`; no authentication or API key is required.
- SEC fair access guidance asks developers to use efficient scripting and limits users to no more than 10 requests per second.
- Automated tools should identify themselves with a clear User-Agent/contact and avoid broad crawling.

**Suggested subcategories:** 10-K, 10-Q, 8-K, S-1, Proxy.

Sources: [SEC EDGAR API documentation](https://www.sec.gov/edgar/sec-api-documentation), [SEC developer resources](https://www.sec.gov/about/developer-resources).

### FRED

**Why it fits Curyo:** Macro series are important in investment discussions but easy to cherry-pick. Verified raters can score whether a submitted chart, series, or economic claim is responsibly contextualized.

**Integration fit:** Add as an Investment platform now. Use official FRED series pages for submissions and the API for metadata/observations.

**Compliance notes:**

- FRED API v2 is explicitly meant for programs and applications that retrieve economic data from FRED.
- All web service requests require an API key, and each application should use a distinct key.
- The API terms require a notice that the product uses the FRED API and is not endorsed/certified by the Federal Reserve Bank of St. Louis.
- Some FRED series are owned by third parties and may have copyright restrictions. For Curyo, store source URLs and metadata, but avoid redistributing copyrighted series data unless the series terms allow it.

**Suggested subcategories:** Inflation, Rates, Labor, GDP, Housing.

Sources: [FRED API v2 docs](https://fred.stlouisfed.org/docs/api/fred/v2/), [FRED API keys](https://fred.stlouisfed.org/docs/api/api_key.html), [FRED API terms](https://fred.stlouisfed.org/docs/api/terms_of_use.html).

### PubMed

**Why it fits Curyo:** Health claims need evidence quality. Human-verified ratings are useful for distinguishing clinical studies, reviews, weak associations, preclinical findings, and overclaimed conclusions.

**Integration fit:** Add as a Health platform now. Start URL-only for PubMed pages; later add E-utilities metadata lookup by PMID.

**Compliance notes:**

- NCBI provides public E-utilities APIs that include PubMed.
- NCBI recommends no more than 3 requests per second, with large jobs run off-hours.
- E-utility requests should include `tool` and `email`; API keys are recommended for higher request rates.
- Do not reproduce abstracts or article text broadly. Store the PMID, source URL, title when permitted, and Curyo's own user-submitted framing.

**Suggested subcategories:** Clinical Study, Review, Meta-analysis, Guideline, Case Report.

Sources: [NCBI APIs](https://www.ncbi.nlm.nih.gov/home/develop/api/), [NCBI E-utilities guide](https://www.ncbi.nlm.nih.gov/books/NBK25497/), [E-utilities parameters](https://www.ncbi.nlm.nih.gov/books/NBK25499/).

### ClinicalTrials.gov

**Why it fits Curyo:** Trials are public but often misunderstood. Verified raters can evaluate whether a study is recruiting, completed, has results, is powered enough to support claims, or is being used as hype.

**Integration fit:** Add as a Health platform now. URL-only and API-backed metadata are both reasonable.

**Compliance notes:**

- ClinicalTrials.gov API v2 is a public REST API using OpenAPI 3.0 and JSON responses.
- Treat records as source material, not medical advice. Curyo UI should avoid implying treatment recommendations.

**Suggested subcategories:** Interventional, Observational, Recruiting, Completed, Results.

Sources: [ClinicalTrials.gov API v2 announcement](https://www.nlm.nih.gov/pubs/techbull/ma24/ma24_clinicaltrials_api_beta.html), [ClinicalTrials.gov data API](https://clinicaltrials.gov/data-api/api).

### FDA/openFDA

**Why it fits Curyo:** Recalls, safety alerts, drug labels, device notices, adverse-event data, and food safety updates all benefit from verified human context and careful rating.

**Integration fit:** Add as a Health platform now. Register `fda.gov` so public FDA pages, `open.fda.gov`, and `api.fda.gov` can be handled under one source category.

**Compliance notes:**

- openFDA states that its public data is generally unrestricted and, unless otherwise noted, public domain under CC0.
- The terms warn that some included material may not be public domain, especially third-party/copyrightable content supplied to FDA.
- openFDA may limit or restrict use to manage load and prevent abuse.
- Include source attribution even when not required.

**Suggested subcategories:** Drug, Device, Food, Recall, Safety Alert.

Sources: [openFDA APIs](https://open.fda.gov/apis/), [openFDA terms](https://open.fda.gov/terms/).

## Conditional additions

### Product Hunt

**Why it fits Curyo:** Product Hunt is vulnerable to launch-day hype, coordinated promotion, and shallow popularity metrics. Verified human ratings would be meaningful for judging whether a product is real, useful, and trustworthy.

**Integration fit:** Add as URL-only if Curyo only stores submitted Product Hunt URLs plus Curyo-native title/description. Do not build automated API ingestion until Product Hunt approves Curyo's use case.

**Compliance notes:**

- Product Hunt's GraphQL API exists and supports public read access.
- Product Hunt states that the API must not be used for commercial purposes by default, and business use requires contacting them.
- If Curyo is commercial or token-incentivized, treat API use as requiring approval. This includes bot discovery and metadata enrichment.

**Suggested subcategories:** AI Tools, Developer Tools, Productivity, SaaS, Consumer Apps.

Source: [Product Hunt API docs](https://www.producthunt.com/v2/docs).

### The Guardian

**Why it fits Curyo:** News source trust is directly aligned with Curyo's blind phase and human verification. Users can rate whether an article is responsibly sourced, current, and not misleading.

**Integration fit:** Add as URL-only first. Use the Guardian API only after selecting the correct access tier. A commercial Curyo deployment should request a commercial key before reproducing Guardian journalism, media, or API-derived content.

**Compliance notes:**

- The Open Platform offers a developer key for non-commercial usage with limited quotas.
- The commercial tier covers commercial enterprises and products derived from Guardian content, with custom quotas and pricing.
- Avoid copying article bodies/images unless covered by the selected key and terms.

**Suggested subcategories:** World, Politics, Climate, Business, Technology.

Sources: [Guardian Open Platform](https://open-platform.theguardian.com/), [Guardian Open Platform access tiers](https://open-platform.theguardian.com/access/).

### AP News

**Why it fits Curyo:** AP is a strong source for high-signal news and election data, where verified human rating can help distinguish original reporting, syndicated summaries, and public claims.

**Integration fit:** Add only as URL-only at first, and only render outbound links plus Curyo-native submission text. API-backed ingestion requires an AP license/contract.

**Compliance notes:**

- AP Developer explicitly offers content, metadata, elections, and newsroom APIs.
- AP Media API access is for licensed multimedia content and depends on contract terms.
- AP API calls require a server-side API key; AP advises against direct browser integrations.
- Account quotas apply.

**Suggested subcategories:** Politics, World, Business, Science, Health.

Sources: [AP Developer](https://developer.ap.org/), [AP Media API getting started](https://api.ap.org/media/v/docs/Getting_Started_API.htm).

### Nasdaq Data Link

**Why it fits Curyo:** It can become useful for market data, index data, and investment dashboards, but it is less urgent than SEC/FRED because data licensing is more complex.

**Integration fit:** Defer until Curyo picks a specific free or paid dataset and reviews that dataset's license. Do not scrape Nasdaq pages for market data.

**Compliance notes:**

- Nasdaq Data Link supports API access to free and premium datasets.
- Free datasets are presented as usable with few restrictions, but most datasets are premium and premium terms vary by data feed and use case.
- Professional investment applications should assume licensing review is needed.

**Suggested subcategories:** Equities, Funds, Indexes, Market Data, Fundamentals.

Sources: [Nasdaq Data Link docs](https://docs.data.nasdaq.com/docs/getting-started), [Nasdaq Data Link premium terms help](https://help.data.nasdaq.com/article/566-what-are-the-terms-of-use-for-premium-data).

## Defer or avoid for now

- **Amazon:** product data is useful, but affiliate and Product Advertising API requirements make it a worse first Products source than Open Food Facts or Best Buy.
- **WebMD, Healthline, supplement blogs, and wellness marketplaces:** health content is high-liability and SEO-spam-prone. Use official health sources first.
- **Yahoo Finance as a primary Investment source:** useful URLs, but no clean official API for Curyo-style automated ingestion. Prefer SEC, FRED, and carefully licensed market data.
- **GDELT/NewsAPI-style aggregators as source categories:** useful for discovery, but submitted content should point to the original publisher whenever possible.

## Suggested first implementation slice

1. Add approved CategoryRegistry entries for:
   - Open Food Facts: `openfoodfacts.org`
   - Best Buy: `bestbuy.com`
   - SEC EDGAR: `sec.gov`
   - FRED: `fred.stlouisfed.org`
   - PubMed: `pubmed.ncbi.nlm.nih.gov`
   - ClinicalTrials.gov: `clinicaltrials.gov`
   - FDA/openFDA: `fda.gov`
2. Add conditional URL-only categories for Product Hunt, The Guardian, and AP News only if the submit UI does not scrape/copy their content. Otherwise defer them until API/commercial permissions are in place.
3. Update `packages/node-utils/src/trustVerticals.ts` with domain-to-vertical mappings for all added domains.
4. Update the submit page platform hints/placeholders in `packages/nextjs/components/submit/ContentSubmissionSection.tsx`.
5. Update local/deploy seeding scripts so new development chains include the same approved source categories as production.
6. Add bot source adapters only for the "add now" API-friendly sources, starting with SEC EDGAR, FRED, PubMed, ClinicalTrials.gov, FDA, and Open Food Facts. Treat Best Buy as a metadata adapter first because its terms are tied to product/service offers and temporary caching.

## Practical policy for Curyo

- Store canonical source URLs and Curyo-native submission text.
- Prefer official APIs over scraping.
- Use server-side API keys only; never expose third-party keys in the browser.
- Include source attribution and outbound links.
- Cache only when the source terms allow it, and expire cached metadata aggressively for conditional/commercial sources.
- Keep health and investment disclaimers visible: ratings are human trust signals, not medical or financial advice.

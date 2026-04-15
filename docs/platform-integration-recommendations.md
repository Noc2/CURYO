# Platform integration recommendations

Last checked: 2026-04-15

This note turns the proposed Products, Investment, and Health verticals into concrete source/platform recommendations for Curyo.

News is intentionally excluded for now. The current voting UI does not show enough category-specific guidance to make clear whether voters should rate article accuracy, source quality, event sentiment, or personal agreement. News platforms should wait until the product can surface a clear news-rating rubric at the moment of voting.

The most important update from the second research pass is that new platforms should be image-native whenever possible. Curyo's vote/discover surfaces are visual, and human verification is more useful when a submitted item has a recognizable source image, product image, logo, chart, or article thumbnail.

Important distinction: Curyo has two layers now.

- Trust verticals are the user-facing discovery buckets, stored for new submissions as reserved `vertical:<slug>` tags.
- Platforms/websites are still CategoryRegistry source categories. Adding one is not a smart contract code change, but it is an on-chain data/governance or deployment seeding action because approved platform domains live in CategoryRegistry.

The recommendations below separate three integration levels:

- **URL-only:** users can submit a public URL, title, and description. Curyo should render a link and avoid copying article/product text or images unless the source terms permit it.
- **Metadata/API:** Curyo can enrich submissions or validate URLs using an official API.
- **Automated source adapter:** the bot can discover and submit items periodically.

## Image Policy

For new platform integrations, prefer sources that satisfy at least one of these conditions:

- An official API returns an image, logo, media URL, or thumbnail field.
- The official platform publishes a deterministic visual from official data, such as a FRED chart generated from a series page.
- Curyo has a commercial/license agreement that permits API-derived images or media display.

Avoid relying on scraped Open Graph images as the primary strategy. OG images are fine as a best-effort preview for generic URLs, but they should not be the reason to approve a new platform category. Store canonical source URLs, store image URLs only when permitted, and avoid long-lived image caching unless the source terms explicitly allow it.

## Recommendation Summary

| Vertical | Platform | Domain to register | Recommendation | Image support | Integration check |
| --- | --- | --- | --- | --- | --- |
| Products | Open Food Facts | `openfoodfacts.org` | Add now | Strong. Product image URLs are available in product data and images are also published through an AWS image dataset. | Open reuse model, but honor ODbL/DBCL and CC BY-SA obligations for product images. |
| Products | Best Buy | `bestbuy.com` | Add with constraints | Strong. Products API exposes many image URL fields, including front, large, medium, thumbnail, alternate, 360, and EnergyGuide images. | API key required. Terms permit use in apps/websites connected to Best Buy product offers/sales; attribution, links, and temporary caching constraints apply. |
| Products | CPSC Recalls | `cpsc.gov` | Add now | Good. Recall records and pages can include product image URLs, though older recalls may not have images. | Public CPSC recall API is available in XML/JSON and is intended for consumers, businesses, and developers. |
| Products / Software | Product Hunt | `producthunt.com` | Conditional | Strong technically. GraphQL `Media` exposes public media URLs and thumbnails. | Not first wave unless Curyo gets approval: Product Hunt says business/commercial API use requires contacting them. |
| Investment | CoinGecko | `coingecko.com` | Already integrated; keep as Investment | Strong. Coin APIs expose coin image URLs. | Terms require "Powered by CoinGecko" attribution and careful cache refresh/deletion behavior. |
| Investment | FRED | `fred.stlouisfed.org` | Add now if chart thumbnailing is acceptable | Medium. The source is data-first, but Curyo can render official series data as a chart thumbnail and link to the FRED graph. | Official API supports applications retrieving FRED data; API key and FRED terms/third-party data restrictions apply. |
| Investment | Polygon.io / Massive | `polygon.io` or `massive.com` | Conditional | Strong for equities. Ticker details expose branding assets such as logos/icons. | Use only after confirming plan/licensing for Curyo's commercial/tokenized use case. |
| Investment | SEC EDGAR | `sec.gov` | Defer from image-first wave | Weak. EDGAR is highly valuable but has no reliable first-party image/logo support for filings. | Keep as a later text-first exception for filings, not as an image-native launch platform. |
| Health | DailyMed | `dailymed.nlm.nih.gov` | Add now | Strong. DailyMed `/spls/{SETID}/media` returns links to label media, including JPEG image URLs when present. | Public NLM REST API; best source for official drug-label and pill/label imagery. |
| Health | FDA/openFDA | `fda.gov` | Conditional text-first exception | Weak to mixed. openFDA is excellent for labels, recalls, and safety data, but reliable image support is sparse compared with DailyMed and CPSC. | Use later for evidence data; avoid treating it as an image-native platform unless a specific FDA dataset has images. |
| Health | PubMed | `pubmed.ncbi.nlm.nih.gov` | Defer from image-first wave | Weak. PubMed metadata is not reliably image-native and article figures usually belong to publishers. | Valuable for evidence quality later, but better as a text-first research source than a platform tab addition. |
| Health | ClinicalTrials.gov | `clinicaltrials.gov` | Defer from image-first wave | Weak. Trial records are structured and useful but not visual. | Valuable later as a text-first source for trial interpretation. |

## Image-Native First Wave

These are the platforms I would implement first because they are useful to Curyo's verified-human thesis and can support visual cards without brittle scraping.

### Open Food Facts

**Why it fits Curyo:** Product labels, nutrition claims, ingredients, allergens, and environmental labels are exactly the kind of evidence-heavy product information where verified human raters matter. Bots can parse labels, but humans are better at spotting misleading framing and deciding whether a product page is trustworthy.

**Integration fit:** Add as a Products platform now. Start with URL submissions plus API-backed metadata/image lookup by barcode or product URL.

**Image support:** Strong. Open Food Facts documents product image downloads, selected image URLs in product data, and an AWS image dataset. Use resized images where possible instead of full-resolution downloads.

**Compliance notes:**

- The database is available under ODbL, individual database contents under DBCL, and product images under Creative Commons Attribution-ShareAlike with possible extra third-party rights.
- Read API calls do not require authentication beyond a custom User-Agent. Write calls require authentication.
- Rate limits are explicit: 100 read product requests per minute, 10 search requests per minute, and 2 facet requests per minute.
- Fill out their API usage form before production automation.

**Suggested subcategories:** Food, Nutrition, Ingredients, Allergens, Labels.

Sources: [Open Food Facts API docs](https://openfoodfacts.github.io/openfoodfacts-server/api/), [Open Food Facts image download docs](https://openfoodfacts.github.io/openfoodfacts-server/api/how-to-download-images/), [Open Food Facts AWS images dataset](https://openfoodfacts.github.io/openfoodfacts-server/api/aws-images-dataset/), [Open Food Facts license notes](https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/license-be-on-the-legal-side/).

### Best Buy

**Why it fits Curyo:** Consumer electronics and appliances are high-stakes enough for human judgement. Verified raters can evaluate whether a product looks reliable, overpriced, obsolete, or review-gamed without Curyo needing to ingest user reviews.

**Integration fit:** Add as a Products platform with constraints. URL-only submissions are safe. API-backed enrichment should link back to Best Buy product pages and respect the API terms.

**Image support:** Strong. The Products API exposes many image URL fields, including product detail, large, medium, thumbnail, front, side, rear, alternate, 360-degree, remote-control, and EnergyGuide images.

**Compliance notes:**

- Best Buy provides Products, Stores, and Categories APIs and returns JSON/XML.
- The API terms grant a limited license for applications/websites connected to Best Buy product/service offers or sales.
- Content must preserve attribution, notices, and links. Do not obscure Best Buy links.
- API content should be cached only temporarily. The documentation notes that response links expire after seven days.
- The terms exclude Games, CDs, DVDs, and Blu-ray content unless Curyo is an affiliate or has a separate signed agreement. Keep the initial scope to electronics, computing, appliances, smart home, and similar hard goods.

**Suggested subcategories:** Electronics, Computing, Appliances, Gaming Hardware, Smart Home.

Sources: [Best Buy Developer API documentation](https://developer.bestbuy.com/documentation/products-api), [Best Buy API terms](https://developers.bestbuy.com/legal).

### CPSC Recalls

**Why it fits Curyo:** Product safety recalls are highly consequential, public, and often visually identifiable. Verified humans can rate whether the recall, hazard, remedy, and product context are being represented accurately.

**Integration fit:** Add as a Products platform now. It can also feed Health-adjacent product safety items, but the default vertical should be Products because the source category is consumer products.

**Image support:** Good. The official recall API exposes structured recall records and the programmer guide includes an `Images` collection with image URLs; CPSC recall pages also display product images when available. Older records may have empty image arrays.

**Compliance notes:**

- CPSC says recall data is publicly available to consumers, businesses, and developers.
- The recall API returns XML or JSON and exposes machine-readable recall information visible on CPSC.gov.
- Use CPSC as the canonical source, link to the official recall URL, and do not transform recall language in a way that changes the safety meaning.

**Suggested subcategories:** Recalls, Safety, Hazards, Remedies, Consumer Products.

Sources: [CPSC Recalls API information](https://www.cpsc.gov/Recalls/CPSC-Recalls-Application-Program-Interface-API-Information), [CPSC recalls page](https://www.cpsc.gov/Recalls/).

### DailyMed

**Why it fits Curyo:** Official drug labels, boxed warnings, indications, adverse reactions, packaging, and pill images are a strong fit for verified human rating. This is meaningfully more appropriate than general wellness content because the source is official and auditable.

**Integration fit:** Add as a Health platform now. Use URL submissions first, then API-backed metadata/media lookup by SET ID, drug name, NDC, RxCUI, or label page URL.

**Image support:** Strong. DailyMed's `/spls/{SETID}/media` endpoint returns links to all media for a specified SPL, including JPEG image URLs when present.

**Compliance notes:**

- DailyMed REST services are public, versioned, GET-only endpoints that return XML or JSON.
- Keep health disclaimers visible. Curyo ratings should be presented as trust/context signals, not medical advice.
- Store the DailyMed URL, SET ID, title, and permitted media URL. Avoid copying large label sections into Curyo.

**Suggested subcategories:** Drug Label, Boxed Warning, OTC, Pill Image, Packaging.

Sources: [DailyMed web services](https://dailymed.nlm.nih.gov/dailymed/app-support-web-services.cfm), [DailyMed `/spls` API](https://dailymed.nlm.nih.gov/dailymed/webservices-help/v2/spls_api.cfm), [DailyMed `/spls/{SETID}/media` API](https://dailymed.nlm.nih.gov/dailymed/webservices-help/v2/spls_setid_media_api.cfm).

### CoinGecko

**Why it fits Curyo:** Crypto tokens are already part of Curyo, and the vertical taxonomy should move them into Investment. Human verification is useful because crypto data is bot-heavy, hype-heavy, and vulnerable to coordinated promotion.

**Integration fit:** Keep as an Investment platform and continue using official API metadata where possible.

**Image support:** Strong. CoinGecko's market-data endpoints include a coin image URL field.

**Compliance notes:**

- Attribute CoinGecko prominently where API data is used.
- CoinGecko allows products that incorporate the API, but does not allow resale, redistribution, or syndication of API access itself.
- If Curyo stores CoinGecko data, refresh cached data at least every 24 hours and honor deletion requirements if access ends.

**Suggested subcategories:** Token, Protocol, Exchange, DeFi, NFT.

Sources: [CoinGecko coins markets API](https://docs.coingecko.com/reference/coins-markets), [CoinGecko coin data API](https://docs.coingecko.com/reference/coins-id), [CoinGecko API terms](https://www.coingecko.com/en/api_terms).

### FRED

**Why it fits Curyo:** Macro series are important in investment discussions but easy to cherry-pick. Verified raters can score whether a submitted chart, series, or economic claim is responsibly contextualized.

**Integration fit:** Add as an Investment platform if Curyo accepts chart thumbnails as image support. The platform is data-first, but the UI can render a chart image from official FRED series data and link to the canonical FRED graph.

**Image support:** Medium. FRED is not a media API, but the content is inherently visual when represented as a chart. Curyo should generate the chart thumbnail from official series observations rather than scraping arbitrary graph images.

**Compliance notes:**

- FRED API v2 supports applications retrieving economic data from FRED.
- API requests require an API key.
- FRED terms warn that some series are owned by third parties and may have copyright restrictions. Store source URLs and metadata, but avoid redistributing restricted series data beyond what the terms allow.
- Include the required notice that the product uses the FRED API and is not endorsed/certified by the Federal Reserve Bank of St. Louis.

**Suggested subcategories:** Inflation, Rates, Labor, GDP, Housing.

Sources: [FRED API docs](https://fred.stlouisfed.org/docs/api/fred/), [FRED API v2 docs](https://fred.stlouisfed.org/docs/api/fred/v2/), [FRED API terms](https://fred.stlouisfed.org/docs/api/terms_of_use.html).

## Conditional Image-Native Additions

These platforms support images technically, but should not be automated until permissions, plan terms, or contracts are confirmed.

### Product Hunt

**Why it fits Curyo:** Product Hunt is vulnerable to launch-day hype, coordinated promotion, and shallow popularity metrics. Verified human ratings would be meaningful for judging whether a product is real, useful, and trustworthy.

**Integration fit:** Conditional. A manual URL-only Product Hunt category is possible, but if the goal is image-native metadata, wait until Curyo has Product Hunt's approval for business/commercial API use.

**Image support:** Strong. Product Hunt's GraphQL `Media` object exposes a public media URL and supports width/height arguments; video media returns a generated thumbnail URL.

**Compliance notes:**

- Product Hunt's GraphQL API exists and supports public read access.
- Product Hunt states that the API must not be used for commercial purposes by default, and business use requires contacting them.
- If Curyo is commercial or token-incentivized, treat API use as requiring approval. This includes bot discovery and metadata enrichment.

**Suggested subcategories:** AI Tools, Developer Tools, Productivity, SaaS, Consumer Apps.

Sources: [Product Hunt API docs](https://www.producthunt.com/v2/docs), [Product Hunt GraphQL Media object](https://api-v2-docs.producthunt.com/object/media/).

### Polygon.io / Massive

**Why it fits Curyo:** Equities and public-company profiles fit the Investment vertical, and logos help make the voting surface understandable without relying on SEC filings alone.

**Integration fit:** Conditional. Use for equity profile/logo enrichment only after choosing the correct commercial plan and confirming redistribution/display terms.

**Image support:** Strong. Polygon/Massive ticker details expose branding assets such as logos and icons for supported tickers.

**Compliance notes:**

- Treat market data and branding assets as licensed data.
- Keep SEC EDGAR as the canonical filing source when rating filings, but use a licensed provider like Polygon/Massive only for logos/profile enrichment.
- Do not expose API keys in the browser.

**Suggested subcategories:** Equity, ETF, Company Profile, Earnings, Filing Context.

Sources: [Polygon ticker overview docs](https://polygon.io/docs/rest/stocks/tickers/ticker-overview/), [Polygon/Massive site](https://polygon.io/).

## News Platforms Deferred

Do not add a News vertical or news-first platform categories in this implementation slice. Guardian and AP both have strong image/API stories with the right commercial access, but they should stay out of the platform recommendation list until Curyo can tell voters exactly what a News vote means.

When the product adds category-specific voting guidance, revisit:

- **The Guardian:** strong Open Platform media support, but commercial Curyo usage should request the right access tier before reproducing API-derived article text, images, audio, or video.
- **AP News / AP Media API:** strong licensed media support, but API-backed ingestion requires contract terms, server-side keys, and secure middleware.
- **News aggregators:** useful for discovery, but submitted content should point to the original publisher whenever possible.

Sources: [Guardian Open Platform](https://open-platform.theguardian.com/), [Guardian Open Platform access tiers](https://open-platform.theguardian.com/access/), [AP Developer](https://developer.ap.org/), [AP Media API getting started](https://api.ap.org/media/v/docs/Getting_Started_API.htm).

## Text-First Exceptions To Defer

These sources are still high-value for the trust thesis, but they do not satisfy the image-native preference well enough to be first-wave platform categories.

### SEC EDGAR

SEC filings are public, consequential, and hard to interpret, but EDGAR has no reliable first-party image/logo field. Keep it as a later Investment exception for filings, and pair it with a licensed logo/profile source if the UI needs images.

Sources: [SEC EDGAR API documentation](https://www.sec.gov/edgar/sec-api-documentation), [SEC developer resources](https://www.sec.gov/about/developer-resources).

### PubMed

PubMed is excellent for evidence quality, but it is not reliably image-native. Article figures usually belong to publishers, and PubMed metadata should not be treated as a free image source. Add later as a Health research source if Curyo is ready for text-first evidence rating.

Sources: [NCBI APIs](https://www.ncbi.nlm.nih.gov/home/develop/api/), [NCBI E-utilities guide](https://www.ncbi.nlm.nih.gov/books/NBK25497/).

### ClinicalTrials.gov

ClinicalTrials.gov records are structured and useful, but trial records generally do not include source images. Add later for health evidence interpretation, not as an image-native launch platform.

Sources: [ClinicalTrials.gov data API](https://clinicaltrials.gov/data-api/api), [ClinicalTrials.gov API v2 announcement](https://www.nlm.nih.gov/pubs/techbull/ma24/ma24_clinicaltrials_api_beta.html).

### FDA/openFDA

openFDA is excellent for labels, recalls, adverse events, and safety data, and its terms are generally permissive. The issue is not API access; it is sparse image support. Prefer DailyMed for drug-label media and CPSC for consumer-product recall images, then add openFDA later as an evidence/data adapter.

Sources: [openFDA APIs](https://open.fda.gov/apis/), [openFDA terms](https://open.fda.gov/terms/).

## Avoid For Now

- **Amazon:** product images and product data are useful, but Product Advertising API, affiliate requirements, and commerce constraints make it a worse first Products source than Open Food Facts, Best Buy, or CPSC.
- **WebMD, Healthline, supplement blogs, and wellness marketplaces:** health content is high-liability and SEO-spam-prone. Use official health sources first.
- **Yahoo Finance as a primary Investment source:** useful URLs, but no clean official API for Curyo-style automated ingestion. Prefer CoinGecko, FRED, SEC later, and carefully licensed market-data/logo providers.
- **News and news aggregators:** defer until Curyo has category-specific voting guidance for accuracy, sourcing, and misleadingness. Image rights usually belong to publishers, not aggregators.

## Suggested First Implementation Slice

1. Add approved CategoryRegistry entries for image-native first-wave platforms:
   - Open Food Facts: `openfoodfacts.org`
   - Best Buy: `bestbuy.com`
   - CPSC Recalls: `cpsc.gov`
   - DailyMed: `dailymed.nlm.nih.gov`
   - FRED: `fred.stlouisfed.org`
   - CoinGecko already exists and should map to Investment.
2. Do not add Product Hunt or Polygon/Massive as automated adapters until the required commercial/API permissions or paid plans are confirmed. URL-only submission can be considered separately, but it should not be presented as image-native.
3. Keep SEC EDGAR, PubMed, ClinicalTrials.gov, and openFDA out of the first platform batch. Add them later as text-first exceptions once the product explicitly supports non-image evidence cards.
4. Keep Guardian, AP, and other news-first sources out of the first platform batch until the voting UI has a clear News rubric.
5. Update `packages/node-utils/src/trustVerticals.ts` with domain-to-vertical mappings for the added domains.
6. Update the submit page platform hints/placeholders in `packages/nextjs/components/submit/ContentSubmissionSection.tsx`.
7. Update local/deploy seeding scripts so new development chains include the same approved source categories as production.
8. For source adapters, start with Open Food Facts, CPSC, DailyMed, CoinGecko, and FRED. Treat Best Buy as URL-plus-metadata first because its terms are tied to product offers/sales and temporary caching.

## Practical Policy For Curyo

- Prefer official APIs over scraping.
- Store canonical source URLs and Curyo-native submission text.
- Store image URLs only when the source terms allow it.
- Cache only when the source terms allow it, and expire cached metadata aggressively for conditional/commercial sources.
- Use server-side API keys only; never expose third-party keys in the browser.
- Include source attribution and outbound links.
- Keep health and investment disclaimers visible: ratings are human trust signals, not medical or financial advice.

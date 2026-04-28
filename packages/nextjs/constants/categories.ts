/** Split a comma-separated tags string into an array. */
export function parseTags(tagsString: string): string[] {
  if (!tagsString) return [];
  return tagsString
    .split(",")
    .map(t => t.trim())
    .filter(Boolean);
}

/** Join an array of tags into a comma-separated string for on-chain storage. */
export function serializeTags(tags: string[]): string {
  return tags.join(",");
}

const SEEDED_CATEGORY_SUBCATEGORIES: Record<string, readonly string[]> = {
  products: ["Value", "Quality", "Usability", "Durability", "Design", "Support", "Safety", "Sustainability"],
  "places-travel": [
    "Restaurants",
    "Cafes",
    "Nightlife",
    "Hotels",
    "Attractions",
    "Itineraries",
    "Service",
    "Atmosphere",
    "Accessibility",
    "Value",
    "Local Tips",
    "Family",
    "Solo Travel",
  ],
  software: [
    "Web Apps",
    "Mobile Apps",
    "Developer Tools",
    "Repos",
    "Libraries",
    "APIs",
    "Smart Contracts",
    "Productivity",
    "Onboarding",
    "Performance",
    "Trust",
    "Pricing",
  ],
  media: ["Images", "YouTube", "Education", "Entertainment", "Art", "Photography", "Audio", "Culture"],
  design: ["Visual Design", "Brand", "Typography", "Layout", "Accessibility", "Photography", "Fashion", "Architecture"],
  "ai-answers": ["Helpfulness", "Clarity", "Safety", "Creativity", "Reasoning", "Code", "Images", "Research"],
  text: [
    "Developer Docs",
    "Getting Started",
    "API Reference",
    "Tutorials",
    "Articles",
    "Research",
    "Policy",
    "Copywriting",
    "Accuracy",
    "Completeness",
    "Readability",
    "Troubleshooting",
    "Examples",
  ],
  trust: ["Trust", "Spam", "Harassment", "Moderation", "Privacy", "Disclosure", "Risk", "Policy"],
  general: ["Taste", "Usefulness", "Interesting", "Clear", "Fun", "Convincing", "Worthwhile", "Other"],
};

/** Default seeded category tags used when an indexer cannot expose on-chain subcategories. */
export function getSeededCategorySubcategories(slug: string): readonly string[] {
  return SEEDED_CATEGORY_SUBCATEGORIES[slug] ?? [];
}

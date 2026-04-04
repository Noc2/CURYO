const ASCII_WORD_BOUNDARY_CLASS = "A-Za-z0-9_";

function escapeRegexTerm(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildAsciiWordBoundaryPattern(terms: readonly string[]): string {
  const escapedTerms = terms.map(escapeRegexTerm);
  return `(^|[^${ASCII_WORD_BOUNDARY_CLASS}])(${escapedTerms.join("|")})([^${ASCII_WORD_BOUNDARY_CLASS}]|$)`;
}

export function buildSubdomainLikePattern(domain: string): string {
  return `%.${domain}`;
}

export function hostMatchesBlockedDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

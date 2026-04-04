export interface ContentModerationPolicy {
  blockedDomains: readonly string[];
  blockedTextTerms: readonly string[];
  blockedUrlTerms: readonly string[];
}

export const contentModerationPolicy: ContentModerationPolicy = {
  blockedDomains: [
    "bongacams.com",
    "brazzers.com",
    "cam4.com",
    "chaturbate.com",
    "livejasmin.com",
    "nhentai.net",
    "onlyfans.com",
    "pornhub.com",
    "redtube.com",
    "rule34.xxx",
    "stripchat.com",
    "xhamster.com",
    "xnxx.com",
    "xvideos.com",
    "youporn.com",
  ],
  blockedTextTerms: ["porn", "pornography", "xxx", "nsfw", "hentai", "rule34", "onlyfans"],
  blockedUrlTerms: [
    "porn",
    "xxx",
    "xvideos",
    "pornhub",
    "xhamster",
    "redtube",
    "xnxx",
    "youporn",
    "hentai",
    "rule34",
    "nhentai",
    "hanime",
    "brazzers",
    "onlyfans",
    "chaturbate",
    "livejasmin",
    "stripchat",
    "cam4",
    "bongacams",
  ],
};

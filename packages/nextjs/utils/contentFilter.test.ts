import { containsBlockedText, containsBlockedUrl, isContentItemBlocked } from "./contentFilter";
import assert from "node:assert/strict";
import test from "node:test";

test("containsBlockedUrl blocks explicit adult hosts for bare domains and full URLs", () => {
  assert.equal(containsBlockedUrl("xhamster.com").blocked, true);
  assert.equal(containsBlockedUrl("https://www.pornhub.com/view_video.php?viewkey=123").blocked, true);
  assert.equal(containsBlockedUrl("https://subdomain.stripchat.com/rooms/example").blocked, true);
});

test("containsBlockedUrl blocks the expanded explicit blacklist for common adult domains", () => {
  const blockedUrls = [
    "https://www.beeg.com/1",
    "https://eporner.com/video-example",
    "https://fansly.com/example",
    "https://fapello.com/example",
    "https://hanime.tv/videos/example",
    "https://hqporner.com/hdporn/example",
    "https://manyvids.com/video/example",
    "https://motherless.com/example",
    "https://nuvid.com/video/example",
    "https://porn.com/video/example",
    "https://spankbang.com/example/video",
    "https://thumbzilla.com/video/example",
    "https://tnaflix.com/video/example",
    "https://tube8.com/example/video",
    "https://txxx.com/example/video",
    "https://xhamsterlive.com/example",
    "https://youjizz.com/videos/example",
  ];

  for (const blockedUrl of blockedUrls) {
    assert.equal(containsBlockedUrl(blockedUrl).blocked, true, blockedUrl);
  }
});

test("containsBlockedUrl still blocks generic prohibited URL terms outside host matching", () => {
  assert.equal(containsBlockedUrl("https://example.com/watch/porn-compilation").blocked, true);
  assert.equal(containsBlockedUrl("https://example.com/rule34-gallery").blocked, true);
});

test("containsBlockedUrl allows unrelated domains", () => {
  assert.equal(containsBlockedUrl("https://reddit.com/r/cryptocurrency").blocked, false);
  assert.equal(containsBlockedUrl("github.com/openai/openai-node").blocked, false);
});

test("containsBlockedText uses word boundaries to reduce false positives", () => {
  assert.equal(containsBlockedText("This is NSFW artwork").blocked, true);
  assert.equal(containsBlockedText("Essex is in England").blocked, false);
});

test("isContentItemBlocked rejects blocked tags as well as title, description, and URL", () => {
  assert.equal(
    isContentItemBlocked({
      url: "https://example.com/content",
      title: "Normal title",
      description: "Normal description",
      tags: ["music", "nsfw"],
    }),
    true,
  );
});

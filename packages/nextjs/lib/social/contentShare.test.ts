import {
  buildContentShareData,
  buildContentShareRatingVersion,
  normalizeContentShareContentId,
  resolveContentShareImageUrl,
  resolveContentShareRating,
} from "./contentShare";
import assert from "node:assert/strict";
import test from "node:test";

const baseContent = {
  id: "88",
  title: "A disputed piece of content",
  description: "A compact summary for social previews.",
  rating: 42,
  ratingBps: 6_700,
  totalVotes: 12,
  lastActivityAt: "2026-04-14T10:00:00.000Z",
  openRound: null,
};

test("normalizeContentShareContentId accepts positive decimal content ids", () => {
  assert.equal(normalizeContentShareContentId("088"), "88");
  assert.equal(normalizeContentShareContentId(["88", "99"]), "88");
});

test("normalizeContentShareContentId rejects invalid content ids", () => {
  assert.equal(normalizeContentShareContentId("0"), null);
  assert.equal(normalizeContentShareContentId("-1"), null);
  assert.equal(normalizeContentShareContentId("1.5"), null);
  assert.equal(normalizeContentShareContentId(undefined), null);
});

test("resolveContentShareRating prefers the open round reference rating", () => {
  const rating = resolveContentShareRating({
    ...baseContent,
    rating: 30,
    ratingBps: 3_300,
    openRound: {
      referenceRatingBps: 7_250,
      voteCount: 2,
    },
  });

  assert.equal(rating.rating, 72.5);
  assert.equal(rating.ratingBps, 7_250);
  assert.equal(rating.label, "7.3");
  assert.equal(rating.source, "open_round_reference");
});

test("resolveContentShareRating falls back to content rating bps before raw rating", () => {
  const rating = resolveContentShareRating({
    ...baseContent,
    rating: 30,
    ratingBps: 6_125,
  });

  assert.equal(rating.rating, 61.25);
  assert.equal(rating.ratingBps, 6_125);
  assert.equal(rating.source, "content_rating_bps");
});

test("buildContentShareRatingVersion changes when rating signals change", () => {
  const first = buildContentShareRatingVersion(baseContent);
  const second = buildContentShareRatingVersion({
    ...baseContent,
    ratingBps: 6_800,
  });

  assert.notEqual(first, second);
});

test("buildContentShareRatingVersion accepts Ponder epoch-second timestamps", () => {
  assert.equal(
    buildContentShareRatingVersion({
      ...baseContent,
      lastActivityAt: "1776160800",
    }),
    "r-88-6700-12-0-1776160800",
  );
});

test("buildContentShareRatingVersion accepts Ponder epoch-millisecond timestamps", () => {
  assert.equal(
    buildContentShareRatingVersion({
      ...baseContent,
      lastActivityAt: "1776160800000",
    }),
    "r-88-6700-12-0-1776160800",
  );
});

test("buildContentShareData includes the rating in metadata and versioned share urls", () => {
  const data = buildContentShareData(baseContent, "https://www.curyo.xyz");
  const shareUrl = new URL(data.shareUrl);
  const imageUrl = new URL(data.imageUrl);

  assert.match(data.title, /Rated 6\.7\/10/);
  assert.match(data.description, /Current rating 6\.7\/10/);
  assert.equal(data.totalVotes, 12);
  assert.equal(shareUrl.pathname, "/vote");
  assert.equal(shareUrl.searchParams.get("content"), "88");
  assert.equal(shareUrl.searchParams.get("rv"), data.ratingVersion);
  assert.equal(imageUrl.pathname, "/api/og/vote");
  assert.equal(imageUrl.searchParams.get("content"), "88");
  assert.equal(imageUrl.searchParams.get("rv"), data.ratingVersion);
});

test("resolveContentShareImageUrl prefers explicit HTTPS image metadata", () => {
  assert.equal(
    resolveContentShareImageUrl({
      ...baseContent,
      imageUrl: "https://upload.wikimedia.org/example/full.png",
      thumbnailUrl: "https://upload.wikimedia.org/example/thumb.png",
      url: "https://www.youtube.com/watch?v=qRv7G7WpOoU",
    }),
    "https://upload.wikimedia.org/example/full.png",
  );
});

test("resolveContentShareImageUrl derives predictable platform thumbnails", () => {
  const data = buildContentShareData(
    {
      ...baseContent,
      url: "https://www.youtube.com/watch?v=qRv7G7WpOoU",
    },
    "https://www.curyo.xyz",
  );

  assert.equal(data.contentUrl, "https://www.youtube.com/watch?v=qRv7G7WpOoU");
  assert.equal(data.contentImageUrl, "https://img.youtube.com/vi/qRv7G7WpOoU/hqdefault.jpg");
});

test("resolveContentShareImageUrl ignores non-HTTPS image metadata", () => {
  assert.equal(
    resolveContentShareImageUrl({
      ...baseContent,
      imageUrl: "http://images.example/full.png",
      thumbnailUrl: "https://upload.wikimedia.org/example/thumb.png",
    }),
    "https://upload.wikimedia.org/example/thumb.png",
  );
});

test("resolveContentShareImageUrl ignores untrusted image hosts", () => {
  assert.equal(
    resolveContentShareImageUrl({
      ...baseContent,
      imageUrl: "https://images.example/full.png",
      thumbnailUrl: "https://images.example/thumb.png",
    }),
    null,
  );
});

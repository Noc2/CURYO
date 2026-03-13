import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRankingQuestionDisplay,
  renderRankingQuestion,
  validateRankingQuestionTemplate,
} from "~~/lib/categories/rankingQuestionTemplate";

test("validateRankingQuestionTemplate requires both placeholders", () => {
  assert.deepEqual(validateRankingQuestionTemplate("Is {title} good enough?"), {
    hasTitlePlaceholder: true,
    hasRatingPlaceholder: false,
    isValid: false,
  });

  assert.deepEqual(validateRankingQuestionTemplate("Is this good enough to score above {rating} out of 100?"), {
    hasTitlePlaceholder: false,
    hasRatingPlaceholder: true,
    isValid: false,
  });

  assert.deepEqual(validateRankingQuestionTemplate("Is {title} good enough to score above {rating} out of 100?"), {
    hasTitlePlaceholder: true,
    hasRatingPlaceholder: true,
    isValid: true,
  });
});

test("renderRankingQuestion replaces title and rating placeholders", () => {
  assert.equal(
    renderRankingQuestion("Are the fundamentals of {title} strong enough to score above {rating} out of 100?", {
      title: "Bitcoin",
      rating: 50,
      fallbackLabel: "token",
    }),
    "Are the fundamentals of Bitcoin strong enough to score above 50 out of 100?",
  );
});

test("renderRankingQuestion falls back to title-aware generic wording for legacy templates", () => {
  assert.equal(
    renderRankingQuestion("Is this worth upvoting?", {
      title: "Foundry",
      rating: 50,
      fallbackLabel: "repository",
    }),
    "Should Foundry be rated higher or lower than 50 out of 100?",
  );
});

test("buildRankingQuestionDisplay splits the rendered question around the title", () => {
  assert.deepEqual(
    buildRankingQuestionDisplay("Is {title} informative enough to score above {rating} out of 100?", {
      title: "Up From The Bottom",
      rating: 50,
      fallbackLabel: "video",
    }),
    {
      fullText: "Is Up From The Bottom informative enough to score above 50 out of 100?",
      beforeTitle: "Is ",
      title: "Up From The Bottom",
      afterTitle: " informative enough to score above 50 out of 100?",
    },
  );
});

test("buildRankingQuestionDisplay keeps legacy fallback questions split around the title", () => {
  assert.deepEqual(
    buildRankingQuestionDisplay("Is this worth upvoting?", {
      title: "Foundry",
      rating: 50,
      fallbackLabel: "repository",
    }),
    {
      fullText: "Should Foundry be rated higher or lower than 50 out of 100?",
      beforeTitle: "Should ",
      title: "Foundry",
      afterTitle: " be rated higher or lower than 50 out of 100?",
    },
  );
});

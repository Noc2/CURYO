import assert from "node:assert/strict";
import test from "node:test";
import { getSafeHuggingFaceImageUrl, isHuggingFaceAvatarUrl } from "~~/lib/content/huggingFaceImage";

test("getSafeHuggingFaceImageUrl trims escaped JSON after avatar URLs", () => {
  assert.equal(
    getSafeHuggingFaceImageUrl(
      "https://cdn-avatars.huggingface.co/v1/production/uploads/66309bd090589b7c65950665/RcOk7ysh7nEt5YlHHzauj.jpeg&quot;,&quot;type&quot;:&quot;update&quot;",
    ),
    "https://cdn-avatars.huggingface.co/v1/production/uploads/66309bd090589b7c65950665/RcOk7ysh7nEt5YlHHzauj.jpeg",
  );
});

test("getSafeHuggingFaceImageUrl accepts Hugging Face raw model assets", () => {
  assert.equal(
    getSafeHuggingFaceImageUrl(
      " https://huggingface.co/dealignai/Gemma-4-31B-JANG_4M-CRACK/raw/main/dealign_mascot.png ",
    ),
    "https://huggingface.co/dealignai/Gemma-4-31B-JANG_4M-CRACK/raw/main/dealign_mascot.png",
  );
});

test("getSafeHuggingFaceImageUrl rejects malformed and non-Hugging Face URLs", () => {
  assert.equal(getSafeHuggingFaceImageUrl("not a url"), null);
  assert.equal(getSafeHuggingFaceImageUrl("http://huggingface.co/example/raw/main/image.png"), null);
  assert.equal(getSafeHuggingFaceImageUrl("https://example.com/avatar.png"), null);
});

test("isHuggingFaceAvatarUrl distinguishes org avatars from raw model assets", () => {
  assert.equal(
    isHuggingFaceAvatarUrl(
      "https://cdn-avatars.huggingface.co/v1/production/uploads/66309bd090589b7c65950665/RcOk7ysh7nEt5YlHHzauj.jpeg",
    ),
    true,
  );
  assert.equal(
    isHuggingFaceAvatarUrl("https://huggingface.co/dealignai/Gemma-4-31B-JANG_4M-CRACK/raw/main/dealign_mascot.png"),
    false,
  );
});

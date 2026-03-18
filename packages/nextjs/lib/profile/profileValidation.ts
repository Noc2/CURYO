import { sanitizeExternalUrl } from "~~/utils/externalUrl";

export const MAX_PROFILE_IMAGE_URL_LENGTH = 512;
export const MAX_PROFILE_STRATEGY_LENGTH = 560;

type ProfileImageUrlValidation =
  | {
      error: null;
      sanitizedImageUrl: string | null;
    }
  | {
      error: string;
      sanitizedImageUrl: null;
    };

export function validateProfileImageUrl(imageInput: string): ProfileImageUrlValidation {
  const trimmedImageInput = imageInput.trim();

  if (!trimmedImageInput) {
    return { error: null, sanitizedImageUrl: null };
  }

  if (trimmedImageInput.length > MAX_PROFILE_IMAGE_URL_LENGTH) {
    return {
      error: `Profile image URL must be ${MAX_PROFILE_IMAGE_URL_LENGTH} characters or fewer`,
      sanitizedImageUrl: null,
    };
  }

  const sanitizedImageUrl = sanitizeExternalUrl(trimmedImageInput);
  if (!sanitizedImageUrl) {
    return {
      error: "Please enter a valid HTTPS URL for the image",
      sanitizedImageUrl: null,
    };
  }

  return { error: null, sanitizedImageUrl };
}

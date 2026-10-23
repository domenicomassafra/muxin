/**
 * A device asset is shown only when one is named and that exact asset has not
 * failed to load. Failure is scoped to the exact asset name, so reusing a
 * surface for another host starts clean instead of inheriting the previous
 * host's failure.
 */
export function deviceImageVisible(
  image?: string | null,
  failedImage?: string | null,
): boolean {
  return Boolean(image) && failedImage !== image;
}

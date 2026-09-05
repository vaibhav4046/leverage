export function slugify(input) {
  if (typeof input !== 'string') {
    throw new TypeError('input must be a string');
  }

  // Lowercase the entire string
  let slug = input.toLowerCase();

  // Replace any sequence of non‑alphanumeric characters with a single hyphen
  slug = slug.replace(/[^a-z0-9]+/g, '-');

  // Collapse consecutive hyphens into one
  slug = slug.replace(/-+/g, '-');

  // Trim leading and trailing hyphens
  slug = slug.replace(/^-+|-+$/g, '');

  // Throw if nothing remains after sanitisation
  if (slug === '') {
    throw new Error('slug would be empty');
  }

  return slug;
}
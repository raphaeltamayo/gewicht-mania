/**
 * The reference photograph, used as the hero image and as the thumbnail on each
 * train panel.
 *
 * Drop the file in as `src/assets/train.jpg` (`.png` and `.webp` work too). It is
 * resolved with a glob rather than a plain import so the app still builds and
 * runs while the file is missing: the UI falls back to a plain coloured band.
 */
const found = import.meta.glob('../assets/train.{jpg,jpeg,png,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export const TRAIN_PHOTO: string | null = Object.values(found)[0] ?? null;

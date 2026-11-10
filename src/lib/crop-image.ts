/** Area of the original picture to keep, in the picture's own pixels. */
export type CropArea = { x: number; y: number; width: number; height: number };

/** Longest side of a cropped picture; bigger crops are scaled down before upload. */
export const CROP_MAX_SIDE = 1080;

/** Size of the saved picture for a crop: same shape, longest side at most `max`. */
export function cropOutputSize(area: CropArea, max = CROP_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(area.width, area.height));
  return { width: Math.max(1, Math.round(area.width * scale)), height: Math.max(1, Math.round(area.height * scale)) };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Bad picture'));
    img.src = src;
  });
}

/** Size of the box a w×h picture fills once turned by `deg` degrees (crop areas are measured in this box). */
export function rotatedSize(w: number, h: number, deg: number): { width: number; height: number } {
  const r = (deg * Math.PI) / 180;
  return {
    width: Math.round(Math.abs(Math.cos(r) * w) + Math.abs(Math.sin(r) * h)),
    height: Math.round(Math.abs(Math.sin(r) * w) + Math.abs(Math.cos(r) * h)),
  };
}

/** Cuts the chosen area out of a (possibly turned) picture and returns it as a JPEG file ready to upload. */
export async function cropToFile(src: string, area: CropArea, name = 'picture', rotation = 0): Promise<File> {
  const img = await loadImage(src);
  // Turn the whole picture first, so the area lines up with what the member saw.
  const box = rotatedSize(img.naturalWidth, img.naturalHeight, rotation);
  const turned = document.createElement('canvas');
  turned.width = box.width;
  turned.height = box.height;
  const tctx = turned.getContext('2d');
  if (!tctx) throw new Error('No canvas');
  tctx.translate(box.width / 2, box.height / 2);
  tctx.rotate((rotation * Math.PI) / 180);
  tctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

  const { width, height } = cropOutputSize(area);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(turned, area.x, area.y, area.width, area.height, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
  if (!blob) throw new Error('Crop failed');
  return new File([blob], `${name.replace(/\.[^.]+$/, '') || 'picture'}.jpg`, { type: 'image/jpeg' });
}

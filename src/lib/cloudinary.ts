// Unsigned browser uploads to Cloudinary. Images and videos are detected from the file type.
const CLOUD_NAME = 'zsxxjkqg';
const UPLOAD_PRESET = 'voli_uploads';

export type MediaKind = 'image' | 'video';

export function mediaKind(file: File): MediaKind {
  return file.type.startsWith('video/') ? 'video' : 'image';
}

/** Uploads a picture or video into the given folder and returns its secure address. */
export async function uploadToCloudinary(file: File, folder: string): Promise<string> {
  const kind = mediaKind(file);
  const body = new FormData();
  body.append('file', file);
  body.append('upload_preset', UPLOAD_PRESET);
  body.append('folder', folder);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${kind}/upload`, { method: 'POST', body });
  if (!res.ok) throw new Error(`Cloudinary upload failed [${res.status}]: ${await res.text()}`);
  const json = (await res.json()) as { secure_url?: string };
  if (!json.secure_url) throw new Error('Cloudinary upload returned no address');
  return json.secure_url;
}

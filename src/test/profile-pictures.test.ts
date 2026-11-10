import { describe, it, expect } from 'vitest';
import { cropOutputSize, rotatedSize } from '@/lib/crop-image';
import { coverPictures } from '@/lib/profile-info';

const pic = (n: number) => `https://res.cloudinary.com/zsxxjkqg/image/upload/v1/voli/album/p${n}.jpg`;

describe('cropping before upload', () => {
  it('a big crop is scaled down so its longest side is 1080', () => {
    expect(cropOutputSize({ x: 0, y: 0, width: 3000, height: 3000 })).toEqual({ width: 1080, height: 1080 });
  });

  it('a small crop keeps its own size', () => {
    expect(cropOutputSize({ x: 10, y: 10, width: 400, height: 400 })).toEqual({ width: 400, height: 400 });
  });

  it('turning a picture a quarter swaps its width and height', () => {
    expect(rotatedSize(1200, 800, 90)).toEqual({ width: 800, height: 1200 });
    expect(rotatedSize(1200, 800, 180)).toEqual({ width: 1200, height: 800 });
  });
});

describe('profile cover', () => {
  it('shows the album pictures when there are any', () => {
    expect(coverPictures([pic(1), pic(2)], 'avatar.jpg')).toEqual([pic(1), pic(2)]);
  });

  it('falls back to the avatar when the album is empty', () => {
    expect(coverPictures([], 'avatar.jpg')).toEqual(['avatar.jpg']);
  });

  it('shows nothing when there is neither', () => {
    expect(coverPictures([], null)).toEqual([]);
  });
});

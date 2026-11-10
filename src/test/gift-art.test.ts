import { describe, it, expect } from 'vitest';
import { GIFT_ART, toGifts } from '@/lib/gifts';

describe('gift pictures', () => {
  it('uses art_url when the catalog has one', () => {
    expect(toGifts([{ key: 'rose', name: 'وردة', price: 1, art_url: 'https://cdn.example/rose.webp' }])[0]!.art)
      .toBe('https://cdn.example/rose.webp');
  });

  it('falls back to the built-in picture when art_url is empty or missing', () => {
    expect(toGifts([{ key: 'rose', name: 'وردة', price: 1, art_url: null }])[0]!.art).toBe(GIFT_ART['rose']);
    expect(toGifts([{ key: 'rose', name: 'وردة', price: 1, art_url: '  ' }])[0]!.art).toBe(GIFT_ART['rose']);
    expect(toGifts([{ key: 'rose', name: 'وردة', price: 1 }])[0]!.art).toBe(GIFT_ART['rose']);
  });

  it('keeps a gift with art_url even without a built-in picture', () => {
    expect(toGifts([{ key: 'castle', name: 'قلعة', price: 500, art_url: 'https://cdn.example/castle.webp' }]))
      .toEqual([{ key: 'castle', name: 'قلعة', price: 500, art: 'https://cdn.example/castle.webp', video: null }]);
  });

  it('keeps the video link of a video gift', () => {
    const video = 'https://res.cloudinary.com/zsxxjkqg/video/upload/v1/voli/gifts/lion.mp4';
    expect(toGifts([{ key: 'lion', name: 'الأسد', price: 30000, video_url: video }])[0]!.video).toBe(video);
  });

  it('hides a gift with neither art_url nor a built-in picture', () => {
    expect(toGifts([{ key: 'castle', name: 'قلعة', price: 500, art_url: null }])).toEqual([]);
  });
});

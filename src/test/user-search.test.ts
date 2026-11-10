import { describe, expect, it } from 'vitest';
import { idSearchFilter, parseIdQuery } from '@/lib/user-search';

describe('parseIdQuery', () => {
  it('accepts plain digits', () => expect(parseIdQuery('1234567')).toBe('1234567'));
  it('accepts Arabic digits', () => expect(parseIdQuery('١٢٣٤٥٦٧')).toBe('1234567'));
  it('ignores an ID: prefix and spaces', () => expect(parseIdQuery(' ID: 777 ')).toBe('777'));
  it('rejects names', () => expect(parseIdQuery('ahmed')).toBeNull());
  it('rejects more than 10 digits', () => expect(parseIdQuery('12345678901')).toBeNull());
});

describe('idSearchFilter', () => {
  it('a 7-digit number matches the normal ID or a special ID', () =>
    expect(idSearchFilter('1234567')).toBe('public_id.eq.1234567,special_id.eq.1234567'));
  it('a short number only matches special IDs', () => expect(idSearchFilter('777')).toBe('special_id.eq.777'));
  it('a leading zero matches nothing', () => expect(idSearchFilter('0777')).toBeNull());
  it('without special IDs only the normal ID is searched', () =>
    expect(idSearchFilter('1234567', false)).toBe('public_id.eq.1234567'));
});

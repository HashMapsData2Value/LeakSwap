import {
  genScalar,
} from './algorand-utils';

describe('algorand-utils test', () => {
  it('genScalar should generate a valid 32-byte scalar', () => {
    const scalar = genScalar();
    expect(scalar).toBeInstanceOf(Uint8Array);
    expect(scalar.length).toBe(32);
  });
});
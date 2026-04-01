import { parseAddedLines } from '../src/diff-parser';

describe('parseAddedLines', () => {
  it('returns an empty set for an empty patch', () => {
    expect(parseAddedLines('')).toEqual(new Set());
  });

  it('correctly identifies a single added line', () => {
    const patch = [
      '@@ -1,3 +1,4 @@',
      ' context line 1',
      '+added line',
      ' context line 2',
      ' context line 3',
    ].join('\n');

    expect(parseAddedLines(patch)).toEqual(new Set([2]));
  });

  it('handles multiple added lines in one hunk', () => {
    const patch = [
      '@@ -1,3 +1,5 @@',
      ' context',
      '+added at 2',
      '+added at 3',
      ' context',
      ' context',
    ].join('\n');

    expect(parseAddedLines(patch)).toEqual(new Set([2, 3]));
  });

  it('handles removed lines without advancing the new-file counter', () => {
    const patch = [
      '@@ -1,3 +1,2 @@',
      ' context',
      '-removed line',
      ' context',
    ].join('\n');

    expect(parseAddedLines(patch)).toEqual(new Set());
  });

  it('handles multiple hunks', () => {
    const patch = [
      '@@ -1,3 +1,4 @@',
      ' context',
      '+added at line 2',
      ' context',
      ' context',
      '@@ -10,3 +11,4 @@',
      ' context',
      '+added at line 12',
      ' context',
      ' context',
    ].join('\n');

    expect(parseAddedLines(patch)).toEqual(new Set([2, 12]));
  });

  it('ignores +++ file header lines', () => {
    const patch = [
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,1 +1,2 @@',
      ' existing',
      '+new line',
    ].join('\n');

    expect(parseAddedLines(patch)).toEqual(new Set([2]));
  });

  it('handles a new file (all lines added)', () => {
    const patch = [
      '@@ -0,0 +1,3 @@',
      '+line one',
      '+line two',
      '+line three',
    ].join('\n');

    expect(parseAddedLines(patch)).toEqual(new Set([1, 2, 3]));
  });
});

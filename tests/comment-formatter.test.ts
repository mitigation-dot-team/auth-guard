import { formatComment, COMMENT_MARKER } from '../src/comment-formatter';
import type { RouteViolation } from '../src/types';

const baseViolation: RouteViolation = {
  file: 'src/routes/users.ts',
  method: 'GET',
  path: '/users',
  line: 10,
  framework: 'express',
  isSensitive: true,
};

describe('formatComment', () => {
  it('includes the COMMENT_MARKER sentinel', () => {
    const comment = formatComment([baseViolation]);
    expect(comment).toContain(COMMENT_MARKER);
  });

  it('includes "AuthGuard" in the heading', () => {
    const comment = formatComment([baseViolation]);
    expect(comment).toContain('AuthGuard');
  });

  it('mentions the file name', () => {
    const comment = formatComment([baseViolation]);
    expect(comment).toContain('src/routes/users.ts');
  });

  it('mentions the HTTP method and path', () => {
    const comment = formatComment([baseViolation]);
    expect(comment).toContain('GET');
    expect(comment).toContain('/users');
  });

  it('mentions authentication in the recommendation', () => {
    const comment = formatComment([baseViolation]);
    expect(comment.toLowerCase()).toContain('auth');
  });

  it('shows ⚠️ for sensitive routes', () => {
    const comment = formatComment([baseViolation]);
    expect(comment).toContain('⚠️');
  });

  it('does not show ⚠️ for non-sensitive routes', () => {
    const nonSensitive: RouteViolation = { ...baseViolation, isSensitive: false };
    const comment = formatComment([nonSensitive]);
    expect(comment).not.toContain('⚠️');
  });

  it('lists all violations in the output', () => {
    const violations: RouteViolation[] = [
      { ...baseViolation, path: '/alpha', method: 'GET' },
      { ...baseViolation, path: '/beta', method: 'POST', isSensitive: false },
    ];
    const comment = formatComment(violations);
    expect(comment).toContain('/alpha');
    expect(comment).toContain('/beta');
    expect(comment).toContain('GET');
    expect(comment).toContain('POST');
  });

  it('reports the correct violation count in the summary', () => {
    const violations: RouteViolation[] = [
      baseViolation,
      { ...baseViolation, path: '/other' },
    ];
    const comment = formatComment(violations);
    expect(comment).toContain('**2**');
  });

  it('shows singular wording for a single violation', () => {
    const comment = formatComment([baseViolation]);
    expect(comment).toContain('**1** endpoint ');
  });

  it('shows plural wording for multiple violations', () => {
    const violations = [baseViolation, { ...baseViolation, path: '/other' }];
    const comment = formatComment(violations);
    expect(comment).toContain('endpoints');
  });

  it('mentions NestJS in the recommendation section', () => {
    const nestViolation: RouteViolation = {
      ...baseViolation,
      framework: 'nestjs',
    };
    const comment = formatComment([nestViolation]);
    expect(comment).toContain('NestJS');
  });

  it('escapes pipe characters in file names to not break table', () => {
    const v: RouteViolation = { ...baseViolation, file: 'src/pipe|name.ts' };
    const comment = formatComment([v]);
    expect(comment).toContain('\\|');
  });

  it('uses double-backtick delimiters when path contains a backtick', () => {
    const v: RouteViolation = { ...baseViolation, path: '/path`with`tick' };
    const comment = formatComment([v]);
    expect(comment).toContain('`` ');
  });
});

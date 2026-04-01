import type { RouteViolation } from './types';

/** HTML comment marker used to identify existing auth-guard PR comments. */
export const COMMENT_MARKER = '<!-- auth-guard-comment -->';

/**
 * Build the Markdown body for a GitHub PR comment that lists all
 * route violations found in the diff.
 */
export function formatComment(violations: RouteViolation[]): string {
  const count = violations.length;
  const sensitiveCount = violations.filter((v) => v.isSensitive).length;

  const lines: string[] = [];

  lines.push(COMMENT_MARKER);
  lines.push('## 🔒 AuthGuard Security Warning');
  lines.push('');
  lines.push(
    `Found **${count}** endpoint${count === 1 ? '' : 's'} without authentication middleware` +
      (sensitiveCount > 0
        ? ` (**${sensitiveCount}** on sensitive route${sensitiveCount === 1 ? '' : 's'})`
        : '') +
      '.',
  );
  lines.push('');

  // Table of violations
  lines.push('| File | Line | Method | Route | Sensitive |');
  lines.push('|------|------|--------|-------|-----------|');
  for (const v of violations) {
    const sensitive = v.isSensitive ? '⚠️ Yes' : 'No';
    lines.push(
      `| \`${v.file}\` | ${v.line} | \`${v.method}\` | \`${v.path}\` | ${sensitive} |`,
    );
  }

  lines.push('');
  lines.push('### Recommendation');
  lines.push('');
  lines.push(
    'Add authentication middleware before the route handler. For example:',
  );
  lines.push('');
  lines.push('**Express / Fastify:**');
  lines.push('```javascript');
  lines.push('// ❌ Without auth:');
  lines.push("app.get('/users', getUsers)");
  lines.push('');
  lines.push('// ✅ With auth middleware:');
  lines.push("app.get('/users', authMiddleware, getUsers)");
  lines.push('```');
  lines.push('');
  lines.push('**NestJS:**');
  lines.push('```typescript');
  lines.push('// ❌ Without guard:');
  lines.push("@Get('/users')");
  lines.push('getUsers() {}');
  lines.push('');
  lines.push('// ✅ With guard:');
  lines.push('@UseGuards(AuthGuard)');
  lines.push("@Get('/users')");
  lines.push('getUsers() {}');
  lines.push('```');

  return lines.join('\n');
}

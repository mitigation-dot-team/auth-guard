import { parse, type ParserOptions } from '@babel/parser';
import _traverse from '@babel/traverse';
import type { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import type { RouteViolation } from './types';

// Handle CommonJS / ESM interop for @babel/traverse
const traverse = ((_traverse as unknown as { default: typeof _traverse }).default ??
  _traverse) as typeof _traverse;

// HTTP methods recognised on Express / Fastify route objects
const HTTP_METHODS = new Set([
  'get',
  'post',
  'put',
  'delete',
  'patch',
  'options',
  'head',
  'all',
]);

// NestJS HTTP method decorators
const NESTJS_HTTP_DECORATORS = new Set([
  'Get',
  'Post',
  'Put',
  'Delete',
  'Patch',
  'Options',
  'Head',
  'All',
]);

// Sensitive path patterns – routes matching these warrant an extra warning
const SENSITIVE_PATTERNS = [
  /admin/i,
  /user/i,
  /account/i,
  /profile/i,
  /payment/i,
  /order/i,
  /transaction/i,
  /secret/i,
  /token/i,
  /password/i,
  /credential/i,
  /setting/i,
  /config/i,
  /private/i,
];

export function isSensitivePath(routePath: string): boolean {
  return SENSITIVE_PATTERNS.some((re) => re.test(routePath));
}

function buildParserOptions(filename: string): ParserOptions {
  const isTypeScript = /\.tsx?$/.test(filename);
  return {
    sourceType: 'module',
    allowImportExportEverywhere: true,
    allowReturnOutsideFunction: true,
    errorRecovery: true,
    plugins: [
      ...(isTypeScript
        ? (['typescript'] as const)
        : (['flow'] as const)),
      'decorators-legacy',
      'jsx',
    ],
  };
}

function tryParse(content: string, filename: string) {
  try {
    return parse(content, buildParserOptions(filename));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Express / Fastify analyzer
// ---------------------------------------------------------------------------

/**
 * Detect `app.METHOD(path, handler)` and `router.METHOD(path, handler)` calls
 * that have **no** intermediate middleware argument.
 *
 * The check is: if there are exactly 2 arguments (path + handler) the route
 * has no middleware and is flagged.  3+ arguments means at least one
 * middleware is present.
 */
export function analyzeExpressRoutes(
  content: string,
  filename: string,
  addedLines: Set<number>,
): RouteViolation[] {
  const violations: RouteViolation[] = [];
  const ast = tryParse(content, filename);
  if (!ast) return violations;

  traverse(ast, {
    CallExpression(path: NodePath<t.CallExpression>) {
      const { node } = path;

      if (!t.isMemberExpression(node.callee)) return;

      const { property } = node.callee;
      if (!t.isIdentifier(property)) return;

      const method = property.name.toLowerCase();
      if (!HTTP_METHODS.has(method)) return;

      // Require at least (path, handler)
      if (node.arguments.length < 2) return;

      const firstArg = node.arguments[0];
      let routePath = '';
      if (t.isStringLiteral(firstArg)) {
        routePath = firstArg.value;
      } else if (t.isTemplateLiteral(firstArg)) {
        routePath = firstArg.quasis
          .map((q) => q.value.cooked ?? '')
          .join('*');
      }

      const line = node.loc?.start.line ?? 0;

      // Only report lines that were introduced in this diff
      if (!addedLines.has(line)) return;

      // If there are more than 2 arguments a middleware is present → OK
      if (node.arguments.length > 2) return;

      violations.push({
        file: filename,
        method: method === 'all' ? 'ALL' : method.toUpperCase(),
        path: routePath || '(unknown)',
        line,
        framework: 'express',
        isSensitive: isSensitivePath(routePath),
      });
    },
  });

  return violations;
}

// ---------------------------------------------------------------------------
// NestJS analyzer
// ---------------------------------------------------------------------------

function getDecoratorName(decorator: t.Decorator): string | null {
  const { expression } = decorator;
  if (t.isIdentifier(expression)) return expression.name;
  if (t.isCallExpression(expression) && t.isIdentifier(expression.callee)) {
    return expression.callee.name;
  }
  return null;
}

function getDecoratorStringArg(
  decorator: t.Decorator,
  index = 0,
): string | null {
  const { expression } = decorator;
  if (t.isCallExpression(expression)) {
    const arg = expression.arguments[index];
    if (arg && t.isStringLiteral(arg)) return arg.value;
  }
  return null;
}

/**
 * Detect NestJS controller methods decorated with `@Get`, `@Post`, etc.
 * that are not protected by `@UseGuards` at either the class or method level.
 */
export function analyzeNestJSRoutes(
  content: string,
  filename: string,
  addedLines: Set<number>,
): RouteViolation[] {
  const violations: RouteViolation[] = [];
  const ast = tryParse(content, filename);
  if (!ast) return violations;

  traverse(ast, {
    ClassDeclaration(path: NodePath<t.ClassDeclaration>) {
      const { node } = path;
      const classDecorators: t.Decorator[] = node.decorators ?? [];

      const controllerDecorator = classDecorators.find(
        (d) => getDecoratorName(d) === 'Controller',
      );
      if (!controllerDecorator) return;

      const controllerPath = getDecoratorStringArg(controllerDecorator) ?? '';
      const classHasGuards = classDecorators.some(
        (d) => getDecoratorName(d) === 'UseGuards',
      );

      for (const member of node.body.body) {
        if (!t.isClassMethod(member)) continue;

        const methodDecorators: t.Decorator[] =
          (member as t.ClassMethod).decorators ?? [];

        const httpDecorator = methodDecorators.find((d) => {
          const name = getDecoratorName(d);
          return name !== null && NESTJS_HTTP_DECORATORS.has(name);
        });

        if (!httpDecorator) continue;

        const line = member.loc?.start.line ?? 0;

        // Only report lines introduced in this diff
        if (!addedLines.has(line)) continue;

        const methodHasGuards = methodDecorators.some(
          (d) => getDecoratorName(d) === 'UseGuards',
        );

        // Skip if the class or method is already guarded
        if (classHasGuards || methodHasGuards) continue;

        const httpDecoratorName = getDecoratorName(httpDecorator) ?? 'GET';
        const methodPath = getDecoratorStringArg(httpDecorator) ?? '';
        const fullPath = [controllerPath, methodPath]
          .filter(Boolean)
          .join('/')
          .replace(/\/+/g, '/');

        violations.push({
          file: filename,
          method: httpDecoratorName.toUpperCase(),
          path: `/${fullPath}`.replace(/\/+/g, '/'),
          line,
          framework: 'nestjs',
          isSensitive: isSensitivePath(fullPath),
        });
      }
    },
  });

  return violations;
}

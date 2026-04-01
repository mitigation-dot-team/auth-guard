import {
  analyzeExpressRoutes,
  analyzeNestJSRoutes,
  isSensitivePath,
} from '../src/ast-analyzer';

// Helper: treat every line in the snippet as "added"
function allLines(code: string): Set<number> {
  const count = code.split('\n').length;
  return new Set(Array.from({ length: count }, (_, i) => i + 1));
}

// ---------------------------------------------------------------------------
// Express / Fastify
// ---------------------------------------------------------------------------
describe('analyzeExpressRoutes', () => {
  it('detects app.get without middleware', () => {
    const code = `app.get('/users', getUsers);`;
    const violations = analyzeExpressRoutes(code, 'app.js', allLines(code));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ method: 'GET', path: '/users', framework: 'express' });
  });

  it('detects app.post without middleware', () => {
    const code = `app.post('/login', handleLogin);`;
    const violations = analyzeExpressRoutes(code, 'app.js', allLines(code));
    expect(violations).toHaveLength(1);
    expect(violations[0].method).toBe('POST');
  });

  it('detects router.get without middleware', () => {
    const code = `router.get('/profile', getProfile);`;
    const violations = analyzeExpressRoutes(code, 'router.js', allLines(code));
    expect(violations).toHaveLength(1);
    expect(violations[0].method).toBe('GET');
  });

  it('detects router.post without middleware', () => {
    const code = `router.post('/orders', createOrder);`;
    const violations = analyzeExpressRoutes(code, 'router.js', allLines(code));
    expect(violations).toHaveLength(1);
    expect(violations[0].method).toBe('POST');
  });

  it('does NOT flag routes with one middleware', () => {
    const code = `app.get('/users', authMiddleware, getUsers);`;
    const violations = analyzeExpressRoutes(code, 'app.js', allLines(code));
    expect(violations).toHaveLength(0);
  });

  it('does NOT flag routes with multiple middlewares', () => {
    const code = `app.get('/admin', verifyJwt, checkRole, getAdminData);`;
    const violations = analyzeExpressRoutes(code, 'app.js', allLines(code));
    expect(violations).toHaveLength(0);
  });

  it('does NOT flag routes whose line is not in addedLines', () => {
    const code = `app.get('/users', getUsers);`;
    const violations = analyzeExpressRoutes(code, 'app.js', new Set());
    expect(violations).toHaveLength(0);
  });

  it('handles TypeScript files (.ts extension)', () => {
    const code = `app.get('/settings', getSettings);`;
    const violations = analyzeExpressRoutes(code, 'routes.ts', allLines(code));
    expect(violations).toHaveLength(1);
  });

  it('handles DELETE, PUT and PATCH methods', () => {
    const code = [
      `app.delete('/items/:id', deleteItem);`,
      `app.put('/items/:id', updateItem);`,
      `app.patch('/items/:id', patchItem);`,
    ].join('\n');
    const violations = analyzeExpressRoutes(code, 'app.js', allLines(code));
    expect(violations).toHaveLength(3);
    expect(violations.map((v) => v.method)).toEqual(['DELETE', 'PUT', 'PATCH']);
  });

  it('marks a /users route as sensitive', () => {
    const code = `app.get('/users', getUsers);`;
    const violations = analyzeExpressRoutes(code, 'app.js', allLines(code));
    expect(violations[0].isSensitive).toBe(true);
  });

  it('marks a /health route as NOT sensitive', () => {
    const code = `app.get('/health', healthCheck);`;
    const violations = analyzeExpressRoutes(code, 'app.js', allLines(code));
    expect(violations[0].isSensitive).toBe(false);
  });

  it('returns empty array for unparseable content', () => {
    const code = `THIS IS NOT JAVASCRIPT $$$$`;
    const violations = analyzeExpressRoutes(code, 'app.js', allLines(code));
    expect(violations).toEqual([]);
  });

  it('handles template-literal paths', () => {
    const code = 'app.get(`/api/v1/users`, getUsers);';
    const violations = analyzeExpressRoutes(code, 'app.js', allLines(code));
    expect(violations).toHaveLength(1);
    expect(violations[0].path).toContain('api');
  });
});

// ---------------------------------------------------------------------------
// NestJS
// ---------------------------------------------------------------------------
describe('analyzeNestJSRoutes', () => {
  it('detects a @Get method without @UseGuards', () => {
    const code = `
import { Controller, Get } from '@nestjs/common';

@Controller('users')
export class UsersController {
  @Get()
  getUsers() {
    return [];
  }
}
`.trim();
    const violations = analyzeNestJSRoutes(
      code,
      'users.controller.ts',
      allLines(code),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      method: 'GET',
      framework: 'nestjs',
      path: '/users',
    });
  });

  it('detects a @Post method without @UseGuards', () => {
    const code = `
@Controller('orders')
export class OrdersController {
  @Post()
  create() {}
}
`.trim();
    const violations = analyzeNestJSRoutes(
      code,
      'orders.controller.ts',
      allLines(code),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].method).toBe('POST');
  });

  it('does NOT flag a method with @UseGuards on the method', () => {
    const code = `
@Controller('users')
export class UsersController {
  @UseGuards(JwtAuthGuard)
  @Get()
  getUsers() {}
}
`.trim();
    const violations = analyzeNestJSRoutes(
      code,
      'users.controller.ts',
      allLines(code),
    );
    expect(violations).toHaveLength(0);
  });

  it('does NOT flag methods when @UseGuards is on the controller class', () => {
    const code = `
@Controller('admin')
@UseGuards(RolesGuard)
export class AdminController {
  @Get()
  getData() {}

  @Post()
  create() {}
}
`.trim();
    const violations = analyzeNestJSRoutes(
      code,
      'admin.controller.ts',
      allLines(code),
    );
    expect(violations).toHaveLength(0);
  });

  it('does NOT flag methods whose line is not in addedLines', () => {
    const code = `
@Controller('users')
export class UsersController {
  @Get()
  getUsers() {}
}
`.trim();
    const violations = analyzeNestJSRoutes(
      code,
      'users.controller.ts',
      new Set(),
    );
    expect(violations).toHaveLength(0);
  });

  it('does NOT flag a class that is not a @Controller', () => {
    const code = `
export class UserService {
  @Get()
  doSomething() {}
}
`.trim();
    const violations = analyzeNestJSRoutes(
      code,
      'user.service.ts',
      allLines(code),
    );
    expect(violations).toHaveLength(0);
  });

  it('builds the correct full path from controller + method paths', () => {
    const code = `
@Controller('api/v1')
export class ItemsController {
  @Get('items')
  list() {}
}
`.trim();
    const violations = analyzeNestJSRoutes(
      code,
      'items.controller.ts',
      allLines(code),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].path).toBe('/api/v1/items');
  });
});

// ---------------------------------------------------------------------------
// isSensitivePath
// ---------------------------------------------------------------------------
describe('isSensitivePath', () => {
  it.each([
    '/admin/dashboard',
    '/users',
    '/account/settings',
    '/payment/checkout',
    '/profile',
    '/api/secret',
    '/token/refresh',
    '/password/reset',
  ])('marks %s as sensitive', (p) => {
    expect(isSensitivePath(p)).toBe(true);
  });

  it.each(['/health', '/status', '/ping', '/metrics'])(
    'marks %s as NOT sensitive',
    (p) => {
      expect(isSensitivePath(p)).toBe(false);
    },
  );
});

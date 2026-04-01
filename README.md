# auth-guard

A GitHub Action that analyses the diff of every pull request and automatically flags new API endpoints that are missing authentication middleware.

## Supported Frameworks

| Framework | Detection |
|-----------|-----------|
| **Express** | `app.get`, `app.post`, `router.get`, `router.post`, … without a middleware argument |
| **Fastify** | Same pattern (`fastify.get`, etc.) |
| **NestJS** | `@Get`, `@Post`, … decorators on controller methods without `@UseGuards` |

## What it detects

```typescript
// ❌ No middleware – flagged by auth-guard
app.get('/users', getUsers)
router.post('/orders', createOrder)

// ✅ Middleware present – not flagged
app.get('/users', authMiddleware, getUsers)
```

```typescript
// ❌ No guard – flagged
@Controller('users')
export class UsersController {
  @Get()
  getUsers() {}
}

// ✅ Guard present – not flagged
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  @Get()
  getUsers() {}
}
```

## Usage

Add the action to any workflow that runs on pull requests:

```yaml
name: Security Check

on:
  pull_request:

jobs:
  auth-guard:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: mitigation-dot-team/auth-guard@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          # Optionally fail the CI job when violations are found:
          fail-on-violation: 'true'
```

## Inputs

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `github-token` | Yes | `${{ github.token }}` | Token used to read the diff and post comments |
| `fail-on-violation` | No | `false` | Set to `true` to fail the workflow when violations are found |

## Outputs

| Name | Description |
|------|-------------|
| `violations` | JSON array of detected `RouteViolation` objects |

## Example comment

When violations are found the action posts (and updates on subsequent pushes) a comment like:

> ### 🔒 AuthGuard Security Warning
>
> Found **2** endpoints without authentication middleware (**1** on sensitive routes).
>
> | File | Line | Method | Route | Sensitive |
> |------|------|--------|-------|-----------|
> | `src/routes/users.ts` | 12 | `GET` | `/users` | ⚠️ Yes |
> | `src/routes/items.ts` | 7 | `POST` | `/items` | No |
>
> …followed by code examples showing how to add middleware.

If all violations are fixed on a subsequent push the comment is automatically removed.

## Development

```bash
npm install          # install dependencies
npm test             # run unit tests (Jest)
npm run lint         # TypeScript type-check
npm run build        # compile → dist/index.js (ncc bundle)
```

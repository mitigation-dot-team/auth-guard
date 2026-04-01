import * as core from '@actions/core';
import * as github from '@actions/github';
import { parseAddedLines } from './diff-parser';
import { analyzeExpressRoutes, analyzeNestJSRoutes } from './ast-analyzer';
import { formatComment, COMMENT_MARKER } from './comment-formatter';
import type { RouteViolation } from './types';

/** File extensions that the analyzer can handle. */
function isAnalyzableFile(filename: string): boolean {
  return /\.(js|ts|jsx|tsx)$/.test(filename);
}

async function run(): Promise<void> {
  try {
    const token = core.getInput('github-token', { required: true });
    const failOnViolation =
      core.getInput('fail-on-violation').toLowerCase() === 'true';

    const octokit = github.getOctokit(token);
    const ctx = github.context;

    if (!ctx.payload.pull_request) {
      core.info('Not a pull_request event – skipping.');
      return;
    }

    const { owner, repo } = ctx.repo;
    const pullNumber = ctx.payload.pull_request.number;
    const headSha = ctx.payload.pull_request.head.sha as string;

    // ------------------------------------------------------------------
    // 1. Collect changed files
    // ------------------------------------------------------------------
    const { data: prFiles } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    });

    const violations: RouteViolation[] = [];

    for (const file of prFiles) {
      if (file.status === 'removed') continue;
      if (!isAnalyzableFile(file.filename)) continue;
      if (!file.patch) continue;

      // Added line numbers for this file
      const addedLines = parseAddedLines(file.patch);
      if (addedLines.size === 0) continue;

      // ----------------------------------------------------------------
      // 2. Fetch the full file content at the PR head commit
      // ----------------------------------------------------------------
      let content: string;
      try {
        const { data } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: file.filename,
          ref: headSha,
        });
        if (Array.isArray(data) || data.type !== 'file') continue;
        content = Buffer.from(data.content, 'base64').toString('utf-8');
      } catch (err) {
        core.warning(`Could not fetch content for ${file.filename}: ${err}`);
        continue;
      }

      // ----------------------------------------------------------------
      // 3. Analyse with AST
      // ----------------------------------------------------------------
      violations.push(
        ...analyzeExpressRoutes(content, file.filename, addedLines),
        ...analyzeNestJSRoutes(content, file.filename, addedLines),
      );
    }

    // ------------------------------------------------------------------
    // 4. Find an existing auth-guard comment (to update or delete)
    // ------------------------------------------------------------------
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: pullNumber,
    });

    const existing = comments.find(
      (c: { body?: string | null | undefined; id: number }) =>
        c.body?.includes(COMMENT_MARKER),
    );

    if (violations.length === 0) {
      core.info('✅ No authentication violations found.');
      if (existing) {
        await octokit.rest.issues.deleteComment({
          owner,
          repo,
          comment_id: existing.id,
        });
        core.info('Removed previous auth-guard comment (violations resolved).');
      }
      return;
    }

    // ------------------------------------------------------------------
    // 5. Post or update the PR comment
    // ------------------------------------------------------------------
    const body = formatComment(violations);

    if (existing) {
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existing.id,
        body,
      });
      core.info(`Updated auth-guard comment (${violations.length} violation(s)).`);
    } else {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: pullNumber,
        body,
      });
      core.info(`Posted auth-guard comment (${violations.length} violation(s)).`);
    }

    core.setOutput('violations', JSON.stringify(violations));
    core.warning(
      `AuthGuard: found ${violations.length} endpoint(s) without authentication middleware.`,
    );

    if (failOnViolation) {
      core.setFailed(
        `AuthGuard: ${violations.length} endpoint(s) without authentication middleware detected.`,
      );
    }
  } catch (error) {
    core.setFailed(
      error instanceof Error ? error.message : 'An unexpected error occurred',
    );
  }
}

run();

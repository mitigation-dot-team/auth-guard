/** Supported web framework identifiers */
export type Framework = 'express' | 'fastify' | 'nestjs';

/** A route endpoint that lacks authentication middleware */
export interface RouteViolation {
  /** Relative file path inside the repository */
  file: string;
  /** HTTP method in uppercase (GET, POST, …) */
  method: string;
  /** Route path string (e.g. "/users") */
  path: string;
  /** Source line number in the new file version */
  line: number;
  /** Detected framework */
  framework: Framework;
  /** Whether the path matches a known sensitive-path pattern */
  isSensitive: boolean;
}

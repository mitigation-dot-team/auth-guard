/**
 * Parse a unified-diff patch string and return the set of line numbers
 * (in the *new* file) that were added (lines beginning with '+').
 */
export function parseAddedLines(patch: string): Set<number> {
  const addedLines = new Set<number>();
  let currentLine = 0;

  for (const line of patch.split('\n')) {
    if (line.startsWith('@@')) {
      // Hunk header: @@ -old_start[,old_count] +new_start[,new_count] @@
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        currentLine = parseInt(match[1], 10) - 1;
      }
    } else if (line.startsWith('+++') || line.startsWith('---')) {
      // File header lines – ignore
    } else if (line.startsWith('+')) {
      currentLine++;
      addedLines.add(currentLine);
    } else if (line.startsWith('-')) {
      // Removed line – does not advance the new-file line counter
    } else {
      // Context line
      currentLine++;
    }
  }

  return addedLines;
}

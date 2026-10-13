/**
 * Splits a .sql file into statements for the dependency-free migration runner.
 *
 * Splitting on every `;` is wrong: the schema has COMMENT strings that contain one
 * ("1 = far below. Drives drift…" was the first casualty), and MySQL would receive half a
 * statement. So a terminator only counts when it ends a line.
 *
 * This is deliberately not a full SQL parser — it is enough for the schema in this repo, and it is
 * tested against the case that broke it.
 */

/** Strip `--` line comments. */
export function stripComments(sql) {
  return String(sql ?? '')
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');
}

export function statements(sql) {
  return stripComments(sql)
    .split(/;[ \t]*(?:\n|$)/)
    .map(statement => statement.trim())
    .filter(Boolean);
}

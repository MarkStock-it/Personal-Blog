#!/usr/bin/env node
/**
 * Hash an admin password for .env:
 *   npm run hash -- "the password"
 * Prints the value to paste into ADMIN_PASSWORD_HASH. Nothing is written to disk.
 */
import { hashPassword, newSecret } from './auth.js';

const password = process.argv.slice(2).join(' ').trim();

if (!password) {
  console.error('usage: npm run hash -- "your admin password"');
  console.error('\nIt also prints a fresh SESSION_SECRET you can use, and never stores anything.');
  process.exit(1);
}

console.log(`ADMIN_PASSWORD_HASH=${hashPassword(password)}`);
console.log(`SESSION_SECRET=${newSecret()}`);

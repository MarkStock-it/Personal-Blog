/**
 * Unsubscribe links.
 *
 * A link is `/unsubscribe?e=<address>&t=<token>`. The token comes from links.js, which signs the
 * address together with the purpose, so an unsubscribe token cannot be turned into a confirmation
 * token or vice versa. This module only names the purpose and the path.
 */
import { linkToken, verifyLink, linkUrl } from './links.js';

export const UNSUBSCRIBE_PATH = '/unsubscribe';

/** The token for one address, or '' when there is nothing to sign yet. */
export function unsubscribeToken(email, secret) {
  return linkToken('unsubscribe', email, secret);
}

/** True only for a token this server issued for this address. Never throws. */
export function verifyUnsubscribeToken(email, token, secret) {
  return verifyLink('unsubscribe', email, token, secret);
}

/** The whole link, ready to put in an email. '' when any part of it is missing. */
export function unsubscribeUrl(email, { siteUrl = '', secret = '' } = {}) {
  return linkUrl('unsubscribe', UNSUBSCRIBE_PATH, email, { siteUrl, secret });
}

/**
 * Add or remove one newsletter address on a Mailjet contact list (free plan, REST API v3).
 *
 * Off unless the API key, the secret key and a positive list id are all given. Neither function
 * throws:
 * MariaDB is the source of truth, so a Mailjet outage or bad credentials are logged and the visitor
 * still gets the normal signup reply. `addnoforce` adds the address without re-subscribing someone
 * who has already unsubscribed; `unsub` ends a subscription without deleting the contact, so the
 * removal is remembered and a later signup has to be deliberate. `fetchImpl` and `log` are
 * injectable so the tests run offline.
 */
export const MAILJET_API_BASE = 'https://api.mailjet.com/v3/REST';

/** The API base, overridable with MAILJET_API_BASE so a local stub can stand in for the live account.
 *  Server-controlled configuration, never request input. */
export const mailjetBase = () =>
  String(process.env.MAILJET_API_BASE || 'https://api.mailjet.com').replace(/\/+$/, '');

export function mailjetManageContactUrl(listId) {
  return `${mailjetBase()}/v3/REST/contactslist/${encodeURIComponent(listId)}/managecontact`;
}

async function manageContact(action, email, label, {
  apiKey = '',
  secretKey = '',
  listId = '',
  fetchImpl = fetch,
  log = console,
  timeoutMs = 8000,
} = {}) {
  const id = Number(listId);
  if (!apiKey || !secretKey || !(id > 0)) return false;
  const auth = Buffer.from(`${apiKey}:${secretKey}`).toString('base64');
  try {
    const r = await fetchImpl(mailjetManageContactUrl(id), {
      method: 'POST',
      headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ Action: action, Email: email }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (r.ok) return true;
    log.error(`[mailjet] ${label} failed`, r.status);
    return false;
  } catch (err) {
    log.error(`[mailjet] ${label} error`, err.name || err.message);
    return false;
  }
}

/** Add the address to the list without disturbing an existing subscription. */
export function syncMailjetContact(email, options = {}) {
  return manageContact('addnoforce', email, 'contact sync', options);
}

/** Take the address off the list. Keeps the contact in Mailjet, ends the subscription to it. */
export function removeMailjetContact(email, options = {}) {
  return manageContact('unsub', email, 'contact removal', options);
}

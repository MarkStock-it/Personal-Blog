/**
 * Sending one transactional message through Mailjet (Send API v3.1, free plan).
 *
 * Off unless a key pair and a sender address are all given. It never throws: the signup reply must
 * not depend on whether Mailjet is reachable, so a failure is logged and reported as false.
 * `fetchImpl` and `log` are injectable so the tests can run without the network.
 */
export const MAILJET_SEND_URL = 'https://api.mailjet.com/v3.1/send';

/** The API base, overridable with MAILJET_API_BASE so the whole send path can be exercised against
 *  a local stub instead of a live account. Server-controlled configuration, never request input. */
export const mailjetBase = () =>
  String(process.env.MAILJET_API_BASE || 'https://api.mailjet.com').replace(/\/+$/, '');

export const mailjetSendUrl = () => `${mailjetBase()}/v3.1/send`;

export async function sendMail({ from = '', fromName = '', to = '', subject = '', text = '', html = '' }, {
  apiKey = '',
  secretKey = '',
  fetchImpl = fetch,
  log = console,
  timeoutMs = 10000,
} = {}) {
  if (!apiKey || !secretKey || !from || !to) return false;
  const auth = Buffer.from(`${apiKey}:${secretKey}`).toString('base64');
  const message = {
    From: { Email: from, ...(fromName ? { Name: fromName } : {}) },
    To: [{ Email: to }],
    Subject: subject,
    ...(text ? { TextPart: text } : {}),
    ...(html ? { HTMLPart: html } : {}),
  };
  try {
    const r = await fetchImpl(mailjetSendUrl(), {
      method: 'POST',
      headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ Messages: [message] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) {
      log.error('[mail] send failed', r.status);
      return false;
    }
    /* Mailjet answers 200 with a per-message status, so a rejected send is not an HTTP error. */
    const data = await r.json().catch(() => null);
    const status = data?.Messages?.[0]?.Status;
    if (status && status !== 'success') {
      log.error('[mail] send rejected', status, JSON.stringify(data?.Messages?.[0]?.Errors ?? []));
      return false;
    }
    return true;
  } catch (err) {
    log.error('[mail] send error', err.name || err.message);
    return false;
  }
}

/**
 * Markdown-ish body parser for the blog.
 *
 * A post body is stored as Markdown in MariaDB and must become the block list the
 * front-end already renders:
 *   { p }             -> <div class="blk"><p>p</p><span></span></div>
 *   { p, note }       -> the same, plus <aside><span class="label">Note</span>note</aside>
 *   { quote }         -> <blockquote>quote</blockquote>
 *
 * The front-end injects these strings as HTML, so every string this module returns is
 * HTML-escaped FIRST and only then has inline formatting applied. Anything a writer types
 * is therefore text, never markup.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const UNESCAPES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);

/* Only these schemes may become a link; anything else (javascript:, data:) stays plain text. */
const SAFE_URL = /^(?:https?:\/\/|mailto:|\/)/i;

/** Escape, then apply inline formatting to already-escaped text. */
export function inline(text) {
  let out = escapeHtml(text);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label, url) =>
    SAFE_URL.test(url) ? `<a href="${url}" rel="noopener noreferrer">${label}</a>` : whole);
  return out;
}

const blockLines = chunk =>
  chunk.split('\n').map(line => line.trim()).filter(line => line !== '');

const joinLines = lines => lines.join(' ');

/**
 * Split a body into blocks: blank lines separate blocks, a single newline is just a space.
 * Leading `> ` makes a pull quote, `NOTE: ` attaches a margin note to the paragraph above it,
 * and `## ` makes a bold heading paragraph.
 */
export function parseBody(markdown) {
  const blocks = [];
  const chunks = String(markdown ?? '').replace(/\r\n?/g, '\n').split(/\n\s*\n+/);

  for (const chunk of chunks) {
    const lines = blockLines(chunk);
    if (!lines.length) continue;

    const first = lines[0];
    const rest = lines.slice(1);

    if (first === '>' || first.startsWith('> ')) {
      const text = lines
        .map(line => (line === '>' ? '' : line.startsWith('> ') ? line.slice(2) : line))
        .join(' ');
      blocks.push({ quote: inline(text) });
      continue;
    }

    if (first.startsWith('NOTE: ')) {
      const note = inline(joinLines([first.slice(6), ...rest]));
      const previous = blocks[blocks.length - 1];
      if (previous && previous.p !== undefined && previous.note === undefined) previous.note = note;
      else blocks.push({ p: note }); // a note with no paragraph above it is just a paragraph
      continue;
    }

    if (first.startsWith('## ')) {
      blocks.push({ p: `<strong>${inline(joinLines([first.slice(3), ...rest]))}</strong>` });
      continue;
    }

    blocks.push({ p: inline(joinLines(lines)) });
  }

  return blocks;
}

/** Plain text of every block, for word counts and meta descriptions. */
export function plainText(blocks) {
  return blocks
    .map(block => [block.p, block.note, block.quote].filter(Boolean).join(' '))
    .join(' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39);/g, (_, name) => UNESCAPES[name])
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * General utility functions.
 * @module utils
 */

/**
 * Clamp a value to a range.
 * @param {number} value - Value to clamp.
 * @param {number} min - Minimum value.
 * @param {number} max - Maximum value.
 * @returns {number} Clamped value.
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function formatTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp * 1000);
  return date.toLocaleString();
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function stripHtml(html) {
  if (!html) return "";
  const template = document.createElement("template");
  template.innerHTML = html;
  return (template.content.textContent || "").trim();
}

export function sanitizeHtml(html) {
  if (!html) return "";
  const template = document.createElement("template");
  template.innerHTML = html;

  const allowedTags = new Set([
    "A",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "P",
    "PRE",
    "CODE",
    "EM",
    "STRONG",
    "I",
    "B",
    "BR",
    "UL",
    "OL",
    "LI",
    "SPAN",
    "BLOCKQUOTE",
  ]);

  const walk = (node) => {
    for (const child of Array.from(node.children)) {
      if (!allowedTags.has(child.tagName)) {
        child.replaceWith(...Array.from(child.childNodes));
      } else {
        for (const attr of Array.from(child.attributes)) {
          const name = attr.name.toLowerCase();
          if (name.startsWith("on") || name === "style" || name === "class") {
            child.removeAttribute(attr.name);
          }
          if (child.tagName === "A" && name === "href") {
            const href = child.getAttribute("href") || "";
            if (!href.startsWith("http")) child.removeAttribute("href");
          }
        }
        if (child.tagName === "A") {
          child.setAttribute("target", "_blank");
          child.setAttribute("rel", "noopener noreferrer");
        }
      }
      walk(child);
    }
  };

  walk(template.content);
  return template.innerHTML;
}

export function renderMarkdown(input) {
  if (!input) return "";
  const raw = String(input).replace(/\r\n/g, "\n");
  const codeBlocks = [];

  const withPlaceholders = raw.replace(
    /```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g,
    (_, lang, code) => {
      const index = codeBlocks.length;
      const escaped = escapeHtml(code.trim());
      const language = lang ? ` class=\"language-${lang}\"` : "";
      codeBlocks.push(`<pre><code${language}>${escaped}</code></pre>`);
      return `@@CODEBLOCK_${index}@@`;
    },
  );

  const escaped = escapeHtml(withPlaceholders);
  const lines = escaped.split("\n");
  const html = [];
  let listType = null;
  let inQuote = false;

  const closeList = () => {
    if (listType) {
      html.push(listType === "ol" ? "</ol>" : "</ul>");
      listType = null;
    }
  };

  const closeQuote = () => {
    if (inQuote) {
      html.push("</blockquote>");
      inQuote = false;
    }
  };

  const formatInline = (text) => {
    if (text.includes("@@CODEBLOCK_")) return text;
    let out = text;
    out = out.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    );
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
    return out;
  };

  for (const line of lines) {
    if (!line.trim()) {
      closeList();
      closeQuote();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      closeQuote();
      const level = heading[1].length;
      html.push(`<h${level}>${formatInline(heading[2])}</h${level}>`);
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      closeList();
      if (!inQuote) {
        html.push("<blockquote>");
        inQuote = true;
      }
      html.push(`<p>${formatInline(quote[1])}</p>`);
      continue;
    } else {
      closeQuote();
    }

    const unordered = line.match(/^\s*[-*+]\s+(.*)$/);
    if (unordered) {
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${formatInline(unordered[1])}</li>`);
      continue;
    }

    const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ordered) {
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${formatInline(ordered[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${formatInline(line)}</p>`);
  }

  closeList();
  closeQuote();

  let output = html.join("\n");
  output = output.replace(/@@CODEBLOCK_(\d+)@@/g, (_, index) => {
    const block = codeBlocks[Number(index)];
    return block || "";
  });

  return sanitizeHtml(output);
}

export function extractJson(text) {
  if (!text) return null;
  const raw = String(text);
  const fenced =
    raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```([\s\S]*?)```/);
  const candidates = fenced ? [fenced[1]] : [raw];

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    const first = trimmed.search(/[\[{]/);
    if (first === -1) continue;
    const chunk = trimmed.slice(first);
    const last = Math.max(chunk.lastIndexOf("}"), chunk.lastIndexOf("]"));
    if (last === -1) continue;
    const jsonSlice = chunk.slice(0, last + 1);
    try {
      return JSON.parse(jsonSlice);
    } catch {
      continue;
    }
  }
  return null;
}

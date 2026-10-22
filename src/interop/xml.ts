/**
 * A small XML reader for the screenplay formats: elements, attributes and text only. It knows no DTD and no external
 * entity, so a crafted file cannot make it read anything else (architecture, 9.1 and 11) [SEC-05].
 */

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

export type XmlNode = XmlElement | string;

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function parseXml(source: string): XmlElement {
  const root: XmlElement = { name: "#root", attrs: {}, children: [] };
  const stack: XmlElement[] = [root];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>|<\/\s*([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.children.push(m[1]);
    else if (m[2]) {
      const i = stack.map((e) => e.name).lastIndexOf(m[2]);
      if (i > 0) stack.length = i;
    } else if (m[3]) {
      const attrs: Record<string, string> = {};
      for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decodeEntities(a[2] ?? a[3] ?? "");
      const el: XmlElement = { name: m[3], attrs, children: [] };
      top.children.push(el);
      if (!m[5]) stack.push(el);
    } else if (m[6] !== undefined) top.children.push(decodeEntities(m[6]));
  }
  return root;
}

export function elements(e: XmlElement, name?: string): XmlElement[] {
  return e.children.filter((c): c is XmlElement => typeof c !== "string" && (!name || c.name === name));
}

export function find(e: XmlElement, name: string): XmlElement | undefined {
  for (const c of elements(e)) {
    if (c.name === name) return c;
    const deep = find(c, name);
    if (deep) return deep;
  }
  return undefined;
}

export function textOf(e: XmlElement): string {
  return e.children.map((c) => (typeof c === "string" ? c : textOf(c))).join("");
}

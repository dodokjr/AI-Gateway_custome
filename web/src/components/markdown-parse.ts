// Pemecah Markdown menjadi blok. Murni (tanpa React) agar mudah diuji.

export type Block =
  | { t: "code"; lang: string; code: string }
  | { t: "h"; level: number; text: string }
  | { t: "ul" | "ol"; items: string[] }
  | { t: "table"; head: string[]; rows: string[][] }
  | { t: "p"; text: string };

const splitRow = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
const isSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const fence = /^```(\S*)\s*$/.exec(line);
    if (fence) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i] ?? "")) buf.push(lines[i++] ?? "");
      i++;
      blocks.push({ t: "code", lang: fence[1] ?? "", code: buf.join("\n") });
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ t: "h", level: (h[1] ?? "#").length, text: h[2] ?? "" });
      i++;
      continue;
    }
    if (line.includes("|") && isSep(lines[i + 1] ?? "")) {
      const head = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && (lines[i] ?? "").includes("|") && (lines[i] ?? "").trim()) rows.push(splitRow(lines[i++] ?? ""));
      blocks.push({ t: "table", head, rows });
      continue;
    }
    const ul = /^\s*[-*]\s+/;
    const ol = /^\s*\d+[.)]\s+/;
    if (ul.test(line) || ol.test(line)) {
      const kind = ul.test(line) ? "ul" : "ol";
      const re = kind === "ul" ? ul : ol;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i] ?? "")) items.push((lines[i++] ?? "").replace(re, ""));
      blocks.push({ t: kind, items });
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() &&
      !/^```/.test(lines[i] ?? "") &&
      !/^#{1,4}\s/.test(lines[i] ?? "") &&
      !ul.test(lines[i] ?? "") &&
      !ol.test(lines[i] ?? "")
    ) {
      para.push(lines[i++] ?? "");
    }
    blocks.push({ t: "p", text: para.join("\n") });
  }
  return blocks;
}

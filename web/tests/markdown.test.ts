import { expect, test } from "bun:test";
import { parseBlocks } from "@/components/markdown-parse";

test("blok kode, judul, daftar, tabel, paragraf", () => {
  const src = "# Judul\n\nIsi **tebal** `kode`.\n\n- a\n- b\n\n1. satu\n2. dua\n\n| Bahasa | Guna |\n|---|---|\n| Go | server |\n| JS | web |\n\n```python\nprint('x')\n```\nakhir";
  const b = parseBlocks(src);
  expect(b.map((x) => x.t)).toEqual(["h", "p", "ul", "ol", "table", "code", "p"]);
  const t = b[4];
  expect(t && t.t === "table" && t.rows.length).toBe(2);
  const c = b[5];
  expect(c && c.t === "code" && c.lang).toBe("python");
  expect(c && c.t === "code" && c.code).toBe("print('x')");
});

test("blok kode tanpa penutup tidak membuat loop tak hingga", () => {
  const b = parseBlocks("```js\nconsole.log(1)\nbaris lagi");
  expect(b).toHaveLength(1);
  expect(b[0]?.t).toBe("code");
});

test("teks kosong dan karakter aneh aman", () => {
  expect(parseBlocks("")).toEqual([]);
  expect(parseBlocks("\n\n   \n")).toEqual([]);
  expect(parseBlocks("<script>alert(1)</script>")[0]).toEqual({ t: "p", text: "<script>alert(1)</script>" });
});

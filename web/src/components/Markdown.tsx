"use client";

import { Fragment, useState, type ReactNode } from "react";
import { parseBlocks } from "./markdown-parse";

// Penampil Markdown kecil dan aman: seluruh keluaran berupa elemen React (tanpa innerHTML),
// tautan hanya http/https.

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\[[^\]\n]+\]\((https?:\/\/[^\s)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}-${i++}`;
    if (m[1]) out.push(<code key={k}>{m[1].slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{m[2].slice(2, -2)}</strong>);
    else if (m[3]) {
      const label = m[3].slice(1, m[3].indexOf("]"));
      out.push(
        <a key={k} href={m[4]} target="_blank" rel="noopener noreferrer nofollow">
          {label}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [done, setDone] = useState(false);
  return (
    <pre>
      <button
        type="button"
        className="btn sm copy"
        onClick={() => {
          navigator.clipboard?.writeText(code).then(
            () => {
              setDone(true);
              setTimeout(() => setDone(false), 1500);
            },
            () => undefined,
          );
        }}
        aria-label="Salin kode"
      >
        {done ? "Tersalin" : lang ? `Salin ${lang}` : "Salin"}
      </button>
      <code>{code}</code>
    </pre>
  );
}

export default function Markdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className="md">
      {blocks.map((b, bi) => {
        const k = `b${bi}`;
        switch (b.t) {
          case "code":
            return <CodeBlock key={k} code={b.code} lang={b.lang} />;
          case "h":
            return <h3 key={k}>{inline(b.text, k)}</h3>;
          case "ul":
            return (
              <ul key={k}>
                {b.items.map((it, ii) => (
                  <li key={ii}>{inline(it, `${k}-${ii}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={k}>
                {b.items.map((it, ii) => (
                  <li key={ii}>{inline(it, `${k}-${ii}`)}</li>
                ))}
              </ol>
            );
          case "table":
            return (
              <div className="table-wrap" key={k}>
                <table>
                  <thead>
                    <tr>
                      {b.head.map((c, ci) => (
                        <th key={ci}>{inline(c, `${k}h${ci}`)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, ri) => (
                      <tr key={ri}>
                        {r.map((c, ci) => (
                          <td key={ci}>{inline(c, `${k}r${ri}c${ci}`)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return (
              <p key={k}>
                {b.text.split("\n").map((ln, li, arr) => (
                  <Fragment key={li}>
                    {inline(ln, `${k}-${li}`)}
                    {li < arr.length - 1 ? <br /> : null}
                  </Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}

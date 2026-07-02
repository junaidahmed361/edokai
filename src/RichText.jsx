import React from "react";

/* ============================================================
   RichText — renders lore/questions written for humans:
   blank-line paragraphs, "- " bullet lists, "1." ordered lists,
   **bold**, and `inline code`. Plain strings pass through as a
   single paragraph, so it is safe on all existing content.
   ============================================================ */

const CODE_STYLE = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: "0.9em",
  background: "rgba(141,155,255,0.14)",
  border: "1px solid rgba(141,155,255,0.22)",
  padding: "1px 5px",
  borderRadius: 6,
  whiteSpace: "nowrap",
};

function inline(text, keyBase) {
  const parts = String(text).split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).filter((p) => p !== "");
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <b key={`${keyBase}-${i}`}>{p.slice(2, -2)}</b>;
    if (p.startsWith("`") && p.endsWith("`")) return <code key={`${keyBase}-${i}`} style={CODE_STYLE}>{p.slice(1, -1)}</code>;
    return p;
  });
}

const BULLET = /^\s*[-•*]\s+/;
const ORDERED = /^\s*\d+[.)]\s+/;

export default function RichText({ text, style = {}, pStyle = {} }) {
  const src = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!src) return null;
  const blocks = src.split(/\n{2,}/);
  const out = [];
  blocks.forEach((block, bi) => {
    const lines = block.split("\n");
    let buf = [];
    let list = null; // { ordered, items }
    const flushPara = () => {
      if (!buf.length) return;
      out.push(
        <p key={`p${bi}-${out.length}`} style={{ margin: out.length ? "0.6em 0 0" : 0, ...pStyle }}>
          {buf.map((ln, li) => (
            <React.Fragment key={li}>{li > 0 && <br />}{inline(ln, `${bi}-${li}`)}</React.Fragment>
          ))}
        </p>
      );
      buf = [];
    };
    const flushList = () => {
      if (!list || !list.items.length) { list = null; return; }
      const Tag = list.ordered ? "ol" : "ul";
      out.push(
        <Tag key={`l${bi}-${out.length}`} style={{ margin: out.length ? "0.55em 0 0" : 0, paddingLeft: "1.35em", display: "grid", gap: "0.3em" }}>
          {list.items.map((item, ii) => <li key={ii}>{inline(item, `${bi}-li${ii}`)}</li>)}
        </Tag>
      );
      list = null;
    };
    lines.forEach((line) => {
      if (BULLET.test(line)) {
        flushPara();
        if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] }; }
        list.items.push(line.replace(BULLET, ""));
      } else if (ORDERED.test(line)) {
        flushPara();
        if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] }; }
        list.items.push(line.replace(ORDERED, ""));
      } else if (line.trim() === "") {
        flushPara(); flushList();
      } else {
        flushList();
        buf.push(line);
      }
    });
    flushPara(); flushList();
  });
  return <div style={style}>{out}</div>;
}

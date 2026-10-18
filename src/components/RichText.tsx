import { Fragment, type ReactNode } from 'react';

/** Renders **bold** inline without using innerHTML. */
function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') && p.length > 4 ? <strong key={i} className="font-semibold text-ink">{p.slice(2, -2)}</strong> : <Fragment key={i}>{p.replace(/^#{1,6}\s+/, '')}</Fragment>));
}

/** Minimal, safe markdown: paragraphs, bullet and numbered lists, bold. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r/g, '').split('\n');
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push(<p key={`p${blocks.length}`}>{inline(para.join(' '))}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}>{inline(it)}</li>);
    blocks.push(
      list.ordered ? (
        <ol key={`l${blocks.length}`} className="list-decimal space-y-1 pl-5 marker:text-ink-3">
          {items}
        </ol>
      ) : (
        <ul key={`l${blocks.length}`} className="list-disc space-y-1 pl-5 marker:text-ink-3">
          {items}
        </ul>
      ),
    );
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const num = line.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || num) {
      flushPara();
      const ordered = Boolean(num);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? num)![1]);
    } else if (line === '') {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return <div className={className ?? 'space-y-2.5 text-[15px] leading-relaxed text-ink-2'}>{blocks}</div>;
}

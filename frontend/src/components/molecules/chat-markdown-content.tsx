import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FilterableMarkdownTable } from '@/components/molecules/filterable-markdown-table';
import { sanitizeUserFacingText } from '@/lib/safe-display';

interface ChatMarkdownContentProps {
  readonly content: string;
}

export function ChatMarkdownContent({ content }: ChatMarkdownContentProps) {
  const safeContent = sanitizeUserFacingText(content);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        table({ children, node }) {
          const headers: string[] = [];
          const rows: string[][] = [];

          function processNode(n: typeof node) {
            if (!n) return;
            if (n.type === 'element' && n.tagName === 'th') {
              const text = n.children
                .map((c) => ('value' in c ? c.value : ''))
                .join('')
                .trim();
              headers.push(text);
            }
            if (n.type === 'element' && n.tagName === 'td') {
              const text = n.children
                .map((c) => ('value' in c ? c.value : ''))
                .join('')
                .trim();
              if (!rows.length || rows[rows.length - 1].length >= headers.length) {
                rows.push([]);
              }
              rows[rows.length - 1].push(text);
            }
            if ('children' in n && Array.isArray(n.children)) {
              for (const child of n.children) {
                processNode(child as typeof node);
              }
            }
          }

          processNode(node);

          if (headers.length > 0) {
            return <FilterableMarkdownTable headers={headers} rows={rows} />;
          }

          return <table>{children}</table>;
        },
        h3({ children }) {
          return (
            <h3 className="mt-2 mb-1 text-base font-semibold first:mt-0">{children}</h3>
          );
        },
        h4({ children }) {
          return (
            <h4 className="mt-2 mb-1 text-sm font-semibold first:mt-0">{children}</h4>
          );
        },
        p({ children }) {
          return <p className="mb-2 last:mb-0">{children}</p>;
        },
        strong({ children }) {
          return <strong className="font-semibold">{children}</strong>;
        },
        ul({ children }) {
          return <ul className="mb-2 list-disc pl-4">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="mb-2 list-decimal pl-4">{children}</ol>;
        },
        li({ children }) {
          return <li className="mb-0.5">{children}</li>;
        },
        code({ children }) {
          return (
            <code className="rounded bg-black/10 px-1 py-0.5 text-xs font-mono">
              {children}
            </code>
          );
        },
      }}
    >
      {safeContent}
    </ReactMarkdown>
  );
}

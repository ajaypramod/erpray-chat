import React, { memo, useMemo } from 'react';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import supersub from 'remark-supersub';
import rehypeKatex from 'rehype-katex';
import { useRecoilValue } from 'recoil';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkDirective from 'remark-directive';
import type { Pluggable } from 'unified';
import { Citation, CompositeCitation, HighlightedText } from '~/components/Web/Citation';
import {
  mcpUIResourcePlugin,
  MCPUIResource,
  MCPUIResourceCarousel,
} from '~/components/MCPUIResource';
import { Artifact, artifactPlugin } from '~/components/Artifacts/Artifact';
import { ArtifactProvider, CodeBlockProvider } from '~/Providers';
import MarkdownErrorBoundary from './MarkdownErrorBoundary';
import { langSubset, preprocessLaTeX } from '~/utils';
import { unicodeCitation } from '~/components/Web';
import { code, a, p, img } from './MarkdownComponents';
// ERPRAY-PATCH
import { parseChips, FollowupChips } from '~/erpray/FollowupChips';
import store from '~/store';

type TContentProps = {
  content: string;
  isLatestMessage: boolean;
};

const Markdown = memo(function Markdown({ content = '', isLatestMessage }: TContentProps) {
  const LaTeXParsing = useRecoilValue<boolean>(store.LaTeXParsing);
  const isInitializing = content === '';

  const currentContent = useMemo(() => {
    if (isInitializing) {
      return '';
    }
    return LaTeXParsing ? preprocessLaTeX(content) : content;
  }, [content, LaTeXParsing, isInitializing]);

  // ERPRAY-PATCH: strip the connector's trailing "**Next:** `chip` · `chip`"
  // line out of the markdown BEFORE it reaches ReactMarkdown — otherwise it
  // renders as literal bold text and un-clickable inline code spans. The chips
  // render as real buttons via <FollowupChips> below instead.
  const { content: contentSansChips, chips } = useMemo(
    () => parseChips(currentContent),
    [currentContent],
  );

  const rehypePlugins = useMemo(
    () => [
      [rehypeKatex],
      [
        rehypeHighlight,
        {
          detect: true,
          ignoreMissing: true,
          subset: langSubset,
        },
      ],
    ],
    [],
  );

  const remarkPlugins: Pluggable[] = [
    supersub,
    remarkGfm,
    remarkDirective,
    artifactPlugin,
    [remarkMath, { singleDollarTextMath: false }],
    unicodeCitation,
    mcpUIResourcePlugin,
  ];

  if (isInitializing) {
    return (
      <div className="absolute">
        <p className="relative">
          <span className={isLatestMessage ? 'result-thinking' : ''} />
        </p>
      </div>
    );
  }

  return (
    <MarkdownErrorBoundary content={content} codeExecution={true}>
      <ArtifactProvider>
        <CodeBlockProvider>
          <ReactMarkdown
            /** @ts-ignore */
            remarkPlugins={remarkPlugins}
            /* @ts-ignore */
            rehypePlugins={rehypePlugins}
            components={
              {
                code,
                a,
                p,
                img,
                artifact: Artifact,
                citation: Citation,
                'highlighted-text': HighlightedText,
                'composite-citation': CompositeCitation,
                'mcp-ui-resource': MCPUIResource,
                'mcp-ui-carousel': MCPUIResourceCarousel,
              } as {
                [nodeType: string]: React.ElementType;
              }
            }
          >
            {contentSansChips}
          </ReactMarkdown>
          {/* ERPRAY-PATCH: real, clickable buttons — never raw "**Next:** `x`" text. */}
          <FollowupChips chips={chips} />
        </CodeBlockProvider>
      </ArtifactProvider>
    </MarkdownErrorBoundary>
  );
});
Markdown.displayName = 'Markdown';

export default Markdown;

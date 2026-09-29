import { useRef } from "react";
import ReactMarkdown from "react-markdown";
import "katex/dist/katex.min.css";
import type { Idea, IdeaSelector, IdeaTarget, PageSummary } from "../api";
import { rewriteWikilinks } from "../lib/wikilinks";
import { createMarkdownComponents, rehypePlugins, remarkPlugins } from "../lib/markdown/renderMarkdown";
import { IdeaOverlay } from "./IdeaOverlay";

type MarkdownPreviewProps = {
  markdown: string;
  pages: PageSummary[];
  onOpen: (id: string) => void;
  assetRoot?: string;
  basePath?: string;
  ideaTarget?: IdeaTarget;
  ideas?: Idea[];
  ideasVisible?: boolean;
  onIdeasVisible?: (visible: boolean) => void;
  onCreateIdea?: (selector: IdeaSelector, content: string) => Promise<boolean>;
  onUpdateIdea?: (id: string, patch: Partial<Pick<Idea, "content" | "status">>) => Promise<void>;
  onAddToChat?: (text: string) => void;
};

export function MarkdownPreview({
  markdown,
  pages,
  onOpen,
  assetRoot,
  basePath,
  ideaTarget,
  ideas = [],
  ideasVisible = true,
  onIdeasVisible,
  onCreateIdea,
  onUpdateIdea,
  onAddToChat,
}: MarkdownPreviewProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const source = rewriteWikilinks(markdown);
  const components = createMarkdownComponents({ pages, onOpen, assetRoot, basePath });

  return (
    <IdeaOverlay
      surfaceRef={surfaceRef}
      anchorRootRef={rootRef}
      ideaTarget={ideaTarget}
      ideas={ideas}
      ideasVisible={ideasVisible}
      onIdeasVisible={onIdeasVisible}
      onCreateIdea={onCreateIdea}
      onUpdateIdea={onUpdateIdea}
      onAddToChat={onAddToChat}
      contentKey={source}
    >
      <div ref={rootRef} className="md-body">
        <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
          {source}
        </ReactMarkdown>
      </div>
    </IdeaOverlay>
  );
}

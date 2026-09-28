import { Check, ChevronLeft, ChevronRight, Eye, EyeOff, Minus, Plus, Scan, StickyNote } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { api, type Idea, type IdeaSelector, type PdfRegionIdeaSelector } from "../api";
import { detectPdfPageFromScroll, type PageViewMemory } from "../lib/pageViewMemory";
import "pdfjs-dist/web/pdf_viewer.css";

type DocumentPreviewProps = {
  pageId: string;
  type: string;
  title: string;
  onRename?: (name: string) => void;
  ideas: Idea[];
  ideasVisible: boolean;
  onIdeasVisible: (visible: boolean) => void;
  onCreateIdea: (selector: IdeaSelector, content: string) => Promise<boolean>;
  onUpdateIdea: (id: string, patch: Partial<Pick<Idea, "content" | "status">>) => Promise<void>;
  viewMemory?: PageViewMemory;
  onViewMemoryChange?: (patch: Partial<PageViewMemory>) => void;
};
type PdfDocument = import("pdfjs-dist").PDFDocumentProxy;
type PdfRenderTask = import("pdfjs-dist").RenderTask;
type PdfLoadingTask = import("pdfjs-dist").PDFDocumentLoadingTask;

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function PdfPageJump({
  pageNumber,
  totalPages,
  onJump,
}: {
  pageNumber: number;
  totalPages: number;
  onJump: (page: number) => void;
}) {
  const [draft, setDraft] = useState(String(pageNumber));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(String(pageNumber));
  }, [pageNumber, editing]);

  const commit = () => {
    const parsed = Number.parseInt(draft.trim(), 10);
    if (!Number.isFinite(parsed)) {
      setDraft(String(pageNumber));
      setEditing(false);
      return;
    }
    const target = Math.max(1, Math.min(totalPages, parsed));
    setDraft(String(target));
    setEditing(false);
    if (target !== pageNumber) onJump(target);
  };

  return (
    <label className="document-page-jump">
      <input
        type="text"
        inputMode="numeric"
        className="document-page-input"
        value={draft}
        aria-label="跳转到页码"
        onFocus={() => setEditing(true)}
        onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ""))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setDraft(String(pageNumber));
            setEditing(false);
            event.currentTarget.blur();
          }
        }}
      />
      <span>/ {totalPages}</span>
    </label>
  );
}

function EditableDocumentTitle({ title, onRename }: { title: string; onRename?: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  useEffect(() => {
    setDraft(title);
    setEditing(false);
  }, [title]);

  if (!onRename) {
    return (
      <div className="document-title-slot">
        <span className="document-name">{title}</span>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="document-title-slot">
        <input
          className="document-name-edit"
          value={draft}
          autoFocus
          spellCheck={false}
          aria-label="文献标题"
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            const next = draft.trim();
            setEditing(false);
            if (next && next !== title) onRename(next);
            else setDraft(title);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              event.preventDefault();
              setDraft(title);
              setEditing(false);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="document-title-slot">
      <button type="button" className="document-name" title={title} onClick={() => setEditing(true)}>
        {title}
      </button>
    </div>
  );
}

type PdfPageSurfaceProps = {
  pdf: PdfDocument;
  pageNumber: number;
  scale: number;
  ideas: Idea[];
  ideasVisible: boolean;
  annotationMode: boolean;
  scrollRoot: RefObject<HTMLDivElement | null>;
  estimatedHeight?: number;
  onRegister: (pageNumber: number, element: HTMLDivElement | null) => void;
  onCreateIdea: (selector: IdeaSelector, content: string) => Promise<boolean>;
  onUpdateIdea: (id: string, patch: Partial<Pick<Idea, "content" | "status">>) => Promise<void>;
};

function PdfPageSurface({
  pdf,
  pageNumber,
  scale,
  ideas,
  ideasVisible,
  annotationMode,
  scrollRoot,
  estimatedHeight,
  onRegister,
  onCreateIdea,
  onUpdateIdea,
}: PdfPageSurfaceProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [shouldRender, setShouldRender] = useState(false);
  const [drag, setDrag] = useState<{ startX: number; startY: number; x: number; y: number } | null>(null);
  const [composer, setComposer] = useState<{ selector: PdfRegionIdeaSelector; left: number; top: number } | null>(null);
  const [ideaText, setIdeaText] = useState("");

  useEffect(() => {
    onRegister(pageNumber, wrapRef.current);
    return () => onRegister(pageNumber, null);
  }, [onRegister, pageNumber]);

  useEffect(() => {
    const element = wrapRef.current;
    const root = scrollRoot.current;
    if (!element || !root) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setShouldRender(true);
      },
      { root, rootMargin: "640px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [scrollRoot]);

  useEffect(() => {
    if (!shouldRender) return;
    let cancelled = false;
    let renderTask: PdfRenderTask | undefined;
    let textLayer: import("pdfjs-dist").TextLayer | undefined;
    void pdf.getPage(pageNumber).then(async (page) => {
      if (cancelled || !canvasRef.current) return;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const outputScale = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.ceil(viewport.width * outputScale);
      canvas.height = Math.ceil(viewport.height * outputScale);
      canvas.style.width = `${Math.ceil(viewport.width)}px`;
      canvas.style.height = `${Math.ceil(viewport.height)}px`;
      if (surfaceRef.current) {
        surfaceRef.current.style.width = canvas.style.width;
        surfaceRef.current.style.height = canvas.style.height;
        surfaceRef.current.style.setProperty("--scale-factor", String(viewport.scale));
      }
      const context = canvas.getContext("2d");
      if (!context) throw new Error("当前环境不支持 Canvas");
      renderTask = page.render({
        canvasContext: context,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      });
      await renderTask.promise;
      if (cancelled || !textLayerRef.current) return;
      textLayerRef.current.replaceChildren();
      const pdfjs = await import("pdfjs-dist");
      textLayer = new pdfjs.TextLayer({
        textContentSource: await page.getTextContent(),
        container: textLayerRef.current,
        viewport,
      });
      await textLayer.render();
    }).catch((cause: unknown) => {
      if (!cancelled && !(cause instanceof Error && cause.name === "RenderingCancelledException")) {
        console.error("PDF 页面渲染失败", cause);
      }
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
      textLayerRef.current?.replaceChildren();
      if (canvasRef.current) {
        canvasRef.current.width = 0;
        canvasRef.current.height = 0;
      }
    };
  }, [pdf, pageNumber, scale, shouldRender]);

  const pageIdeas = ideas.filter(
    (idea) => idea.selector.kind === "pdf-region" && idea.selector.page === pageNumber && idea.status === "open",
  );

  const normalizedRegion = (left: number, top: number, width: number, height: number, exact?: string): PdfRegionIdeaSelector | null => {
    const page = surfaceRef.current;
    if (!page || width < 4 || height < 4) return null;
    return {
      kind: "pdf-region",
      page: pageNumber,
      x: Math.max(0, Math.min(1, left / page.clientWidth)),
      y: Math.max(0, Math.min(1, top / page.clientHeight)),
      width: Math.max(0.001, Math.min(1, width / page.clientWidth)),
      height: Math.max(0.001, Math.min(1, height / page.clientHeight)),
      exact: exact?.trim() || undefined,
    };
  };

  const openRegionComposer = (selector: PdfRegionIdeaSelector) => {
    const page = surfaceRef.current;
    if (!page) return;
    setIdeaText("");
    setComposer({
      selector,
      left: Math.max(8, Math.min(page.clientWidth - 240, (selector.x + selector.width) * page.clientWidth + 12)),
      top: Math.max(8, selector.y * page.clientHeight),
    });
  };

  const capturePdfText = () => {
    if (annotationMode) return;
    const selection = window.getSelection();
    const page = surfaceRef.current;
    const layer = textLayerRef.current;
    if (!selection || !page || !layer || selection.isCollapsed || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!layer.contains(range.startContainer) || !layer.contains(range.endContainer)) return;
    const pageRect = page.getBoundingClientRect();
    const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
    if (!rects.length) return;
    const left = Math.min(...rects.map((rect) => rect.left)) - pageRect.left;
    const top = Math.min(...rects.map((rect) => rect.top)) - pageRect.top;
    const right = Math.max(...rects.map((rect) => rect.right)) - pageRect.left;
    const bottom = Math.max(...rects.map((rect) => rect.bottom)) - pageRect.top;
    const selector = normalizedRegion(left, top, right - left, bottom - top, selection.toString());
    if (selector) openRegionComposer(selector);
  };

  const submitPdfIdea = async () => {
    if (!composer || !ideaText.trim()) return;
    if (await onCreateIdea(composer.selector, ideaText.trim())) {
      setComposer(null);
      setIdeaText("");
      setDrag(null);
      window.getSelection()?.removeAllRanges();
    }
  };

  return (
    <div ref={wrapRef} className="pdf-page-block" data-page={pageNumber}>
      <div className="pdf-page-label">第 {pageNumber} 页</div>
      <div
        ref={surfaceRef}
        className={`pdf-page-surface${annotationMode ? " annotating" : ""}${shouldRender ? "" : " pdf-page-surface-pending"}`}
        style={!shouldRender && estimatedHeight ? { minHeight: estimatedHeight } : undefined}
        onMouseUp={capturePdfText}
        onPointerDown={(event) => {
          if (!annotationMode) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top;
          event.currentTarget.setPointerCapture(event.pointerId);
          setDrag({ startX: x, startY: y, x, y });
        }}
        onPointerMove={(event) => {
          if (!annotationMode || !drag) return;
          const rect = event.currentTarget.getBoundingClientRect();
          setDrag({
            ...drag,
            x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
            y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
          });
        }}
        onPointerUp={() => {
          if (!annotationMode || !drag) return;
          const left = Math.min(drag.startX, drag.x);
          const top = Math.min(drag.startY, drag.y);
          const selector = normalizedRegion(left, top, Math.abs(drag.x - drag.startX), Math.abs(drag.y - drag.startY));
          setDrag(null);
          if (selector) openRegionComposer(selector);
        }}
      >
        <canvas ref={canvasRef} />
        <div ref={textLayerRef} className="textLayer pdf-text-layer" />
        <div className="pdf-idea-layer">
          {pageIdeas.map((idea) => {
            const selector = idea.selector as PdfRegionIdeaSelector;
            return <PdfIdeaNote key={idea.id} idea={idea} selector={selector} visible={ideasVisible} onUpdate={onUpdateIdea} />;
          })}
          {drag && (
            <span
              className="pdf-region-draft"
              style={{
                left: Math.min(drag.startX, drag.x),
                top: Math.min(drag.startY, drag.y),
                width: Math.abs(drag.x - drag.startX),
                height: Math.abs(drag.y - drag.startY),
              }}
            />
          )}
        </div>
        {composer && (
          <div className="pdf-idea-composer" style={{ left: composer.left, top: composer.top }}>
            <div><StickyNote size={14} /><strong>PDF Idea · 第 {pageNumber} 页</strong></div>
            {composer.selector.exact && <small>“{composer.selector.exact.slice(0, 100)}”</small>}
            <textarea
              autoFocus
              value={ideaText}
              placeholder="记下你的想法…"
              onChange={(event) => setIdeaText(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") void submitPdfIdea();
                if (event.key === "Escape") setComposer(null);
              }}
            />
            <div>
              <button type="button" onClick={() => setComposer(null)}>取消</button>
              <button type="button" className="primary" disabled={!ideaText.trim()} onClick={() => void submitPdfIdea()}>保存</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function DocumentPreview({
  pageId,
  type,
  title,
  onRename,
  ideas,
  ideasVisible,
  onIdeasVisible,
  onCreateIdea,
  onUpdateIdea,
  viewMemory,
  onViewMemoryChange,
}: DocumentPreviewProps) {
  const normalizedType = type.toLowerCase().replace(/^\./, "");
  const isPdf = normalizedType === "pdf";
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [pageNumber, setPageNumber] = useState(() => viewMemory?.pdfPage ?? 1);
  const [scale, setScale] = useState(() => viewMemory?.pdfScale ?? 1.15);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "empty">("loading");
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const previewRootRef = useRef<HTMLDivElement>(null);
  const pageElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollRafRef = useRef<number | null>(null);
  const docxRef = useRef<HTMLDivElement>(null);
  const restoredScrollRef = useRef(false);
  const skipPersistRef = useRef(true);
  const scaleRef = useRef(scale);
  const pageNumberRef = useRef(pageNumber);
  const savedMemoryRef = useRef(viewMemory);
  const [pageHeights, setPageHeights] = useState<Map<number, number>>(() => new Map());
  const [annotationMode, setAnnotationMode] = useState(false);

  scaleRef.current = scale;
  pageNumberRef.current = pageNumber;
  savedMemoryRef.current = viewMemory;

  const persistViewMemory = useCallback((patch: Partial<PageViewMemory>) => {
    if (skipPersistRef.current) return;
    onViewMemoryChange?.(patch);
  }, [onViewMemoryChange]);

  const onViewMemoryChangeRef = useRef(onViewMemoryChange);
  onViewMemoryChangeRef.current = onViewMemoryChange;

  const flushViewMemory = useCallback(() => {
    const persist = onViewMemoryChangeRef.current;
    if (!persist) return;
    if (isPdf) {
      const container = scrollRef.current;
      if (!container) return;
      persist({
        pdfScrollTop: container.scrollTop,
        pdfPage: detectPdfPageFromScroll(container, pageElementsRef.current, pageNumberRef.current),
        pdfScale: scaleRef.current,
      });
      return;
    }
    if (normalizedType === "docx") {
      const container = previewRootRef.current;
      if (!container) return;
      persist({ docxScrollTop: container.scrollTop });
    }
  }, [isPdf, normalizedType]);

  const registerPage = useCallback((page: number, element: HTMLDivElement | null) => {
    if (element) pageElementsRef.current.set(page, element);
    else pageElementsRef.current.delete(page);
  }, []);

  const updateCurrentPage = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const bestPage = detectPdfPageFromScroll(container, pageElementsRef.current, pageNumberRef.current);
    setPageNumber((current) => (current === bestPage ? current : bestPage));
  }, []);

  const scrollToPage = useCallback((target: number) => {
    const element = pageElementsRef.current.get(target);
    const container = scrollRef.current;
    if (!element || !container) return;
    container.scrollTo({ top: Math.max(0, element.offsetTop - 12), behavior: "smooth" });
    setPageNumber(target);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PdfLoadingTask | null = null;
    setStatus("loading");
    setError("");
    setPdf(null);
    setPageHeights(new Map());
    const saved = savedMemoryRef.current;
    setPageNumber(saved?.pdfPage ?? 1);
    setScale(saved?.pdfScale ?? 1.15);
    restoredScrollRef.current = false;
    skipPersistRef.current = true;
    pageElementsRef.current.clear();
    docxRef.current?.replaceChildren();

    void (async () => {
      try {
        const source = await api.vaultReadSource(pageId);
        if (cancelled) return;
        if (!source?.bytes) {
          setStatus("empty");
          return;
        }
        const bytes = decodeBase64(source.bytes);
        if (isPdf) {
          const pdfjs = await import("pdfjs-dist");
          if (cancelled) return;
          pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
          const task = pdfjs.getDocument({ data: bytes });
          loadingTask = task;
          if (cancelled) {
            await task.destroy();
            return;
          }
          const loadedPdf = await task.promise;
          if (cancelled) {
            await loadingTask.destroy();
            return;
          }
          setPdf(loadedPdf);
          setStatus("ready");
        } else if (normalizedType === "docx") {
          const { renderAsync } = await import("docx-preview");
          if (!docxRef.current || cancelled) return;
          const blobBytes = new Uint8Array(bytes.length);
          blobBytes.set(bytes);
          await renderAsync(new Blob([blobBytes.buffer]), docxRef.current);
          if (!cancelled) setStatus("ready");
        } else {
          setStatus("error");
          setError("暂不支持此原件格式");
        }
      } catch (cause) {
        if (!cancelled) {
          setStatus("error");
          setError(cause instanceof Error ? cause.message : "原件加载失败");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (loadingTask) void loadingTask.destroy();
      docxRef.current?.replaceChildren();
    };
  }, [isPdf, normalizedType, pageId]);

  useEffect(() => {
    if (!pdf) {
      setPageHeights(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        Array.from({ length: pdf.numPages }, (_, offset) => offset + 1).map(async (index) => {
          const page = await pdf.getPage(index);
          return [index, Math.ceil(page.getViewport({ scale }).height)] as const;
        }),
      );
      if (cancelled) return;
      setPageHeights(new Map(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, scale]);

  useEffect(() => {
    return () => {
      flushViewMemory();
    };
  }, [pageId, flushViewMemory]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !pdf) return;
    const onScroll = () => {
      if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        updateCurrentPage();
        persistViewMemory({
          pdfScrollTop: container.scrollTop,
          pdfPage: detectPdfPageFromScroll(container, pageElementsRef.current, pageNumberRef.current),
          pdfScale: scaleRef.current,
        });
      });
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current);
    };
  }, [pdf, updateCurrentPage, persistViewMemory]);

  useEffect(() => {
    if (!pdf || !scrollRef.current || restoredScrollRef.current) return;
    if (pageHeights.size < pdf.numPages) return;
    const saved = savedMemoryRef.current;
    const savedTop = saved?.pdfScrollTop ?? 0;
    const savedPage = saved?.pdfPage ?? 1;
    let attempts = 0;
    const apply = () => {
      const container = scrollRef.current;
      if (!container) return;
      const pageElement = pageElementsRef.current.get(savedPage);
      const targetTop = savedTop > 0
        ? savedTop
        : pageElement
          ? Math.max(0, pageElement.offsetTop - 12)
          : 0;
      container.scrollTop = targetTop;
      const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
      const heightsReady = pageHeights.size >= pdf.numPages;
      const closeEnough = Math.abs(container.scrollTop - targetTop) < 2 || targetTop >= maxScroll;
      if ((!heightsReady || !closeEnough) && attempts < 30) {
        attempts += 1;
        requestAnimationFrame(apply);
        return;
      }
      updateCurrentPage();
      restoredScrollRef.current = true;
      skipPersistRef.current = false;
    };
    requestAnimationFrame(apply);
  }, [pdf, pageId, pageHeights, updateCurrentPage]);

  useEffect(() => {
    if (!pdf || skipPersistRef.current) return;
    persistViewMemory({ pdfScale: scale });
  }, [scale, pdf, persistViewMemory]);

  useEffect(() => {
    if (normalizedType !== "docx" || status !== "ready") return;
    const container = previewRootRef.current;
    if (!container || restoredScrollRef.current) return;
    const savedTop = savedMemoryRef.current?.docxScrollTop ?? 0;
    requestAnimationFrame(() => {
      if (!previewRootRef.current) return;
      previewRootRef.current.scrollTop = savedTop;
      restoredScrollRef.current = true;
      skipPersistRef.current = false;
    });
  }, [normalizedType, status, pageId]);

  useEffect(() => {
    const container = previewRootRef.current;
    if (!container || normalizedType !== "docx" || status !== "ready") return;
    const onScroll = () => persistViewMemory({ docxScrollTop: container.scrollTop });
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [normalizedType, status, persistViewMemory, pageId]);

  const pageIdeasOnCurrent = ideas.filter(
    (idea) => idea.selector.kind === "pdf-region" && idea.selector.page === pageNumber && idea.status === "open",
  );

  if (status === "loading") return <div className="document-state">正在加载原件…</div>;
  if (status === "empty") return <div className="document-state">没有找到可预览的原件</div>;
  if (status === "error") return <div className="document-state document-error">{error}</div>;

  return <div ref={previewRootRef} className={isPdf ? "document-preview pdf-preview" : "document-preview docx-preview"}>
    {isPdf ? <>
      <div className="document-controls">
        <EditableDocumentTitle title={title} onRename={onRename} />
        <button type="button" title="缩小" aria-label="缩小" onClick={() => setScale((value) => Math.max(0.6, value - 0.15))}><Minus size={15} /></button>
        <span>{Math.round(scale * 100)}%</span>
        <button type="button" title="放大" aria-label="放大" onClick={() => setScale((value) => Math.min(2.5, value + 0.15))}><Plus size={15} /></button>
        <button type="button" title="上一页" aria-label="上一页" disabled={pageNumber <= 1} onClick={() => scrollToPage(pageNumber - 1)}><ChevronLeft size={15} /></button>
        <PdfPageJump pageNumber={pageNumber} totalPages={pdf?.numPages ?? 0} onJump={scrollToPage} />
        <button type="button" title="下一页" aria-label="下一页" disabled={!pdf || pageNumber >= pdf.numPages} onClick={() => scrollToPage(pageNumber + 1)}><ChevronRight size={15} /></button>
        <button type="button" className={annotationMode ? "active" : ""} title="框选区域添加 Idea" aria-label="框选区域添加 Idea" onClick={() => setAnnotationMode((value) => !value)}><Scan size={15} /></button>
        {pageIdeasOnCurrent.length > 0 && (
          <button type="button" title={ideasVisible ? "隐藏便签" : "显示便签"} aria-label={ideasVisible ? "隐藏便签" : "显示便签"} onClick={() => onIdeasVisible(!ideasVisible)}>
            {ideasVisible ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
      </div>
      <div ref={scrollRef} className="pdf-scroll">
        {pdf && Array.from({ length: pdf.numPages }, (_, index) => index + 1).map((page) => (
          <PdfPageSurface
            key={page}
            pdf={pdf}
            pageNumber={page}
            scale={scale}
            ideas={ideas}
            ideasVisible={ideasVisible}
            annotationMode={annotationMode}
            scrollRoot={scrollRef}
            estimatedHeight={pageHeights.get(page)}
            onRegister={registerPage}
            onCreateIdea={onCreateIdea}
            onUpdateIdea={onUpdateIdea}
          />
        ))}
        {annotationMode && <div className="pdf-annotation-hint">拖动鼠标框选图片、公式、表格或扫描文字区域</div>}
      </div>
    </> : <>
      <div className="document-controls">
        <EditableDocumentTitle title={title} onRename={onRename} />
      </div>
      <div ref={docxRef} className="docx-page" />
    </>}
  </div>;
}

function PdfIdeaNote({ idea, selector, visible, onUpdate }: { idea: Idea; selector: PdfRegionIdeaSelector; visible: boolean; onUpdate: DocumentPreviewProps["onUpdateIdea"] }) {
  const [draft, setDraft] = useState(idea.content);
  const [saving, setSaving] = useState(false);
  const [hovered, setHovered] = useState(false);
  const hideTimer = useRef<number | null>(null);
  useEffect(() => setDraft(idea.content), [idea.content]);
  const dirty = draft.trim() !== idea.content;
  const show = () => {
    if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    setHovered(true);
  };
  const hide = () => {
    if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setHovered(false), 100);
  };
  return <>
    <span
      className="pdf-idea-region"
      data-idea-mark={idea.id}
      tabIndex={visible ? 0 : -1}
      role="button"
      aria-label="查看 PDF Idea"
      style={{ left: `${selector.x * 100}%`, top: `${selector.y * 100}%`, width: `${selector.width * 100}%`, height: `${selector.height * 100}%` }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    />
    {visible && hovered && <aside className="pdf-idea-sticky" data-idea-sticky={idea.id} style={{ left: `${Math.min(0.72, selector.x + selector.width + 0.018) * 100}%`, top: `${selector.y * 100}%` }} onMouseEnter={show} onMouseLeave={hide}>
      <div><span>IDEA</span><small>第 {selector.page} 页</small></div>
      {selector.exact && <q>{selector.exact}</q>}
      <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />
      {dirty && <button type="button" disabled={saving || !draft.trim()} onClick={() => { setSaving(true); void onUpdate(idea.id, { content: draft.trim() }).finally(() => setSaving(false)); }}><Check size={13} />{saving ? "保存中" : "保存"}</button>}
    </aside>}
  </>;
}

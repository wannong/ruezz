import { Check, ChevronLeft, ChevronRight, Eye, EyeOff, Minus, Plus, Scan, StickyNote } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, type Idea, type IdeaSelector, type PdfRegionIdeaSelector } from "../api";
import "pdfjs-dist/web/pdf_viewer.css";

type DocumentPreviewProps = {
  pageId: string;
  type: string;
  name?: string;
  ideas: Idea[];
  ideasVisible: boolean;
  onIdeasVisible: (visible: boolean) => void;
  onCreateIdea: (selector: IdeaSelector, content: string) => Promise<boolean>;
  onUpdateIdea: (id: string, patch: Partial<Pick<Idea, "content" | "status">>) => Promise<void>;
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

export function DocumentPreview({ pageId, type, name, ideas, ideasVisible, onIdeasVisible, onCreateIdea, onUpdateIdea }: DocumentPreviewProps) {
  const normalizedType = type.toLowerCase().replace(/^\./, "");
  const isPdf = normalizedType === "pdf";
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.15);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "empty">("loading");
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const docxRef = useRef<HTMLDivElement>(null);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [drag, setDrag] = useState<{ startX: number; startY: number; x: number; y: number } | null>(null);
  const [composer, setComposer] = useState<{ selector: PdfRegionIdeaSelector; left: number; top: number } | null>(null);
  const [ideaText, setIdeaText] = useState("");

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PdfLoadingTask | null = null;
    setStatus("loading");
    setError("");
    setPdf(null);
    setPageNumber(1);
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
    if (!pdf || !canvasRef.current) return;
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
       if (pageRef.current) {
         pageRef.current.style.width = canvas.style.width;
         pageRef.current.style.height = canvas.style.height;
         pageRef.current.style.setProperty("--scale-factor", String(viewport.scale));
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
      if (!cancelled && !(cause instanceof Error && cause.name === "RenderingCancelledException")) setError("PDF 页面渲染失败");
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
  }, [pdf, pageNumber, scale]);

  const pageIdeas = ideas.filter((idea) => idea.selector.kind === "pdf-region" && idea.selector.page === pageNumber && idea.status === "open");
  const normalizedRegion = (left: number, top: number, width: number, height: number, exact?: string): PdfRegionIdeaSelector | null => {
    const page = pageRef.current;
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
    const page = pageRef.current;
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
    const page = pageRef.current;
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

  if (status === "loading") return <div className="document-state">正在加载原件…</div>;
  if (status === "empty") return <div className="document-state">没有找到可预览的原件</div>;
  if (status === "error") return <div className="document-state document-error">{error}</div>;

  return <div className={isPdf ? "document-preview pdf-preview" : "document-preview docx-preview"}>
    {isPdf ? <>
      <div className="document-controls">
        <span className="document-name">{name ?? "PDF 原件"}</span>
        <button type="button" title="缩小" aria-label="缩小" onClick={() => setScale((value) => Math.max(0.6, value - 0.15))}><Minus size={15} /></button>
        <span>{Math.round(scale * 100)}%</span>
        <button type="button" title="放大" aria-label="放大" onClick={() => setScale((value) => Math.min(2.5, value + 0.15))}><Plus size={15} /></button>
        <button type="button" title="上一页" aria-label="上一页" disabled={pageNumber <= 1} onClick={() => setPageNumber((value) => value - 1)}><ChevronLeft size={15} /></button>
        <span>{pageNumber} / {pdf?.numPages ?? 0}</span>
        <button type="button" title="下一页" aria-label="下一页" disabled={!pdf || pageNumber >= pdf.numPages} onClick={() => setPageNumber((value) => value + 1)}><ChevronRight size={15} /></button>
        <button type="button" className={annotationMode ? "active" : ""} title="框选区域添加 Idea" aria-label="框选区域添加 Idea" onClick={() => setAnnotationMode((value) => !value)}><Scan size={15} /></button>
        {pageIdeas.length > 0 && <button type="button" title={ideasVisible ? "隐藏便签" : "显示便签"} aria-label={ideasVisible ? "隐藏便签" : "显示便签"} onClick={() => onIdeasVisible(!ideasVisible)}>{ideasVisible ? <EyeOff size={15} /> : <Eye size={15} />}</button>}
      </div>
      <div className="pdf-page">
        <div
          ref={pageRef}
          className={`pdf-page-surface${annotationMode ? " annotating" : ""}`}
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
            setDrag({ ...drag, x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)), y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)) });
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
            {drag && <span className="pdf-region-draft" style={{ left: Math.min(drag.startX, drag.x), top: Math.min(drag.startY, drag.y), width: Math.abs(drag.x - drag.startX), height: Math.abs(drag.y - drag.startY) }} />}
          </div>
          {composer && (
            <div className="pdf-idea-composer" style={{ left: composer.left, top: composer.top }}>
              <div><StickyNote size={14} /><strong>PDF Idea · 第 {pageNumber} 页</strong></div>
              {composer.selector.exact && <small>“{composer.selector.exact.slice(0, 100)}”</small>}
              <textarea autoFocus value={ideaText} placeholder="记下你的想法…" onChange={(event) => setIdeaText(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") void submitPdfIdea(); if (event.key === "Escape") setComposer(null); }} />
              <div><button type="button" onClick={() => setComposer(null)}>取消</button><button type="button" className="primary" disabled={!ideaText.trim()} onClick={() => void submitPdfIdea()}>保存</button></div>
            </div>
          )}
        </div>
        {annotationMode && <div className="pdf-annotation-hint">拖动鼠标框选图片、公式、表格或扫描文字区域</div>}
      </div>
    </> : <div ref={docxRef} className="docx-page" />}
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

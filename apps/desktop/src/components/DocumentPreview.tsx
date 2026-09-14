import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";

type DocumentPreviewProps = { pageId: string; type: string; name?: string };
type PdfDocument = import("pdfjs-dist").PDFDocumentProxy;
type PdfRenderTask = import("pdfjs-dist").RenderTask;
type PdfLoadingTask = import("pdfjs-dist").PDFDocumentLoadingTask;

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function DocumentPreview({ pageId, type, name }: DocumentPreviewProps) {
  const normalizedType = type.toLowerCase().replace(/^\./, "");
  const isPdf = normalizedType === "pdf";
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.15);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "empty">("loading");
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docxRef = useRef<HTMLDivElement>(null);

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
    void pdf.getPage(pageNumber).then((page) => {
      if (cancelled || !canvasRef.current) return;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("当前环境不支持 Canvas");
       renderTask = page.render({ canvasContext: context, viewport });
      return renderTask.promise;
    }).catch((cause: unknown) => {
      if (!cancelled && !(cause instanceof Error && cause.name === "RenderingCancelledException")) setError("PDF 页面渲染失败");
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
      if (canvasRef.current) {
        canvasRef.current.width = 0;
        canvasRef.current.height = 0;
      }
    };
  }, [pdf, pageNumber, scale]);

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
      </div>
      <div className="pdf-page"><canvas ref={canvasRef} /></div>
    </> : <div ref={docxRef} className="docx-page" />}
  </div>;
}

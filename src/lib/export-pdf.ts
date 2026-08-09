import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/**
 * Rasterises a printable DOM node into a paginated A4 PDF.
 * Rendering through the browser guarantees correctly shaped Arabic script,
 * which font-embedding PDF writers cannot do on their own.
 */
const COLOR_PROPS = [
  "color",
  "backgroundColor",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "outlineColor",
  "textDecorationColor",
  "fill",
  "stroke",
] as const;

/** html2canvas cannot parse modern colour spaces, so resolve them to rgb via the canvas API. */
function toRgb(value: string, cache: Map<string, string>): string {
  const cached = cache.get(value);
  if (cached) return cached;
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  const context = probe.getContext("2d", { willReadFrequently: true });
  let result = "rgb(0, 0, 0)";
  if (context) {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const data = context.getImageData(0, 0, 1, 1).data;
    result = `rgba(${data[0]}, ${data[1]}, ${data[2]}, ${((data[3] ?? 255) / 255).toFixed(3)})`;

  }
  cache.set(value, result);
  return result;
}

/** Rewrites every oklch custom property and inline colour in the cloned document. */
function normaliseDocument(doc: Document) {
  const cache = new Map<string, string>();
  const view = doc.defaultView ?? window;

  // 1. Resolve design-token custom properties declared on :root / html.
  const rootStyles = view.getComputedStyle(doc.documentElement);
  const names = new Set<string>();
  for (let i = 0; i < rootStyles.length; i += 1) {
    const name = rootStyles.item(i);
    if (name.startsWith("--")) names.add(name);
  }
  Array.from(doc.styleSheets).forEach((sheet) => {
    try {
      Array.from(sheet.cssRules).forEach((rule) => {
        (rule.cssText.match(/--[\w-]+/g) ?? []).forEach((name) => names.add(name));
      });
    } catch {
      /* cross-origin sheet */
    }
  });

  const overrides: string[] = [];
  names.forEach((name) => {
    const value = rootStyles.getPropertyValue(name).trim();
    if (value.includes("oklch")) overrides.push(`${name}: ${toRgb(value, cache)};`);
  });
  if (overrides.length) {
    const style = doc.createElement("style");
    style.textContent = `:root, html, body, *, *::before, *::after { ${overrides.join(" ")} }`;
    doc.head.appendChild(style);
  }


  // 2. Flatten anything still computing to oklch.
  const nodes = Array.from(doc.querySelectorAll<HTMLElement>("*"));
  nodes.forEach((node) => {
    const computed = view.getComputedStyle(node);
    COLOR_PROPS.forEach((prop) => {
      const value = computed[prop] as string | undefined;
      if (value && value.includes("oklch")) {
        node.style.setProperty(
          prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`),
          toRgb(value, cache),
        );
      }
    });
    if (computed.boxShadow?.includes("oklch")) node.style.boxShadow = "none";
    if (computed.backgroundImage?.includes("oklch")) node.style.backgroundImage = "none";
  });
}

async function rasterise(node: HTMLElement): Promise<HTMLCanvasElement> {
  const width = Math.ceil(node.getBoundingClientRect().width || node.scrollWidth);
  const height = Math.ceil(node.scrollHeight);
  return html2canvas(node, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
    width,
    height,
    windowWidth: Math.max(width + 80, document.documentElement.clientWidth),
    scrollX: 0,
    scrollY: 0,
    onclone: (doc) => normaliseDocument(doc),
  });
}

/**
 * Collects the bottom edge (in CSS px, relative to the target's top) of every
 * atomic block so page breaks never cut through a question row or paragraph.
 */
function collectBreakpoints(target: HTMLElement): number[] {
  const top = target.getBoundingClientRect().top;
  const blocks = Array.from(target.querySelectorAll<HTMLElement>("[data-report-block]"));
  const points = blocks.map((el) => el.getBoundingClientRect().bottom - top);
  return Array.from(new Set(points.map((p) => Math.round(p)))).sort((a, b) => a - b);
}

/** Outer page margin (mm) applied symmetrically so RTL/LTR text is never clipped. */
const MARGIN_MM = 12;

/** Adds one canvas to the PDF, splitting it across pages at safe boundaries. */
function addCanvas(pdf: jsPDF, canvas: HTMLCanvasElement, isFirst: boolean, breakpointsPx: number[], cssWidth: number) {
  const pageWidthMm = pdf.internal.pageSize.getWidth();
  const pageHeightMm = pdf.internal.pageSize.getHeight();
  const contentWidthMm = pageWidthMm - MARGIN_MM * 2;
  const contentHeightMm = pageHeightMm - MARGIN_MM * 2;
  // Scale is driven by the content box, so the full capture width always fits.
  const pxPerMm = canvas.width / contentWidthMm;
  const pageHeightPx = Math.floor(contentHeightMm * pxPerMm);
  const ratio = cssWidth > 0 ? canvas.width / cssWidth : 1;
  const breaks = breakpointsPx.map((p) => Math.round(p * ratio));

  let offset = 0;
  let first = isFirst;
  while (offset < canvas.height) {
    const remaining = canvas.height - offset;
    let sliceHeight = Math.min(pageHeightPx, remaining);

    if (remaining > pageHeightPx) {
      // Snap to the last block boundary that still fits on this page.
      const limit = offset + pageHeightPx;
      const candidates = breaks.filter((b) => b > offset + pageHeightPx * 0.25 && b <= limit);
      if (candidates.length > 0) sliceHeight = candidates[candidates.length - 1]! - offset;
    }

    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = sliceHeight;
    const context = slice.getContext("2d");
    if (!context) throw new Error("Unable to render the PDF page");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, slice.width, slice.height);
    context.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

    if (!first) pdf.addPage();
    pdf.addImage(
      slice.toDataURL("image/jpeg", 0.92),
      "JPEG",
      MARGIN_MM,
      MARGIN_MM,
      contentWidthMm,
      sliceHeight / pxPerMm,
    );
    first = false;
    offset += sliceHeight;
  }
}


export async function nodeToPdfBlob(node: HTMLElement): Promise<Blob> {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pages = Array.from(node.querySelectorAll<HTMLElement>("[data-report-page]"));
  const targets = pages.length > 0 ? pages : [node];

  let first = true;
  for (const target of targets) {
    const breaks = collectBreakpoints(target);
    const cssWidth = target.getBoundingClientRect().width || target.scrollWidth;
    const canvas = await rasterise(target);
    // Each [data-report-page] starts on a fresh PDF page.
    addCanvas(pdf, canvas, first, breaks, cssWidth);
    first = false;
  }

  return pdf.output("blob");
}



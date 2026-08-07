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
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    result = `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
  }
  cache.set(value, result);
  return result;
}

function normaliseColors(root: HTMLElement) {
  const cache = new Map<string, string>();
  const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  nodes.forEach((node) => {
    const computed = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (!computed) return;
    COLOR_PROPS.forEach((prop) => {
      const value = computed[prop] as string | undefined;
      if (value && value.includes("oklch")) node.style.setProperty(prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), toRgb(value, cache));
    });
    if (computed.boxShadow?.includes("oklch")) node.style.boxShadow = "none";
    if (computed.backgroundImage?.includes("oklch")) node.style.backgroundImage = "none";
  });
}

export async function nodeToPdfBlob(node: HTMLElement): Promise<Blob> {
  const canvas = await html2canvas(node, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
    windowWidth: node.scrollWidth,
    onclone: (_doc, element) => normaliseColors(element as HTMLElement),
  });


  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidthMm = pdf.internal.pageSize.getWidth();
  const pageHeightMm = pdf.internal.pageSize.getHeight();
  const pxPerMm = canvas.width / pageWidthMm;
  const pageHeightPx = Math.floor(pageHeightMm * pxPerMm);

  let offset = 0;
  let first = true;
  while (offset < canvas.height) {
    const sliceHeight = Math.min(pageHeightPx, canvas.height - offset);
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
      0,
      0,
      pageWidthMm,
      sliceHeight / pxPerMm,
    );
    first = false;
    offset += sliceHeight;
  }

  return pdf.output("blob");
}

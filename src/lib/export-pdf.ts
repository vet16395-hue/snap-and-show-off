import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/**
 * Rasterises a printable DOM node into a paginated A4 PDF.
 * Rendering through the browser guarantees correctly shaped Arabic script,
 * which font-embedding PDF writers cannot do on their own.
 */
export async function nodeToPdfBlob(node: HTMLElement): Promise<Blob> {
  const canvas = await html2canvas(node, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
    windowWidth: node.scrollWidth,
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

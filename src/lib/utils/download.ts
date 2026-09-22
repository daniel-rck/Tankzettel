/**
 * Offer `content` as a file download. The anchor is attached for the click
 * (Firefox ignores detached anchors) and the object URL is revoked only after
 * the browser had a chance to start the download (Safari cancels otherwise).
 */
export function downloadFile(content: BlobPart, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export const errorText = (e: unknown) =>
  e instanceof Error ? e.message : String(e);
export const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function download(
  data: BlobPart,
  name: string,
  type = "application/octet-stream",
) {
  name=name.replace(/[<>:"/\\|?*\x00-\x1f]/g,"_").replace(/[. ]+$/g,"");
  const blob = new Blob([data], { type });
  const extension = name.match(/\.[^.]+$/)?.[0];
  const picker = (window as Window & {
    showSaveFilePicker?: (options: {
      suggestedName: string;
      types: { description: string; accept: Record<string, string[]> }[];
    }) => Promise<{ createWritable: () => Promise<{ write: (value: Blob) => Promise<void>; close: () => Promise<void> }> }>;
  }).showSaveFilePicker;
  if (extension && picker) {
    try {
      const handle = await picker.call(window, {
        suggestedName: name,
        types: [{ description: type, accept: { [type.split(";")[0]]: [extension] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      throw error;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display="none";document.body.appendChild(a);a.click();a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

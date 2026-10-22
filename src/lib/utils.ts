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
export function download(
  data: BlobPart,
  name: string,
  type = "application/octet-stream",
) {
  name=name.replace(/[<>:"/\\|?*\x00-\x1f]/g,"_").replace(/[. ]+$/g,"");
  const url = URL.createObjectURL(new File([data],name, { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display="none";document.body.appendChild(a);a.click();a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

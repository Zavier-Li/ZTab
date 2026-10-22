import en from "./en.json";
export type Language = "zh" | "en";
let language: Language =
  typeof localStorage !== "undefined" &&
  localStorage.getItem("ztab-language") === "en"
    ? "en"
    : "zh";
export function getLanguage() {
  return language;
}
export function setLanguage(value: Language) {
  language = value;
  localStorage.setItem("ztab-language", value);
}
const messages: Record<string, string> = en;
function format(text: string, values: unknown[]) {
  return text.replace(/\{(\d+)\}/g, (_, n) => String(values[Number(n)] ?? ""));
}
export function t(text: string, values: unknown[] = []): string {
  if (language === "zh") return format(text, values);
  if (messages[text]) return format(messages[text], values);
  if (values.length) return format(text, values);
  return translateDynamic(text);
}
const patterns: { regex: RegExp; value: string }[] = [];
function translateDynamic(text: string) {
  if (!/[\u4e00-\u9fff]/.test(text)) return text;
  if (!patterns.length)
    for (const [key, value] of Object.entries(messages)) {
      if (!/\{\d+\}/.test(key)) continue;
      const pattern = key
        .split(/(\{\d+\})/)
        .map((s) =>
          /^\{\d+\}$/.test(s)
            ? "(.*?)"
            : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        )
        .join("");
      patterns.push({ regex: new RegExp("^" + pattern + "$"), value });
    }
  for (const p of patterns) {
    const match = text.match(p.regex);
    if (match) return format(p.value, match.slice(1));
  }
  return text;
}

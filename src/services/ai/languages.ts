/**
 * Output languages offered for AI features. `value` is the English name that
 * gets embedded in prompts; `label` is what the user sees. The empty value
 * means "auto" — the model mirrors the language of the user's own notes.
 */
export const AI_LANGUAGES: Array<{ value: string; label: string }> = [
  { value: "", label: "Auto (match my notes)" },
  { value: "English", label: "English" },
  { value: "Simplified Chinese", label: "简体中文" },
  { value: "Traditional Chinese", label: "繁體中文" },
  { value: "Japanese", label: "日本語" },
  { value: "Korean", label: "한국어" },
  { value: "Spanish", label: "Español" },
  { value: "French", label: "Français" },
  { value: "German", label: "Deutsch" },
  { value: "Portuguese", label: "Português" },
  { value: "Italian", label: "Italiano" },
  { value: "Russian", label: "Русский" },
  { value: "Hindi", label: "हिन्दी" },
  { value: "Arabic", label: "العربية" },
  { value: "Vietnamese", label: "Tiếng Việt" },
  { value: "Thai", label: "ไทย" },
  { value: "Indonesian", label: "Bahasa Indonesia" },
  { value: "Turkish", label: "Türkçe" },
  { value: "Dutch", label: "Nederlands" },
  { value: "Polish", label: "Polski" }
];

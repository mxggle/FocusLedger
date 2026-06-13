import { invoke } from "@tauri-apps/api/core";
import { writeImage } from "@tauri-apps/plugin-clipboard-manager";
import { save } from "@tauri-apps/plugin-dialog";
import { toBlob } from "html-to-image";
import { buildShareFilename } from "./shareModel";

/**
 * Renders a DOM node to PNG bytes. Captured at 2x for crisp output and with an
 * explicit white background so transparent corners don't show through.
 */
export async function captureElementToPng(node: HTMLElement): Promise<Uint8Array> {
  const blob = await toBlob(node, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: "#ffffff"
  });
  if (!blob) {
    throw new Error("Could not render the report image.");
  }
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Prompts for a location and writes the PNG there. Returns the saved path, or
 * null if the user cancelled the dialog.
 */
export async function saveDayImage(bytes: Uint8Array, date: string): Promise<string | null> {
  const path = await save({
    defaultPath: buildShareFilename(date),
    filters: [{ name: "PNG image", extensions: ["png"] }]
  });
  if (!path) {
    return null;
  }
  // number[] serializes reliably to Rust's Vec<u8> for a one-shot export.
  await invoke("write_binary_file", { path, contents: Array.from(bytes) });
  return path;
}

/** Copies the PNG to the system clipboard for pasting straight into a post. */
export async function copyDayImage(bytes: Uint8Array): Promise<void> {
  await writeImage(bytes);
}

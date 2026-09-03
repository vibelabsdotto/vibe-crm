"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Kopieren" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard-API nicht verfügbar — still schweigen.
    }
  }

  return (
    <button type="button" className="btn btn-sm" onClick={copy}>
      {copied ? "Kopiert!" : label}
    </button>
  );
}

"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

export function CopyButton({ text, label = "Kopieren" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.add({ type: "error", title: "Kopieren fehlgeschlagen", description: "Bitte den Text auswählen und manuell kopieren." });
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={copy}>
      {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
      {copied ? "Kopiert!" : label}
    </Button>
  );
}

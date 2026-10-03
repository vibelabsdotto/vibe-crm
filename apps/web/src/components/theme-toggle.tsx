"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const subscribe = () => () => {};
const getMountedSnapshot = () => true;
const getServerSnapshot = () => false;

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, getMountedSnapshot, getServerSnapshot);
  const dark = mounted && resolvedTheme === "dark";
  const label = dark ? "Zu hellem Modus wechseln" : "Zu dunklem Modus wechseln";

  return (
    <Button type="button" variant="ghost" size="icon" onClick={() => setTheme(dark ? "light" : "dark")} aria-label={label} title={label}>
      {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}

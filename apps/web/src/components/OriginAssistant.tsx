"use client";

import { useEffect, useRef, useState } from "react";
import ChatPanel from "./ChatPanel";
import OriginOrb from "./OriginOrb";

export default function OriginAssistant() {
  const orbRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  function close() {
    setOpen(false);
    orbRef.current?.focus();
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => {
          if (current) orbRef.current?.focus();
          return !current;
        });
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <OriginOrb orbRef={orbRef} onClick={() => setOpen((current) => !current)} />
      <ChatPanel open={open} onClose={close} orbRef={orbRef} />
    </>
  );
}

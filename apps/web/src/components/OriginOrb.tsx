"use client";

import { useEffect, useRef } from "react";

const ORB_SIZE = 64;
const EDGE_MARGIN = 8;
const DRAG_THRESHOLD = 5;
const STORAGE_KEY = "origin.orb.position";

type Position = { x: number; y: number };

type OriginOrbProps = {
  onClick?: () => void;
};

function clampToViewport(position: Position): Position {
  const maxX = Math.max(EDGE_MARGIN, window.innerWidth - ORB_SIZE - EDGE_MARGIN);
  const maxY = Math.max(EDGE_MARGIN, window.innerHeight - ORB_SIZE - EDGE_MARGIN);
  return {
    x: Math.min(Math.max(position.x, EDGE_MARGIN), maxX),
    y: Math.min(Math.max(position.y, EDGE_MARGIN), maxY),
  };
}

function loadPosition(): Position | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) {
      return { x: parsed.x, y: parsed.y };
    }
  } catch {
    // Storage blocked or bad data: fall back to the default position.
  }
  return null;
}

function savePosition(position: Position) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Storage blocked or full: the orb still works, it just won't remember.
  }
}

export default function OriginOrb({ onClick = () => {} }: OriginOrbProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Position the user chose. null means "use the default bottom-right from CSS".
  const positionRef = useRef<Position | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startPointer: Position;
    startOrb: Position;
  } | null>(null);
  const draggedRef = useRef(false);

  // The position is written straight to the element instead of React state,
  // so the server HTML and the first client render always match.
  function applyPosition(position: Position) {
    const button = buttonRef.current;
    if (!button) return;
    const clamped = clampToViewport(position);
    button.style.left = `${clamped.x}px`;
    button.style.top = `${clamped.y}px`;
    button.style.right = "auto";
    button.style.bottom = "auto";
  }

  useEffect(() => {
    const saved = loadPosition();
    if (saved) {
      positionRef.current = saved;
      applyPosition(saved);
    }
    // Hidden until now so a restored orb does not jump from the default spot.
    if (buttonRef.current) buttonRef.current.style.opacity = "1";

    function handleResize() {
      if (positionRef.current) applyPosition(positionRef.current);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      startPointer: { x: event.clientX, y: event.clientY },
      startOrb: { x: rect.left, y: rect.top },
    };
    draggedRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startPointer.x;
    const dy = event.clientY - drag.startPointer.y;
    if (!draggedRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    draggedRef.current = true;
    positionRef.current = clampToViewport({
      x: drag.startOrb.x + dx,
      y: drag.startOrb.y + dy,
    });
    applyPosition(positionRef.current);
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (draggedRef.current && positionRef.current) {
      savePosition(positionRef.current);
    }
  }

  function handleClick() {
    // A drag ends with a click event too; swallow that one.
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    onClick();
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label="Open Origin"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onClick={handleClick}
      className="origin-orb fixed right-6 bottom-6 z-50 h-16 w-16 cursor-grab touch-none rounded-full opacity-0 transition-opacity duration-300 select-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white active:cursor-grabbing"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icon-192.png"
        alt=""
        draggable={false}
        className="pointer-events-none h-full w-full scale-[1.3] object-cover"
      />
    </button>
  );
}

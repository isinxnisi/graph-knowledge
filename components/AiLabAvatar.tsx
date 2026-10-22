"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./AiLabAvatar.module.css";

// Presentation only; independent of records, models and activity monitoring.
const intensity: "standard" | "strong" = "standard";
export default function AiLabAvatar() {
  const ref = useRef<HTMLDivElement>(null), [moving,setMoving] = useState(false);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)"); let onScreen = false;
    const sync = () => setMoving(onScreen && !document.hidden && !media.matches);
    const observer = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync(); });
    if (ref.current) observer.observe(ref.current);
    media.addEventListener("change",sync); document.addEventListener("visibilitychange",sync);
    return () => { observer.disconnect(); media.removeEventListener("change",sync); document.removeEventListener("visibilitychange",sync); };
  },[]);
  return <div ref={ref} className={styles.stage} data-testid="lab-motion-avatar" data-moving={moving} data-strength={intensity}>
    {/* Existing comparison artwork; facial expressions are not animated. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className={styles.body} src="/ai-lab/apprentice-profile.png" width="128" height="128" alt="" draggable={false}/>
  </div>;
}

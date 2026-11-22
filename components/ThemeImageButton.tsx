"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { ThemeReadingImage } from "../lib/domain/theme-reading-presentation";
import { useDialogBackdrop } from "../lib/client/use-dialog-backdrop";
import DialogCloseButton from "./DialogCloseButton";
import css from "./ThemeImageButton.module.css";

export default function ThemeImageButton({ image, en, variant = "cover", className, onError }: {
  image: ThemeReadingImage;
  en: boolean;
  variant?: "cover" | "timeline" | "detail";
  className?: string;
  onError?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  const cover = variant === "cover";
  const action = en ? "Enlarge image" : "画像を拡大";
  const label = cover
    ? (en ? "Enlarge theme image" : "テーマ画像を拡大")
    : image.alt ? action + " (" + image.alt + ")" : action;

  return <>
    <button type="button" className={className ?? css[variant]} aria-label={label}
      aria-haspopup="dialog" data-record-image={cover ? undefined : variant}
      onClick={() => setExpanded(true)}>
      <Image unoptimized src={image.src + (variant === "timeline" ? "?size=small" : "")}
        width={image.width} height={image.height} alt={image.alt}
        style={{objectPosition:image.focus}}
        onError={() => { setBroken(true); onError?.(); }} />
    </button>
    {expanded&&<ThemeImageDialog image={image} en={en} cover={cover} onClose={() => setExpanded(false)} />}
  </>;
}

function ThemeImageDialog({ image, en, cover, onClose }: {
  image: ThemeReadingImage; en: boolean; cover: boolean; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const close = () => { dialog.current?.close(); onClose(); };
  const backdrop = useDialogBackdrop(close);
  const label = cover ? (en ? "Theme image" : "テーマ画像") : (en ? "Record image" : "記録の画像");
  return <dialog ref={dialog} className={css.imageDialog} aria-label={label}
    onCancel={event => { event.preventDefault(); close(); }} {...backdrop}>
    <div className={css.imageControls}><DialogCloseButton label={en ? "Close" : "閉じる"} onClick={close}/></div>
    <figure className={css.enlargedArt}>
      <Image unoptimized src={image.src} width={image.width} height={image.height} alt={image.alt}/>
      {(image.caption||image.credit)&&<figcaption>{image.caption}{image.caption&&image.credit&&" — "}{image.credit}</figcaption>}
    </figure>
  </dialog>;
}

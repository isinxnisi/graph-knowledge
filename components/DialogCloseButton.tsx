import type { Ref } from "react";
import Icon from "./Icon";

export default function DialogCloseButton({ label, onClick, buttonRef }: { label: string; onClick: () => void; buttonRef?: Ref<HTMLButtonElement> }) {
  return <button type="button" data-dialog-close aria-label={label} title={label} onClick={onClick} ref={buttonRef}><Icon name="close" /></button>;
}

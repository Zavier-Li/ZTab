import { t as tr } from "@/lib/i18n";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
export function Modal({
  title,
  description,
  open,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  description?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <D.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <D.Portal>
        <D.Overlay className="modal-overlay" />
        <D.Content
          className={`modal-content ${wide ? "modal-wide" : ""}`}
          aria-describedby={description ? "modal-desc" : undefined}
        >
          <D.Title className="text-xl font-semibold">{title}</D.Title>
          {description && (
            <D.Description
              id="modal-desc"
              className="mt-2 text-sm text-muted-foreground"
            >
              {description}
            </D.Description>
          )}
          <D.Close className="modal-close" aria-label={tr("关闭")}>
            <X size={18} />
          </D.Close>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

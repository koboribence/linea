import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  title: string;
  children: ReactNode;
  /** The buttons; the first one gets the focus */
  actions: ReactNode;
}

/** A dialog in front of everything, for a choice the person has to make before going on. */
export function Modal({ title, children, actions }: ModalProps) {
  const actionsRef = useRef<HTMLDivElement>(null);
  useEffect(() => actionsRef.current?.querySelector('button')?.focus(), []);
  return (
    <div className="modal" role="presentation">
      <div className="modal__dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title" className="modal__title">
          {title}
        </h2>
        <div className="modal__body">{children}</div>
        <div ref={actionsRef} className="modal__actions">
          {actions}
        </div>
      </div>
    </div>
  );
}

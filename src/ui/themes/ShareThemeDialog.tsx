import { useEffect, useRef, useState } from 'react';
import type { CustomTheme } from '../../domain/poster/ThemeCode';
import { useLocale } from '../../i18n/LocaleContext';
import { QrCode } from './QrCode';
import { ThemeLink } from './ThemeLink';

interface ShareThemeDialogProps {
  theme: CustomTheme;
  onClose: () => void;
}

/** Modal with a QR code and a copyable link that saves the colors on another device. */
export function ShareThemeDialog({ theme, onClose }: ShareThemeDialogProps) {
  const { i18n } = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const link = ThemeLink.create(theme);

  // The native <dialog> handles focus trapping and the Escape key
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Clipboard blocked: the link text is selectable as a fallback
    }
  };

  return (
    <dialog
      ref={dialog}
      className="dialog"
      aria-labelledby="share-title"
      onClose={onClose}
      onClick={(event) => event.target === dialog.current && dialog.current.close()}
    >
      <div className="dialog__body">
        <h2 id="share-title" className="dialog__title">
          {i18n.t('share.title')}
        </h2>
        <div className="dialog__colors" aria-hidden="true">
          <span style={{ background: theme.background }} />
          <span style={{ background: theme.accent }} />
        </div>
        <QrCode text={link} label={i18n.t('share.title')} />
        <p className="dialog__hint">{i18n.t('share.hint')}</p>
        <input
          className="text-input dialog__link"
          id="share-link"
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
        />
        <div className="dialog__actions">
          <button type="button" className="button button--primary" onClick={copy}>
            {copied ? i18n.t('share.copied') : i18n.t('share.copy')}
          </button>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => dialog.current?.close()}
          >
            {i18n.t('share.close')}
          </button>
        </div>
      </div>
    </dialog>
  );
}

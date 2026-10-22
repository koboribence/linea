interface ToggleProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Shown as off and not clickable, e.g. when the data behind it is missing */
  disabled?: boolean;
}

/** On/off switch with a label. */
export function Toggle({ label, hint, checked, onChange, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked && !disabled}
      disabled={disabled}
      className="toggle"
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__text">
        <span className="toggle__label">{label}</span>
        {hint && <span className="toggle__hint">{hint}</span>}
      </span>
      <span className="toggle__track" aria-hidden="true">
        <span className="toggle__thumb" />
      </span>
    </button>
  );
}

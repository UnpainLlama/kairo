import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export type SelectOption<T extends string> = { value: T; label: string };

/**
 * Dropdown used by the search filters. A value of '' means "not set": the button then shows `label`
 * (or `placeholder` when given) instead of an option name.
 */
export default function Select<T extends string>({
  label, value, options, onChange, icon, placeholder,
}: { label: string; value: T; options: SelectOption<T>[]; onChange: (value: T) => void; icon?: ReactNode; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const selected = options.find((option) => option.value === value);
  const shown = value === '' ? placeholder ?? label : selected?.label ?? value;

  return (
    <div className={`kc-select${open ? ' open' : ''}${value !== '' ? ' set' : ''}`} ref={root}>
      <button type="button" className="kc-select-btn" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-label={`${label}: ${shown}`} onClick={() => setOpen((v) => !v)}>
        {icon}<span>{shown}</span><ChevronDown size={15} aria-hidden="true" className="kc-select-caret" />
      </button>
      {open && (
        <ul className="kc-select-menu" id={listId} role="listbox" aria-label={label}>
          {options.map((option) => (
            <li key={option.value} role="option" aria-selected={option.value === value}>
              <button type="button" className={option.value === value ? 'active' : ''} onClick={() => { onChange(option.value); setOpen(false); }}>
                <span>{option.label}</span>{option.value === value && <Check size={14} aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

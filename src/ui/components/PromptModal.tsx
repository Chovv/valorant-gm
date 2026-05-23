import { useState, useEffect, useRef } from 'react';
import './PromptModal.css';

interface ConfirmModalProps {
  kind: 'confirm';
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

interface TextPromptModalProps {
  kind: 'prompt';
  title: string;
  label?: string;
  defaultValue?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export type ModalConfig = ConfirmModalProps | TextPromptModalProps;

export function AppModal(props: ModalConfig) {
  if (props.kind === 'confirm') return <ConfirmModal {...props} />;
  return <PromptModal {...props} />;
}

function ConfirmModal({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <div className="prompt-overlay" onClick={onCancel}>
      <div className="prompt-modal" onClick={e => e.stopPropagation()}>
        <div className="prompt-title">{title}</div>
        <div className="prompt-message">{message}</div>
        <div className="prompt-actions">
          <button className={`prompt-btn ${danger ? 'prompt-btn-danger' : 'prompt-btn-confirm'}`} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
          <button className="prompt-btn prompt-btn-cancel" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function PromptModal({ title, label, defaultValue = '', onConfirm, onCancel }: TextPromptModalProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.select(); }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onConfirm(value);
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className="prompt-overlay" onClick={onCancel}>
      <div className="prompt-modal" onClick={e => e.stopPropagation()}>
        <div className="prompt-title">{title}</div>
        {label && <div className="prompt-message">{label}</div>}
        <input
          ref={inputRef}
          className="prompt-input"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <div className="prompt-actions">
          <button className="prompt-btn prompt-btn-confirm" onClick={() => onConfirm(value)}>OK</button>
          <button className="prompt-btn prompt-btn-cancel" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

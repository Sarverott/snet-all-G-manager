import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { ConfirmationModalState } from '../types';

interface ConfirmationModalProps {
  config: ConfirmationModalState | null;
  onClose: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ config, onClose }) => {
  if (!config || !config.isOpen) return null;

  const handleConfirm = async () => {
    await config.onConfirm();
    onClose();
  };

  return (
    <div
      id="confirmation-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
    >
      <div
        id="confirmation-modal-container"
        className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg ${
                config.isDestructive ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-slate-800 text-lg">{config.title}</h3>
          </div>
          <button
            id="close-confirmation-modal-btn"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 text-sm text-slate-600 leading-relaxed">
          {config.message}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
          <button
            id="cancel-confirmation-btn"
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
          >
            Cancel
          </button>
          <button
            id="proceed-confirmation-btn"
            type="button"
            onClick={handleConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors shadow-xs ${
              config.isDestructive
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {config.confirmLabel || 'Confirm Action'}
          </button>
        </div>
      </div>
    </div>
  );
};

"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type ModalVariant = "info" | "success" | "error" | "warning";

export interface ModalOptions {
  title?: string;
  message: string;
  type?: ModalVariant;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  isConfirmDialog?: boolean;
}

interface ModalContextValue {
  showModal: (options: ModalOptions) => void;
  hideModal: () => void;
}

const ModalContext = createContext<ModalContextValue | undefined>(undefined);

const variantStyles: Record<ModalVariant, string> = {
  info: "bg-blue-600 hover:bg-blue-700",
  success: "bg-green-600 hover:bg-green-700",
  error: "bg-red-600 hover:bg-red-700",
  warning: "bg-yellow-500 hover:bg-yellow-600",
};

export function ModalProvider({ children }: { children: ReactNode }) {
  const [modalState, setModalState] = useState<(ModalOptions & { isOpen: boolean }) | null>(null);

  const hideModal = useCallback(() => {
    setModalState((prev) => (prev ? { ...prev, isOpen: false } : null));
  }, []);

  const showModal = useCallback((options: ModalOptions) => {
    setModalState({
      title: options.title,
      message: options.message,
      type: options.type ?? "info",
      confirmText: options.confirmText ?? (options.isConfirmDialog ? "Да" : "Понятно"),
      cancelText: options.cancelText ?? "Отмена",
      onConfirm: options.onConfirm,
      onCancel: options.onCancel,
      isConfirmDialog: options.isConfirmDialog ?? false,
      isOpen: true,
    });
  }, []);

  const handleConfirm = () => {
    if (modalState?.onConfirm) {
      try {
        modalState.onConfirm();
      } catch (error) {
        console.error("Modal onConfirm handler failed:", error);
      }
    }
    hideModal();
  };

  const handleCancel = () => {
    if (modalState?.onCancel) {
      try {
        modalState.onCancel();
      } catch (error) {
        console.error("Modal onCancel handler failed:", error);
      }
    }
    hideModal();
  };

  const contextValue = useMemo(
    () => ({
      showModal,
      hideModal,
    }),
    [showModal, hideModal]
  );

  const variantClass = modalState ? variantStyles[modalState.type ?? "info"] : variantStyles.info;

  return (
    <ModalContext.Provider value={contextValue}>
      {children}

      {modalState?.isOpen && (
        <div
          className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl text-center border border-gray-200">
            {modalState.title && (
              <h3 className="mb-3 text-lg font-semibold text-gray-900">{modalState.title}</h3>
            )}
            <p className="text-gray-800 whitespace-pre-line">{modalState.message}</p>

            {modalState.isConfirmDialog ? (
              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleCancel}
                  className="flex-1 rounded-xl px-4 py-3 text-gray-700 font-semibold transition-colors bg-gray-200 hover:bg-gray-300"
                >
                  {modalState.cancelText}
                </button>
                <button
                  onClick={handleConfirm}
                  className={`flex-1 rounded-xl px-4 py-3 text-white font-semibold transition-colors ${variantClass}`}
                >
                  {modalState.confirmText}
                </button>
              </div>
            ) : (
              <button
                onClick={handleConfirm}
                className={`mt-6 w-full rounded-xl px-4 py-3 text-white font-semibold transition-colors ${variantClass}`}
              >
                {modalState.confirmText}
              </button>
            )}
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModal must be used within ModalProvider");
  }
  return context;
}


import React, { ReactNode } from 'react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    footer?: ReactNode;
}

export default function Modal({ isOpen, onClose, title, children, footer }: ModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-lg shadow-xl max-w-sm w-full border border-[#e6e2d3] overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="px-4 py-3 border-b border-[#e6e2d3] flex justify-between items-center bg-[#fdfbf7]">
                    <h3 className="font-bold text-[#4a4036]">{title}</h3>
                    <button onClick={onClose} className="text-[#8c7b6c] hover:text-[#4a4036]">
                        ✕
                    </button>
                </div>
                <div className="p-4">
                    {children}
                </div>
                {footer && (
                    <div className="px-4 py-3 bg-[#fdfbf7] border-t border-[#e6e2d3] flex justify-end gap-2">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}

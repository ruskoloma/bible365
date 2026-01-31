'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import planDataRaw from '@/data/plan.json';
import booksDataRaw from '@/data/books.json';
import { PlanData, BookMap, ReadingItem } from '@/types';
import Modal from './Modal';

// Cast imports to types
const planData = planDataRaw as unknown as PlanData;
const booksData = booksDataRaw as unknown as BookMap;

// Helper to calculate days between dates
const getDaysDiff = (start: Date, end: Date) => {
    const oneDay = 24 * 60 * 60 * 1000;
    // Reset times to midnight to ensure accurate day calculation
    const s = new Date(start); s.setHours(0, 0, 0, 0);
    const e = new Date(end); e.setHours(0, 0, 0, 0);
    return Math.round((e.getTime() - s.getTime()) / oneDay);
};

// Helper to parse "YYYY-MM-DD" as local date
const parseLocalDate = (dateStr: string) => {
    if (!dateStr) return new Date();
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
};

export default function BibleTracker() {
    const [isClient, setIsClient] = useState(false);
    const [startDate, setStartDate] = useState<string | null>(null);
    const [completedItems, setCompletedItems] = useState<Set<string>>(new Set());
    const [language, setLanguage] = useState<'en' | 'ru'>('en');

    // View State (Navigate by Date)
    const [viewDate, setViewDate] = useState<Date>(new Date());
    const [menuOpen, setMenuOpen] = useState(false);

    // Modals
    const [showResetModal, setShowResetModal] = useState(false);
    const [showMarkUpToModal, setShowMarkUpToModal] = useState(false);
    const [markUpToDate, setMarkUpToDate] = useState('');
    const [scrollToDay, setScrollToDay] = useState<number | null>(null);

    const todayRef = useRef<HTMLDivElement>(null);
    const [setupDate, setSetupDate] = useState<string>('');

    // Initialize from LocalStorage
    useEffect(() => {
        setIsClient(true);
        const storedStart = localStorage.getItem('bible_startDate');
        const storedCompleted = localStorage.getItem('bible_completed');
        const storedLang = localStorage.getItem('bible_lang');

        if (storedStart) {
            setStartDate(storedStart);
        }
        if (storedCompleted) setCompletedItems(new Set(JSON.parse(storedCompleted)));
        if (storedLang) setLanguage(storedLang as 'en' | 'ru');
    }, []);

    // Scroll to today on initial load (when refs are ready)
    useEffect(() => {
        if (startDate && todayRef.current && scrollToDay === null) {
            // Slight delay to ensure layout is settled
            setTimeout(() => {
                todayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
    }, [startDate, viewDate, scrollToDay]); // Dependency on viewDate mainly if user navigates back to current month

    // Handle explicit scroll to day
    useEffect(() => {
        if (scrollToDay !== null) {
            setTimeout(() => {
                const el = document.getElementById(`day-${scrollToDay}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setScrollToDay(null);
                }
            }, 300);
        }
    }, [scrollToDay, viewDate]);

    // Save to LocalStorage
    useEffect(() => {
        if (!isClient) return;
        if (startDate) localStorage.setItem('bible_startDate', startDate);
        localStorage.setItem('bible_completed', JSON.stringify(Array.from(completedItems)));
        localStorage.setItem('bible_lang', language);
    }, [startDate, completedItems, language, isClient]);

    // Derived Logic
    const today = useMemo(() => new Date(), []);

    // Calculate current progress (first incomplete day)
    const currentProgressDay = useMemo(() => {
        for (const dayPlan of planData.plan) {
            const allCompleted = dayPlan.readings.every((_, idx) =>
                completedItems.has(`${dayPlan.day}-${idx}`)
            );
            if (!allCompleted) return dayPlan.day;
        }
        return planData.plan.length; // All done
    }, [completedItems]);

    // Calculate "target day" relative to start date
    const targetDay = useMemo(() => {
        if (!startDate) return 1;
        const diff = getDaysDiff(parseLocalDate(startDate), today);
        return Math.max(1, diff + 1);
    }, [startDate, today]);

    const daysBehind = targetDay - currentProgressDay;

    const handleToggleItem = (day: number, idx: number) => {
        const key = `${day}-${idx}`;
        const newSet = new Set(completedItems);
        if (newSet.has(key)) {
            newSet.delete(key);
        } else {
            newSet.add(key);
        }
        setCompletedItems(newSet);
    };

    const handleMarkDay = (day: number, readingsCount: number) => {
        const newSet = new Set(completedItems);
        // Check if all are currently done
        let allDone = true;
        for (let i = 0; i < readingsCount; i++) {
            if (!newSet.has(`${day}-${i}`)) {
                allDone = false;
                break;
            }
        }

        if (allDone) {
            // Uncheck all
            for (let i = 0; i < readingsCount; i++) {
                newSet.delete(`${day}-${i}`);
            }
        } else {
            // Check all
            for (let i = 0; i < readingsCount; i++) {
                newSet.add(`${day}-${i}`);
            }
        }
        setCompletedItems(newSet);
    };

    const executeMarkUpTo = () => {
        if (!startDate || !markUpToDate) return;

        const targetDate = parseLocalDate(markUpToDate);
        const diff = getDaysDiff(parseLocalDate(startDate), targetDate);

        const limitDay = diff + 1;
        if (limitDay < 1) return;

        const newSet = new Set(completedItems);
        planData.plan.forEach(p => {
            if (p.day <= limitDay) {
                p.readings.forEach((_, idx) => {
                    newSet.add(`${p.day}-${idx}`);
                });
            }
        });
        setCompletedItems(newSet);
        setShowMarkUpToModal(false);

        // Switch view to that month and scroll
        setViewDate(targetDate);
        setScrollToDay(limitDay);
    };

    const confirmReset = () => {
        localStorage.clear();
        window.location.reload();
    };

    const handleSetup = (date: string, lang: 'en' | 'ru') => {
        setStartDate(date);
        setLanguage(lang);
    };

    // Generate days for the viewDate month
    const daysInView = useMemo(() => {
        if (!startDate) return [];

        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const daysList = [];
        const start = parseLocalDate(startDate);
        start.setHours(0, 0, 0, 0);

        const todayTime = new Date().setHours(0, 0, 0, 0);

        for (let d = 1; d <= daysInMonth; d++) {
            const current = new Date(year, month, d);
            const diff = getDaysDiff(start, current);

            let normalized = diff % 365;
            if (normalized < 0) normalized += 365;
            const planDay = normalized + 1;

            const plan = planData.plan.find(p => p.day === planDay);

            // Check if fully completed
            let isDayComplete = false;
            if (plan) {
                isDayComplete = plan.readings.every((_, idx) => completedItems.has(`${planDay}-${idx}`));
            }

            const isToday = current.getTime() === todayTime;

            daysList.push({
                date: current,
                planDay,
                plan,
                isDayComplete,
                isToday
            });
        }
        return daysList;
    }, [viewDate, startDate, completedItems]);

    // Format Reference
    const formatRef = (reading: ReadingItem) => {
        const book = booksData[reading.book_number];
        const bookName = language === 'ru' ? book?.long_ru || book?.short_ru : book?.long_en || book?.short_en;

        let ref = `${bookName} ${reading.start_chapter}`;
        if (reading.start_verse) ref += `:${reading.start_verse}`;

        if (reading.end_chapter !== reading.start_chapter) {
            ref += `-${reading.end_chapter}`;
            if (reading.end_verse) ref += `:${reading.end_verse}`;
        } else if (reading.end_verse) {
            ref += `-${reading.end_verse}`;
        }
        return ref;
    };

    if (!isClient) return <div className="p-8 text-center">Loading...</div>;



    if (!startDate) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-6 max-w-md mx-auto fade-in">
                <h1 className="text-4xl mb-2 text-[#4a4036] font-serif">Bible Tracker</h1>
                <p className="mb-8 text-[#8c7b6c] italic">Begin your journey through the Word.</p>

                <div className="w-full bg-white p-6 rounded shadow-sm border border-[#e6e2d3]">
                    <label className="block mb-2 font-bold text-[#4a4036]">Select Language / Язык</label>
                    <div className="flex gap-4 mb-6">
                        <button
                            onClick={() => setLanguage('en')}
                            className={`flex-1 py-2 px-4 rounded border ${language === 'en' ? 'bg-[#4a4036] text-white border-[#4a4036]' : 'text-[#4a4036] border-[#e6e2d3]'}`}
                        >
                            English
                        </button>
                        <button
                            onClick={() => setLanguage('ru')}
                            className={`flex-1 py-2 px-4 rounded border ${language === 'ru' ? 'bg-[#4a4036] text-white border-[#4a4036]' : 'text-[#4a4036] border-[#e6e2d3]'}`}
                        >
                            Русский
                        </button>
                    </div>

                    <label className="block mb-2 font-bold text-[#4a4036]">{language === 'en' ? 'Start Date' : 'Дата начала'}</label>
                    <input
                        type="date"
                        className="w-full p-2 border border-[#e6e2d3] rounded mb-6 font-serif text-[#4a4036]"
                        value={setupDate}
                        onChange={(e) => setSetupDate(e.target.value)}
                    />

                    <button
                        disabled={!setupDate}
                        onClick={() => setupDate && setStartDate(setupDate)}
                        className={`w-full py-3 rounded font-bold transition-all ${setupDate ? 'bg-[#8c7b6c] text-white hover:bg-[#7b6b5d]' : 'bg-[#e6e2d3] text-[#8c7b6c] cursor-not-allowed'}`}
                    >
                        {language === 'en' ? 'Start Reading' : 'Начать чтение'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-4 pb-20 max-w-2xl mx-auto font-serif" onClick={() => menuOpen && setMenuOpen(false)}>
            {/* Header */}
            <header className="sticky top-0 bg-[#fdfbf7]/95 backdrop-blur z-10 border-b border-[#e6e2d3] pb-4 mb-6">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h1 className="text-xl font-bold text-[#4a4036]">
                            {language === 'en' ? 'My Reading Plan' : 'Мой план чтения'}
                        </h1>
                        <p className="text-[#8c7b6c] text-xs">
                            {daysBehind > 0
                                ? (language === 'en' ? `${daysBehind} days behind` : `${daysBehind} дн. отставания`)
                                : (language === 'en' ? 'On track' : 'В графике')}
                        </p>
                    </div>
                    <div className="relative">
                        <button
                            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
                            className="p-2 -mr-2 text-[#8c7b6c] hover:bg-[#f6f2e9] rounded-full"
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="1" />
                                <circle cx="12" cy="5" r="1" />
                                <circle cx="12" cy="19" r="1" />
                            </svg>
                        </button>
                        {menuOpen && (
                            <div className="absolute right-0 top-10 w-48 bg-white border border-[#e6e2d3] shadow-lg rounded z-20 overflow-hidden">
                                <button
                                    onClick={() => { setLanguage(l => l === 'en' ? 'ru' : 'en'); setMenuOpen(false); }}
                                    className="w-full text-left px-4 py-3 hover:bg-[#f6f2e9] text-sm text-[#4a4036]"
                                >
                                    {language === 'en' ? 'Switch to Russian' : 'RU / EN'}
                                </button>
                                <button
                                    onClick={() => { setShowMarkUpToModal(true); setMenuOpen(false); }}
                                    className="w-full text-left px-4 py-3 hover:bg-[#f6f2e9] text-sm text-[#4a4036]"
                                >
                                    {language === 'en' ? 'Mark done up to...' : 'Отметить до...'}
                                </button>
                                <button
                                    onClick={() => { setShowResetModal(true); setMenuOpen(false); }}
                                    className="w-full text-left px-4 py-3 hover:bg-red-50 text-sm text-red-700 border-t border-[#e6e2d3]"
                                >
                                    {language === 'en' ? 'Reset Progress' : 'Сброс'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-between items-center bg-white p-2 rounded shadow-sm border border-[#e6e2d3]">
                    <button
                        onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                        className="px-3 py-1 text-[#4a4036] hover:bg-[#f6f2e9] rounded"
                    >
                        ←
                    </button>
                    <span className="font-bold text-lg text-[#4a4036] capitalize">
                        {viewDate.toLocaleDateString(language, { month: 'long', year: 'numeric' })}
                    </span>
                    <button
                        onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                        className="px-3 py-1 text-[#4a4036] hover:bg-[#f6f2e9] rounded"
                    >
                        →
                    </button>
                </div>
            </header>

            {/* Monthly List */}
            <div className="space-y-8">
                {daysInView.map((item, dayIdx) => (
                    <div
                        key={dayIdx}
                        id={`day-${item.planDay}`}
                        ref={item.isToday ? todayRef : null}
                        className={`relative pl-4 border-l-2 transition-all duration-500 ${item.isDayComplete ? 'border-[#8c7b6c]/30 opacity-60' : 'border-[#e6e2d3]'}`}
                    >
                        {/* Day Header */}
                        <div
                            className="flex items-center gap-3 mb-3 cursor-pointer select-none group"
                            onClick={() => item.plan && handleMarkDay(item.planDay, item.plan.readings.length)}
                        >
                            <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-4 border-[#fdfbf7] transition-colors ${item.isDayComplete ? 'bg-[#8c7b6c]/50' : 'bg-[#8c7b6c]'} ${item.isToday ? 'ring-2 ring-offset-1 ring-[#d4a373]' : ''}`}></div>
                            <h3 className={`font-bold transition-colors ${item.isDayComplete ? 'text-[#4a4036]/70' : 'text-[#4a4036]'} group-hover:text-[#d4a373]`}>
                                {item.date.toLocaleDateString(language, { day: 'numeric', month: 'short', weekday: 'short' })}
                                {item.isToday && <span className="text-[#d4a373] text-xs ml-2 font-normal">({language === 'en' ? 'Today' : 'Сегодня'})</span>}
                            </h3>
                            <span className="text-xs text-[#8c7b6c] px-2 py-0.5 bg-[#e6e2d3]/50 rounded">
                                {language === 'en' ? `Day ${item.planDay}` : `День ${item.planDay}`}
                            </span>
                        </div>

                        {/* Readings */}
                        <div className="space-y-3">
                            {item.plan?.readings.map((reading, rIdx) => {
                                const isChecked = completedItems.has(`${item.planDay}-${rIdx}`);
                                return (
                                    <div
                                        key={rIdx}
                                        className={`paper-card p-3 flex items-center gap-3 cursor-pointer transition-all duration-200 hover:shadow-md ${isChecked ? 'bg-[#f4f1ea] opacity-60' : 'bg-white'}`}
                                        onClick={() => handleToggleItem(item.planDay, rIdx)}
                                    >
                                        <div className={`custom-checkbox shrink-0 ${isChecked ? 'checked' : ''}`}>
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                readOnly
                                                className="hidden"
                                            />
                                        </div>
                                        <div className={`text-base ${isChecked ? 'line-through text-[#8c7b6c]' : 'text-[#4a4036]'}`}>
                                            {formatRef(reading)}
                                        </div>
                                    </div>
                                );
                            })}
                            {!item.plan && (
                                <div className="text-xs text-[#8c7b6c] italic pl-2">
                                    {language === 'en' ? 'No reading.' : 'Нет чтения.'}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Modals */}
            <Modal
                isOpen={showResetModal}
                onClose={() => setShowResetModal(false)}
                title={language === 'en' ? 'Reset Progress?' : 'Сбросить прогресс?'}
                footer={
                    <>
                        <button onClick={() => setShowResetModal(false)} className="px-4 py-2 text-[#4a4036] hover:bg-[#f6f2e9] rounded">
                            {language === 'en' ? 'Cancel' : 'Отмена'}
                        </button>
                        <button onClick={confirmReset} className="px-4 py-2 bg-red-800 text-white rounded hover:bg-red-900">
                            {language === 'en' ? 'Reset' : 'Сбросить'}
                        </button>
                    </>
                }
            >
                <p className="text-[#4a4036]">
                    {language === 'en'
                        ? 'Are you sure you want to reset all your reading progress? This cannot be undone.'
                        : 'Вы уверены, что хотите сбросить весь прогресс чтения? Это действие нельзя отменить.'}
                </p>
            </Modal>

            <Modal
                isOpen={showMarkUpToModal}
                onClose={() => setShowMarkUpToModal(false)}
                title={language === 'en' ? 'Mark Done Up To Date' : 'Отметить до даты'}
                footer={
                    <>
                        <button onClick={() => setShowMarkUpToModal(false)} className="px-4 py-2 text-[#4a4036] hover:bg-[#f6f2e9] rounded">
                            {language === 'en' ? 'Cancel' : 'Отмена'}
                        </button>
                        <button onClick={executeMarkUpTo} className="px-4 py-2 bg-[#8c7b6c] text-white rounded hover:bg-[#7b6b5d]">
                            {language === 'en' ? 'Confirm' : 'Подтвердить'}
                        </button>
                    </>
                }
            >
                <div className="space-y-4">
                    <p className="text-sm text-[#8c7b6c]">
                        {language === 'en'
                            ? 'Select a date. All readings up to (and including) this date will be marked as complete.'
                            : 'Выберите дату. Все чтения до (включительно) этой даты будут отмечены как прочитанные.'}
                    </p>
                    <input
                        type="date"
                        value={markUpToDate}
                        onChange={(e) => setMarkUpToDate(e.target.value)}
                        className="w-full p-2 border border-[#e6e2d3] rounded font-serif text-[#4a4036]"
                    />
                </div>
            </Modal>
        </div>
    );
}

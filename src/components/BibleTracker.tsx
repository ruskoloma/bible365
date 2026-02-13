'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Image from 'next/image';
import planDataRaw from '@/data/plan.json';
import booksDataRaw from '@/data/books.json';
import { PlanData, BookMap, ReadingItem } from '@/types';
import Modal from './Modal';
import {
    initGoogleAuth,
    signInWithGoogle,
    signOut,
    getStoredUser,
    downloadProgress,
    uploadProgress,
    deleteProgress,
    type GoogleUser,
    type BibleTrackerData,
} from '@/lib/googleAuth';

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
    const [showResetModal, setShowResetModal] = useState(false); // Legacy - will be removed
    const [showResetProgressModal, setShowResetProgressModal] = useState(false);
    const [showDeletePlanModal, setShowDeletePlanModal] = useState(false);
    const [showMarkUpToModal, setShowMarkUpToModal] = useState(false);
    const [showChangeStartDayModal, setShowChangeStartDayModal] = useState(false);
    const [markUpToDate, setMarkUpToDate] = useState('');
    const [newStartDate, setNewStartDate] = useState('');
    const [scrollToDay, setScrollToDay] = useState<number | null>(null);

    const todayRef = useRef<HTMLDivElement>(null);
    const isLoadingFromDrive = useRef(false); // Track when loading from Drive to prevent auto-sync loops
    const hasInitializedCloudState = useRef(false);
    const latestSyncedAt = useRef<string | null>(null);
    const [setupDate, setSetupDate] = useState<string>('');

    // Google Auth State
    const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
    const [isGoogleReady, setIsGoogleReady] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [showGoogleConnectModal, setShowGoogleConnectModal] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);

    // Initialize from LocalStorage
    useEffect(() => {
        setIsClient(true);

        // Always load from localStorage first
        const storedStart = localStorage.getItem('bible_startDate');
        const storedCompleted = localStorage.getItem('bible_completed');
        const storedLang = localStorage.getItem('bible_lang');

        if (storedStart) {
            setStartDate(storedStart);
        }
        if (storedCompleted) setCompletedItems(new Set(JSON.parse(storedCompleted)));
        if (storedLang) setLanguage(storedLang as 'en' | 'ru');

        // Initialize Google Auth
        initGoogleAuth()
            .then(() => {
                setIsGoogleReady(true);
                // Check if user was previously signed in
                const user = getStoredUser();
                if (user) {
                    setGoogleUser(user);
                }
            })
            .catch((err) => {
                console.error('Failed to initialize Google Auth:', err);
            });
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

    // Save to LocalStorage (always save as primary storage)
    useEffect(() => {
        if (!isClient) return;
        if (startDate) localStorage.setItem('bible_startDate', startDate);
        localStorage.setItem('bible_completed', JSON.stringify(Array.from(completedItems)));
        localStorage.setItem('bible_lang', language);
    }, [startDate, completedItems, language, isClient]);

    // Derived Logic
    const today = useMemo(() => new Date(), []);

    // Last fully completed plan day (contiguous from day 1)
    const lastFullyCompletedDay = useMemo(() => {
        let last = 0;
        for (const dayPlan of planData.plan) {
            const allCompleted = dayPlan.readings.every((_, idx) =>
                completedItems.has(`${dayPlan.day}-${idx}`)
            );
            if (!allCompleted) break;
            last = dayPlan.day;
        }
        return last;
    }, [completedItems]);

    // Calculate "target day" relative to start date
    const targetDay = useMemo(() => {
        if (!startDate) return 1;
        const diff = getDaysDiff(parseLocalDate(startDate), today);
        return Math.max(1, diff + 1);
    }, [startDate, today]);

    const expectedCompletedDay = Math.min(planData.plan.length, Math.max(0, targetDay - 1));
    const daysBehind = Math.max(0, expectedCompletedDay - lastFullyCompletedDay);

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

    const confirmResetProgress = () => {
        // Clear only completed items, keep startDate and Google connection
        setCompletedItems(new Set());
        setShowResetProgressModal(false);
        // Sync to Google Drive if connected
        if (googleUser) {
            void syncToDrive({
                completed: [],
            });
        }
    };

    const confirmDeletePlan = async () => {
        try {
            // Delete from Google Drive if connected
            if (googleUser) {
                await deleteProgress();
                signOut();
                setGoogleUser(null);
            }
            // Clear all local data
            localStorage.clear();
            // Redirect to start page
            window.location.reload();
        } catch (error) {
            console.error('Failed to delete plan:', error);
        }
    };

    const executeChangeStartDay = () => {
        if (newStartDate) {
            setStartDate(newStartDate);
            setShowChangeStartDayModal(false);
            setNewStartDate('');
            // Sync to Google Drive if connected
            if (googleUser) {
                void syncToDrive({
                    startDate: newStartDate,
                });
            }
        }
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

    // Google Drive Sync Functions
    const syncToDrive = useCallback(async (overrides?: Partial<BibleTrackerData>) => {
        if (!googleUser) return;

        setIsSyncing(true);
        setSyncError(null);

        try {
            const timestamp = new Date().toISOString();
            const data: BibleTrackerData = {
                startDate: overrides?.startDate ?? startDate,
                completed: overrides?.completed ?? Array.from(completedItems),
                language: overrides?.language ?? language,
                lastSynced: overrides?.lastSynced ?? timestamp,
            };
            await uploadProgress(data);
            latestSyncedAt.current = data.lastSynced;
            hasInitializedCloudState.current = true;
        } catch (error) {
            console.error('Sync to Drive failed:', error);
            setSyncError(language === 'en' ? 'Failed to sync to Google Drive' : 'Ошибка синхронизации с Google Drive');
        } finally {
            setIsSyncing(false);
        }
    }, [googleUser, startDate, completedItems, language]);

    const syncFromDrive = useCallback(async (isBackground = false) => {
        if (!googleUser) return;

        isLoadingFromDrive.current = true; // Mark that we're loading from Drive
        if (!isBackground) {
            setIsSyncing(true);
            setSyncError(null);
        }

        try {
            const data = await downloadProgress();
            if (data) {
                if (data.lastSynced && latestSyncedAt.current && data.lastSynced <= latestSyncedAt.current) {
                    return;
                }
                setStartDate(data.startDate);
                setCompletedItems(new Set(data.completed));
                setLanguage(data.language);
                latestSyncedAt.current = data.lastSynced || null;
            } else if (!startDate) {
                const todayIso = new Date().toISOString().split('T')[0];
                setStartDate(todayIso);
            }
        } catch (error) {
            console.error('Sync from Drive failed:', error);
            if (!isBackground) {
                setSyncError(language === 'en' ? 'Failed to load from Google Drive' : 'Ошибка загрузки из Google Drive');
            }
        } finally {
            hasInitializedCloudState.current = true;
            if (!isBackground) {
                setIsSyncing(false);
            }
            // Reset the flag after a short delay to allow state updates to complete
            setTimeout(() => {
                isLoadingFromDrive.current = false;
            }, 100);
        }
    }, [googleUser, startDate, language]);

    const handleGoogleSignIn = async () => {
        try {
            setIsSyncing(true);
            const user = await signInWithGoogle();
            setGoogleUser(user);

            // Try to download existing progress from Drive
            const driveData = await downloadProgress();

            if (driveData && driveData.startDate) {
                // Ask user if they want to use cloud data or keep local
                if (startDate) {
                    const useCloud = window.confirm(
                        language === 'en'
                            ? 'Found existing progress in Google Drive. Do you want to use it? (Cancel to keep local progress)'
                            : 'Найден прогресс в Google Drive. Использовать его? (Отмена - сохранить локальный прогресс)'
                    );
                    if (useCloud) {
                        setStartDate(driveData.startDate);
                        setCompletedItems(new Set(driveData.completed));
                        setLanguage(driveData.language);
                    } else {
                        // Upload local progress to Drive
                        await syncToDrive({
                            startDate,
                            completed: Array.from(completedItems),
                            language,
                        });
                    }
                } else {
                    // No local data, use cloud data
                    setStartDate(driveData.startDate);
                    setCompletedItems(new Set(driveData.completed));
                    setLanguage(driveData.language);
                    latestSyncedAt.current = driveData.lastSynced || null;
                }
            } else {
                // No cloud data - if no local startDate, set to today
                const startDateForUpload = startDate || new Date().toISOString().split('T')[0];
                if (!startDate) setStartDate(startDateForUpload);
                // Upload current state to Drive
                await syncToDrive({
                    startDate: startDateForUpload,
                    completed: Array.from(completedItems),
                    language,
                });
            }

            // Clear localStorage since we're now using Google Drive as the source of truth
            localStorage.removeItem('bible_startDate');
            localStorage.removeItem('bible_completed');
            localStorage.removeItem('bible_lang');

            hasInitializedCloudState.current = true;
            setShowGoogleConnectModal(false);
        } catch (error) {
            console.error('Google Sign-In failed:', error);
            setSyncError(language === 'en' ? 'Failed to sign in with Google' : 'Ошибка входа через Google');
        } finally {
            setIsSyncing(false);
        }
    };

    const handleGoogleSignOut = async () => {
        try {
            // Sync current progress to Drive before signing out
            if (googleUser) {
                await syncToDrive();
            }
            // Sign out from Google
            signOut();
            setGoogleUser(null);
            // Clear local data and redirect to start page
            localStorage.clear();
            window.location.reload();
        } catch (error) {
            console.error('Failed to sign out:', error);
        }
    };

    // Load latest cloud state on startup when an existing Google session is detected.
    useEffect(() => {
        if (!googleUser || !isClient || hasInitializedCloudState.current) return;
        syncFromDrive();
    }, [googleUser, isClient, syncFromDrive]);

    // Auto-sync to Drive when data changes (debounced)
    useEffect(() => {
        if (!googleUser || !isClient || isLoadingFromDrive.current || !hasInitializedCloudState.current) return;

        const timeoutId = setTimeout(() => {
            syncToDrive();
        }, 2000); // Debounce for 2 seconds

        return () => clearTimeout(timeoutId);
    }, [startDate, completedItems, language, googleUser, isClient, syncToDrive]);

    // Pull updates from Drive periodically to pick up progress made on other devices.
    useEffect(() => {
        if (!googleUser || !isClient || !hasInitializedCloudState.current) return;

        const intervalId = setInterval(() => {
            if (!isLoadingFromDrive.current) {
                syncFromDrive(true);
            }
        }, 15000);

        return () => clearInterval(intervalId);
    }, [googleUser, isClient, syncFromDrive]);



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
                <h1 className="text-4xl mb-2 text-[#4a4036] font-serif">Bible365</h1>
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
                        className={`w-full py-3 rounded font-bold transition-all mb-3 ${setupDate ? 'bg-[#8c7b6c] text-white hover:bg-[#7b6b5d]' : 'bg-[#e6e2d3] text-[#8c7b6c] cursor-not-allowed'}`}
                    >
                        {language === 'en' ? 'Start Reading (Local Only)' : 'Начать чтение (Только локально)'}
                    </button>

                    {isGoogleReady && (
                        <>
                            <div className="relative my-4">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-[#e6e2d3]"></div>
                                </div>
                                <div className="relative flex justify-center text-sm">
                                    <span className="px-2 bg-white text-[#8c7b6c]">
                                        {language === 'en' ? 'or' : 'или'}
                                    </span>
                                </div>
                            </div>

                            <button
                                disabled={isSyncing}
                                onClick={async () => {
                                    if (setupDate) {
                                        setStartDate(setupDate);
                                    }
                                    await handleGoogleSignIn();
                                }}
                                className={`w-full py-3 rounded font-bold transition-all flex items-center justify-center gap-2 ${isSyncing ? 'bg-[#f6f2e9] text-[#8c7b6c] cursor-not-allowed border-2 border-[#e6e2d3]' : 'bg-white text-[#4a4036] border-2 border-[#e6e2d3] hover:border-[#8c7b6c]'}`}
                            >
                                {isSyncing ? (
                                    <>
                                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        {language === 'en' ? 'Signing in...' : 'Вход...'}
                                    </>
                                ) : (
                                    <>
                                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4" />
                                            <path d="M9.003 18c2.43 0 4.467-.806 5.956-2.18L12.05 13.56c-.806.54-1.837.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9.003 18z" fill="#34A853" />
                                            <path d="M3.964 10.712c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.96H.957C.347 6.175 0 7.55 0 9.002c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
                                            <path d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.426 0 9.003 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29c.708-2.127 2.692-3.71 5.036-3.71z" fill="#EA4335" />
                                        </svg>
                                        {language === 'en' ? 'Start with Google Drive' : 'Начать с Google Drive'}
                                    </>
                                )}
                            </button>

                            <p className="text-xs text-[#8c7b6c] mt-3 text-center">
                                {language === 'en'
                                    ? 'Google Drive keeps your progress synced across devices'
                                    : 'Google Drive синхронизирует прогресс между устройствами'}
                            </p>
                        </>
                    )}

                    {syncError && (
                        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                            {syncError}
                        </div>
                    )}
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
                                {googleUser ? (
                                    <>
                                        <div className="px-4 py-3 border-b border-[#e6e2d3] bg-[#f6f2e9]">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Image
                                                    src={googleUser.picture}
                                                    alt=""
                                                    width={24}
                                                    height={24}
                                                    className="w-6 h-6 rounded-full"
                                                />
                                                <span className="text-xs font-bold text-[#4a4036] truncate">{googleUser.name}</span>
                                            </div>
                                            <div className="text-xs text-[#8c7b6c] flex items-center gap-1">
                                                {isSyncing ? (
                                                    <>
                                                        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                        {language === 'en' ? 'Syncing...' : 'Синхронизация...'}
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg className="h-3 w-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                        </svg>
                                                        {language === 'en' ? 'Synced' : 'Синхронизировано'}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => { syncFromDrive(); setMenuOpen(false); }}
                                            className="w-full text-left px-4 py-3 hover:bg-[#f6f2e9] text-sm text-[#4a4036] flex items-center gap-2"
                                        >
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                            </svg>
                                            {language === 'en' ? 'Sync from Drive' : 'Загрузить из Drive'}
                                        </button>
                                        <button
                                            onClick={() => { handleGoogleSignOut(); setMenuOpen(false); }}
                                            className="w-full text-left px-4 py-3 hover:bg-[#f6f2e9] text-sm text-[#4a4036] border-b border-[#e6e2d3]"
                                        >
                                            {language === 'en' ? 'Sign out from Google' : 'Выйти из Google'}
                                        </button>
                                    </>
                                ) : isGoogleReady && (
                                    <button
                                        onClick={() => { setShowGoogleConnectModal(true); setMenuOpen(false); }}
                                        className="w-full text-left px-4 py-3 hover:bg-[#f6f2e9] text-sm text-[#4a4036] border-b border-[#e6e2d3] flex items-center gap-2"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4" />
                                            <path d="M9.003 18c2.43 0 4.467-.806 5.956-2.18L12.05 13.56c-.806.54-1.837.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9.003 18z" fill="#34A853" />
                                            <path d="M3.964 10.712c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.96H.957C.347 6.175 0 7.55 0 9.002c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
                                            <path d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.426 0 9.003 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29c.708-2.127 2.692-3.71 5.036-3.71z" fill="#EA4335" />
                                        </svg>
                                        {language === 'en' ? 'Connect Google Drive' : 'Подключить Google Drive'}
                                    </button>
                                )}
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
                                    onClick={() => { setShowChangeStartDayModal(true); setMenuOpen(false); }}
                                    className="w-full text-left px-4 py-3 hover:bg-[#f6f2e9] text-sm text-[#4a4036]"
                                >
                                    {language === 'en' ? 'Change Start Day' : 'Изменить дату начала'}
                                </button>
                                <button
                                    onClick={() => { setShowResetProgressModal(true); setMenuOpen(false); }}
                                    className="w-full text-left px-4 py-3 hover:bg-orange-50 text-sm text-orange-700 border-t border-[#e6e2d3]"
                                >
                                    {language === 'en' ? 'Reset Progress' : 'Сбросить прогресс'}
                                </button>
                                <button
                                    onClick={() => { setShowDeletePlanModal(true); setMenuOpen(false); }}
                                    className="w-full text-left px-4 py-3 hover:bg-red-50 text-sm text-red-700"
                                >
                                    {language === 'en' ? 'Delete Plan' : 'Удалить план'}
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

            <Modal
                isOpen={showGoogleConnectModal}
                onClose={() => setShowGoogleConnectModal(false)}
                title={language === 'en' ? 'Connect Google Drive' : 'Подключить Google Drive'}
                footer={
                    <>
                        <button onClick={() => setShowGoogleConnectModal(false)} className="px-4 py-2 text-[#4a4036] hover:bg-[#f6f2e9] rounded">
                            {language === 'en' ? 'Cancel' : 'Отмена'}
                        </button>
                        <button
                            onClick={handleGoogleSignIn}
                            className="px-4 py-2 bg-[#8c7b6c] text-white rounded hover:bg-[#7b6b5d] flex items-center gap-2"
                        >
                            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4" />
                                <path d="M9.003 18c2.43 0 4.467-.806 5.956-2.18L12.05 13.56c-.806.54-1.837.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9.003 18z" fill="#34A853" />
                                <path d="M3.964 10.712c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.96H.957C.347 6.175 0 7.55 0 9.002c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
                                <path d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.426 0 9.003 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29c.708-2.127 2.692-3.71 5.036-3.71z" fill="#EA4335" />
                            </svg>
                            {language === 'en' ? 'Connect' : 'Подключить'}
                        </button>
                    </>
                }
            >
                <div className="space-y-4">
                    <p className="text-[#4a4036]">
                        {language === 'en'
                            ? 'Connect your Google account to automatically backup and sync your reading progress across all your devices.'
                            : 'Подключите Google аккаунт для автоматического резервного копирования и синхронизации прогресса чтения на всех устройствах.'}
                    </p>
                    <div className="bg-[#f6f2e9] p-3 rounded text-sm text-[#4a4036]">
                        <p className="font-bold mb-1">
                            {language === 'en' ? '✓ Benefits:' : '✓ Преимущества:'}
                        </p>
                        <ul className="list-disc list-inside space-y-1 text-[#8c7b6c]">
                            <li>{language === 'en' ? 'Automatic cloud backup' : 'Автоматическое облачное резервное копирование'}</li>
                            <li>{language === 'en' ? 'Sync across devices' : 'Синхронизация между устройствами'}</li>
                            <li>{language === 'en' ? 'Never lose your progress' : 'Никогда не потеряете прогресс'}</li>
                        </ul>
                    </div>
                    {syncError && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                            {syncError}
                        </div>
                    )}
                </div>
            </Modal>

            <Modal
                isOpen={showChangeStartDayModal}
                onClose={() => setShowChangeStartDayModal(false)}
                title={language === 'en' ? 'Change Start Day' : 'Изменить дату начала'}
                footer={
                    <>
                        <button onClick={() => setShowChangeStartDayModal(false)} className="px-4 py-2 text-[#4a4036] hover:bg-[#f6f2e9] rounded">
                            {language === 'en' ? 'Cancel' : 'Отмена'}
                        </button>
                        <button onClick={executeChangeStartDay} className="px-4 py-2 bg-[#8c7b6c] text-white rounded hover:bg-[#7b6b5d]">
                            {language === 'en' ? 'Confirm' : 'Подтвердить'}
                        </button>
                    </>
                }
            >
                <div className="space-y-4">
                    <p className="text-sm text-[#8c7b6c]">
                        {language === 'en'
                            ? 'Select a new start date for your reading plan. This will recalculate your progress.'
                            : 'Выберите новую дату начала плана чтения. Это пересчитает ваш прогресс.'}
                    </p>
                    <input
                        type="date"
                        value={newStartDate}
                        onChange={(e) => setNewStartDate(e.target.value)}
                        className="w-full p-2 border border-[#e6e2d3] rounded font-serif text-[#4a4036]"
                    />
                    {startDate && (
                        <p className="text-xs text-[#8c7b6c]">
                            {language === 'en' ? 'Current start date: ' : 'Текущая дата начала: '}
                            <span className="font-bold">{startDate}</span>
                        </p>
                    )}
                </div>
            </Modal>

            <Modal
                isOpen={showResetProgressModal}
                onClose={() => setShowResetProgressModal(false)}
                title={language === 'en' ? 'Reset Progress?' : 'Сбросить прогресс?'}
                footer={
                    <>
                        <button onClick={() => setShowResetProgressModal(false)} className="px-4 py-2 text-[#4a4036] hover:bg-[#f6f2e9] rounded">
                            {language === 'en' ? 'Cancel' : 'Отмена'}
                        </button>
                        <button onClick={confirmResetProgress} className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700">
                            {language === 'en' ? 'Reset Progress' : 'Сбросить'}
                        </button>
                    </>
                }
            >
                <p className="text-[#4a4036]">
                    {language === 'en'
                        ? 'This will clear all your reading progress (checkboxes), but keep your start date and Google Drive connection.'
                        : 'Это очистит весь прогресс чтения (галочки), но сохранит дату начала и подключение к Google Drive.'}
                </p>
            </Modal>

            <Modal
                isOpen={showDeletePlanModal}
                onClose={() => setShowDeletePlanModal(false)}
                title={language === 'en' ? 'Delete Plan?' : 'Удалить план?'}
                footer={
                    <>
                        <button onClick={() => setShowDeletePlanModal(false)} className="px-4 py-2 text-[#4a4036] hover:bg-[#f6f2e9] rounded">
                            {language === 'en' ? 'Cancel' : 'Отмена'}
                        </button>
                        <button onClick={confirmDeletePlan} className="px-4 py-2 bg-red-800 text-white rounded hover:bg-red-900">
                            {language === 'en' ? 'Delete Everything' : 'Удалить всё'}
                        </button>
                    </>
                }
            >
                <div className="space-y-3">
                    <p className="text-[#4a4036] font-bold">
                        {language === 'en'
                            ? '⚠️ This action cannot be undone!'
                            : '⚠️ Это действие нельзя отменить!'}
                    </p>
                    <p className="text-[#4a4036]">
                        {language === 'en'
                            ? 'This will:'
                            : 'Это действие:'}
                    </p>
                    <ul className="list-disc list-inside text-[#4a4036] space-y-1 ml-2">
                        <li>{language === 'en' ? 'Delete your progress from Google Drive' : 'Удалит прогресс из Google Drive'}</li>
                        <li>{language === 'en' ? 'Sign you out from Google' : 'Выйдет из Google аккаунта'}</li>
                        <li>{language === 'en' ? 'Clear all local data' : 'Очистит все локальные данные'}</li>
                        <li>{language === 'en' ? 'Return you to the start page' : 'Вернёт на страницу начала'}</li>
                    </ul>
                </div>
            </Modal>
        </div>
    );
}

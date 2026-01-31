export interface ReadingItem {
    book_number: number;
    start_chapter: number;
    start_verse: number | null;
    end_chapter: number;
    end_verse: number | null;
}

export interface DayPlan {
    day: number;
    readings: ReadingItem[];
}

export interface PlanData {
    info: Record<string, string>;
    plan: DayPlan[];
}

export interface BookInfo {
    book_number: number;
    color: string;
    short_ru: string;
    long_ru: string;
    short_en: string;
    long_en: string;
}

export type BookMap = Record<number, BookInfo>;

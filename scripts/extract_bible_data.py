import sqlite3
import json
import os
import re

SQLITE_PATH = "../../RMMC-p.plan.SQLite3"
FORMAT_PATH = "../../MyBible Modules Format.txt"
OUTPUT_DIR = "../src/data"

os.makedirs(OUTPUT_DIR, exist_ok=True)

def extract_books():
    books = {}
    with open(FORMAT_PATH, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    current_book = {}
    
    # Iterate through all lines
    # We look for a line starting with a color code (after strip)
    # Then we capture the subsequent lines
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        # Check for color hex code
        if re.match(r'^#[0-9a-fA-F]{6}$', line):
            # Found a start of a block
            try:
                # Need to check if next line is a number
                # Sometimes there might be empty lines or comments? 
                # Based on the file dump, it seems consistent:
                # Color
                # Number
                # ShortRu
                # LongRu
                # ShortEn
                # LongEn
                
                # Check bounds
                if i + 5 >= len(lines): 
                    break
                    
                color = line
                number_line = lines[i+1].strip()
                if not number_line.isdigit():
                    # Maybe just a random color string or different section?
                    # Skip
                    i += 1
                    continue
                    
                book_number = int(number_line)
                short_ru = lines[i+2].strip()
                long_ru = lines[i+3].strip()
                short_en = lines[i+4].strip()
                long_en = lines[i+5].strip()
                
                # Note: There might be a Note line after long_en?
                # But for our purpose (displaying books), we just need names.
                
                books[book_number] = {
                    "book_number": book_number,
                    "color": color,
                    "short_ru": short_ru,
                    "long_ru": long_ru,
                    "short_en": short_en,
                    "long_en": long_en
                }
                
                # Advance index by 6
                i += 6
                continue
                
            except Exception as e:
                print(f"Error parsing at line {i}: {e}")
                
        i += 1
        
    print(f"Extracted {len(books)} books.")
    return books

def extract_plan():
    conn = sqlite3.connect(SQLITE_PATH)
    cursor = conn.cursor()
    
    # Get Metadata
    cursor.execute("SELECT name, value FROM info")
    info = {row[0]: row[1] for row in cursor.fetchall()}
    
    # Get Reading Plan
    # Schema: day, evening, item, book_number, start_chapter, start_verse, end_chapter, end_verse
    cursor.execute("SELECT * FROM reading_plan ORDER BY day, item")
    rows = cursor.fetchall()
    
    plan = []
    
    current_day = -1
    day_items = []
    
    for row in rows:
        day, evening, item, book_num, start_ch, start_v, end_ch, end_v = row
        
        if day != current_day:
            if current_day != -1:
                plan.append({
                    "day": current_day,
                    "readings": day_items
                })
            current_day = day
            day_items = []
            
        day_items.append({
            "book_number": book_num,
            "start_chapter": start_ch,
            "start_verse": start_v,
            "end_chapter": end_ch,
            "end_verse": end_v
        })
        
    if day_items:
        plan.append({
            "day": current_day,
            "readings": day_items
        })
        
    conn.close()
    return info, plan

if __name__ == "__main__":
    print("Extracting books...")
    books = extract_books()
    with open(os.path.join(OUTPUT_DIR, "books.json"), "w", encoding='utf-8') as f:
        json.dump(books, f, ensure_ascii=False, indent=2)
        
    print("Extracting plan...")
    info, plan = extract_plan()
    
    data = {
        "info": info,
        "plan": plan
    }
    
    with open(os.path.join(OUTPUT_DIR, "plan.json"), "w", encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        
    print("Done!")

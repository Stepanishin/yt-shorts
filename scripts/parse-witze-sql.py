#!/usr/bin/env python3
"""
Script to parse witze.sql from Schlechtewitzefront repository
and create a JSON file with German jokes.

Source: https://github.com/JohannesBauer97/Schlechtewitzefront
"""

import re
import json
import html
import random
from pathlib import Path

# Configuration
SQL_FILE = "/tmp/witze.sql"
OUTPUT_FILE = Path(__file__).parent.parent / "witze_schlechtewitzefront.json"
MAX_JOKES = 5000
MIN_LENGTH = 30
MAX_LENGTH = 700

def decode_html_entities(text: str) -> str:
    """Decode HTML entities in text."""
    # First pass - standard HTML entities
    text = html.unescape(text)
    # Second pass for any remaining numeric entities
    text = re.sub(r'&#(\d+);', lambda m: chr(int(m.group(1))), text)
    text = re.sub(r'&#x([0-9a-fA-F]+);', lambda m: chr(int(m.group(1), 16)), text)
    return text

def clean_joke_text(text: str) -> str:
    """Clean and normalize joke text."""
    text = decode_html_entities(text)
    # Remove HTML tags
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', '', text)
    # Remove \r
    text = text.replace('\r', '')
    # Remove excessive whitespace but keep single newlines
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r' {2,}', ' ', text)
    text = text.strip()
    return text

def is_german_text(text: str) -> bool:
    """Check if text is likely German (not English)."""
    text_lower = text.lower()

    # German-specific characters and words
    german_indicators = [
        'ä', 'ö', 'ü', 'ß',
        ' ich ', ' du ', ' er ', ' sie ', ' wir ', ' ihr ',
        ' und ', ' oder ', ' aber ', ' wenn ', ' weil ', ' dass ',
        ' ist ', ' sind ', ' war ', ' hat ', ' haben ',
        ' nicht ', ' kein ', ' keine ',
        ' ein ', ' eine ', ' einen ', ' einem ',
        ' der ', ' die ', ' das ', ' den ', ' dem ',
        ' auf ', ' mit ', ' von ', ' bei ', ' nach ',
        ' mein ', ' dein ', ' sein ',
        ' warum ', ' wieso ', ' weshalb ',
        ' heute ', ' gestern ', ' morgen ',
        ' sagt ', ' fragt ', ' geht ', ' kommt ',
    ]

    # English words that indicate non-German text
    english_indicators = [
        ' the ', ' is ', ' are ', ' was ', ' were ',
        ' you ', ' your ', ' my ', ' his ', ' her ',
        ' what ', ' when ', ' where ', ' why ', ' how ',
        ' this ', ' that ', ' these ', ' those ',
        ' have ', ' has ', ' had ',
        ' will ', ' would ', ' could ', ' should ',
        'you know', 'went on', 'because',
    ]

    german_score = sum(1 for ind in german_indicators if ind in text_lower)
    english_score = sum(1 for ind in english_indicators if ind in text_lower)

    # If clearly English, reject
    if english_score > 2 and german_score < 2:
        return False

    # If no German indicators at all, probably not German
    if german_score == 0 and len(text) > 50:
        return False

    return True

def is_appropriate_joke(text: str) -> bool:
    """Filter out inappropriate content."""
    text_lower = text.lower()

    # Filter keywords for inappropriate content
    bad_keywords = [
        'hitler', 'nazi', 'juden', 'holocaust', 'vergasung', 'konzentrationslager',
        'auschwitz', 'neger', 'nigger', 'pädophil', 'kinderschänder',
        'vergewaltigung', 'vergewaltigt', 'kz', 'drittes reich',
    ]

    for keyword in bad_keywords:
        if keyword in text_lower:
            return False

    # Check if German
    if not is_german_text(text):
        return False

    return True

def parse_sql_file(filepath: str) -> list:
    """Parse SQL file and extract jokes."""
    print(f"Reading SQL file: {filepath}")

    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    # Pattern to match INSERT VALUES
    # Format: (id, veri, votes, 'user', 'datum', 'witz')
    pattern = r"\((\d+), (\d+), (\d+), '([^']*)', '([^']*)', '((?:[^'\\]|\\.|'')*)'\)"

    jokes = []
    matches = re.findall(pattern, content)

    print(f"Found {len(matches)} total jokes in SQL")

    for match in matches:
        joke_id, veri, votes, user, datum, witz = match

        # Only verified jokes
        if veri != '1':
            continue

        # Clean the joke text
        witz_clean = witz.replace("\\'", "'").replace("''", "'")
        witz_clean = clean_joke_text(witz_clean)

        # Filter by length
        if len(witz_clean) < MIN_LENGTH or len(witz_clean) > MAX_LENGTH:
            continue

        # Filter inappropriate content
        if not is_appropriate_joke(witz_clean):
            continue

        jokes.append({
            'index': int(joke_id),
            'texto': witz_clean,
            'votos': int(votes),
            'fecha': datum,
            'usuario': user,
            'added': False
        })

    return jokes

def main():
    print("=" * 60)
    print("Parsing Schlechtewitzefront SQL dump")
    print("=" * 60)

    # Parse SQL
    all_jokes = parse_sql_file(SQL_FILE)
    print(f"\nAfter filtering: {len(all_jokes)} jokes")

    # Sort by votes (descending) then shuffle within same vote count
    # to get diverse selection
    jokes_with_votes = [j for j in all_jokes if j['votos'] > 0]
    jokes_without_votes = [j for j in all_jokes if j['votos'] == 0]

    print(f"  - With votes > 0: {len(jokes_with_votes)}")
    print(f"  - With votes = 0: {len(jokes_without_votes)}")

    # Sort jokes with votes by vote count
    jokes_with_votes.sort(key=lambda x: x['votos'], reverse=True)

    # Shuffle jokes without votes for random selection
    random.seed(42)  # For reproducibility
    random.shuffle(jokes_without_votes)

    # Combine: first all with votes, then random selection of others
    selected_jokes = jokes_with_votes + jokes_without_votes
    selected_jokes = selected_jokes[:MAX_JOKES]

    print(f"\nSelected {len(selected_jokes)} jokes for export")

    # Add source info
    for joke in selected_jokes:
        joke['origen'] = 'Schlechtewitzefront'

    # Save to JSON
    print(f"\nSaving to: {OUTPUT_FILE}")
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(selected_jokes, f, ensure_ascii=False, indent=2)

    # Statistics
    print("\n" + "=" * 60)
    print("STATISTICS")
    print("=" * 60)
    print(f"Total jokes in output: {len(selected_jokes)}")

    # Length distribution
    lengths = [len(j['texto']) for j in selected_jokes]
    print(f"Text length - min: {min(lengths)}, max: {max(lengths)}, avg: {sum(lengths)//len(lengths)}")

    # Vote distribution
    votes = [j['votos'] for j in selected_jokes]
    with_votes = len([v for v in votes if v > 0])
    print(f"Jokes with votes > 0: {with_votes}")

    # Sample jokes
    print("\n" + "=" * 60)
    print("SAMPLE JOKES")
    print("=" * 60)
    for i, joke in enumerate(selected_jokes[:5]):
        print(f"\n[{i+1}] (votes: {joke['votos']})")
        print(f"    {joke['texto'][:150]}...")

    print("\n✅ Done!")

if __name__ == "__main__":
    main()

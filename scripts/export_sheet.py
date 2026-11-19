#!/usr/bin/env python3
"""Convert the confirmed Rabel workbook into a validated, portable import snapshot.

Usage: python scripts/export_sheet.py input.xlsx import/rabel-sheet.json
Requires openpyxl. The workbook is not a runtime backend.
"""
import json
import re
import sys
import unicodedata
from pathlib import Path
from openpyxl import load_workbook

BADGES = {'il piu ordinato': 'pop', 'combo': 'combo', 'piccante': 'spicy',
          'crudo': 'raw', 'vegetariano': 'veg', 'solo al banco': 'banco'}

def badge(value):
    text = unicodedata.normalize('NFD', value.lower())
    text = ''.join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r'[^a-z ]+', ' ', text)
    return ' '.join(text.split())

def convert(workbook):
    source = {sheet.title: [list(row) for row in sheet.values] for sheet in workbook}
    menu = []
    for n, row in enumerate(source['Menù'][3:]):
        category, name, en, description, description_en, price, allergens, notes, available, photo = (row + [None] * 10)[:10]
        if not category or not name:
            raise ValueError(f'Invalid menu row {n + 4}')
        if photo:
            raise ValueError(f'Photo needs separate migration for {name}')
        if available not in ('Sì', 'No'):
            raise ValueError(f'Unknown availability for {name}: {available}')
        labels = [badge(x) for x in (notes or '').split(',') if x.strip()]
        if any(label not in BADGES for label in labels):
            raise ValueError(f'Unknown badge for {name}: {notes}')
        codes = [x.strip() for x in (allergens or '').split(',') if x.strip() not in ('', '-', '—')]
        if price in ('', None): price = None
        if price is not None and (not isinstance(price, (int, float)) or price < 0):
            raise ValueError(f'Invalid price for {name}')
        menu.append(dict(position=n, category=category, name=name, name_en=en or '', description=description or '',
                         description_en=description_en or '', price=price, allergens=codes,
                         badges=[BADGES[x] for x in labels], available=available == 'Sì', photo_path=None))
    hours = [dict(position=n, days=row[0], hours=row[1]) for n, row in enumerate(source['Info & Orari'][12:16])]
    if [h['days'] for h in hours] != ['Lunedì', 'Martedì', 'Mercoledì – Venerdì', 'Sabato – Domenica']:
        raise ValueError('Unexpected opening hours rows')
    info = [dict(key=row[0], value=str(row[1] or '')) for row in source['Info'][1:] if row[0]]
    for title, key in [('Menù','source_menu'), ('Info & Orari','source_info_hours'), ('Allergeni & Fonti','source_allergens_sources'), ('Info','source_info')]:
        info.append(dict(key=key, value=json.dumps(source[title], ensure_ascii=False, separators=(',', ':'))))
    if len(menu) != 41 or len(hours) != 4 or len(info) != 28 or len({x['key'] for x in info}) != len(info):
        raise ValueError('Unexpected counts or duplicate info keys')
    return {'dishes': menu, 'hours': hours, 'info': info}

if __name__ == '__main__':
    with open(sys.argv[1], 'rb') as f:
        result = convert(load_workbook(f, data_only=True))
    Path(sys.argv[2]).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Converted:', *(f'{k}={len(v)}' for k, v in result.items()))

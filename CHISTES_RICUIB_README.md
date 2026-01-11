# Датасет испанских шуток из RicUIB/Mineria-texto-chistes

## 📊 Общая информация

- **Всего шуток**: 7,169
- **Источники**: 2 сайта
  - Pintamania: 4,747 шуток (66.2%)
  - 1000 chistes: 2,422 шуток (33.8%)
- **Формат**: JSON
- **Файл**: `chistes_ricuib.json`
- **Размер**: 2.49 MB

## 📁 Структура данных

```json
{
  "titulo": "Название шутки",
  "texto": "Текст шутки",
  "categorias": ["категория1", "категория2"],
  "palabras_clave": ["ключевое_слово1", "ключевое_слово2"],
  "origen": "Pintamania" | "1000 chistes",
  "votos": 25 | null
}
```

## 🏷️ ТОП-20 категорий

1. **Chistes variados** - 1,569 шуток
2. **cortos** - 1,482 шуток
3. **malos** - 896 шуток
4. **Chistes de mamá mamá** - 811 шуток
5. **Chistes de animales** - 641 шуток
6. **Chistes de Jaimito** - 635 шуток
7. **buenos** - 527 шуток
8. **Chistes de amigos** - 409 шуток
9. **matrimonios** - 313 шуток
10. **verdes** - 303 шуток
11. **animales** - 227 шуток
12. **niños** - 200 шуток
13. **Chistes de borrachos** - 196 шуток
14. **amigos** - 193 шуток
15. **largos** - 171 шуток
16. **infidelidad** - 108 шуток
17. **borrachos** - 105 шуток
18. **médicos** - 104 шуток
19. **religión** - 87 шуток
20. **Lepe** - 85 шуток

## ⭐ Примеры лучших шуток (по голосам)

### EL CALVO - 60 голосов
> ¿Cual es el colmo de un Calvo? Tener ideas descabelladas.

### EL PIRATA - 45 голосов
> Poema a las mujeres: Quisiera ser pirata no por el oro ni la plata sino por ese tesoro que tienes entre las patas.

### EL OBSESIONADO COMILON - 40 голосов
> -Amigo, siempre estas pensando en comida
> No se a que te refieres croquetamente.

### EL CAFE - 40 голосов
> Como se llama el cafe cuando sale de la carcel ? expreso

## 📝 Примеры коротких шуток (идеально для шортсов)

### 0 positivo
**Категории**: cortos, malos
**Текст**: - ¡Rápido, necesitamos sangre! - Yo soy 0 positivo. - Pues muy mal, necesitamos una mentalidad optimista.

### Bob Esponja
**Категории**: cortos, malos
**Текст**: - ¿Por qué Bob Esponja no va al gimnasio? - Porque ya está cuadrado.

### Mejor portero
**Категории**: cortos, malos
**Текст**: - ¿Cuál es el mejor portero del mundial? - Evidente ¡el de Para-guay!

### WHY en inglés
**Категории**: cortos, malos
**Текст**: - Que significa WHY en inglés? - Por qué. - Por saberlo

## 🎯 Рекомендации по использованию

1. **Для шортсов идеальны**:
   - Категория "cortos" (1,482 шуток)
   - Категория "buenos" (527 качественных шуток)
   - Шутки с высоким рейтингом голосов

2. **Популярные темы**:
   - Jaimito (детский персонаж) - 635 шуток
   - Животные - 641 + 227 = 868 шуток
   - Семейные темы (mamá mamá, matrimonios) - 1,124 шутки

3. **Избегать**:
   - Категория "largos" (длинные шутки) - не подходят для шортсов
   - Категория "verdes" (зеленые/пикантные) - могут нарушать политику YouTube

## 📥 Источник

**GitHub**: https://github.com/RicUIB/Mineria-texto-chistes
**Лицензия**: Открытые данные для исследований
**Дата получения**: 2026-01-11

## 🔧 Как использовать

```python
import json

# Загрузить все шутки
with open('chistes_ricuib.json', 'r', encoding='utf-8') as f:
    chistes = json.load(f)

# Фильтр только коротких шуток
cortos = [c for c in chistes if 'cortos' in c['categorias']]

# Фильтр по рейтингу
top_rated = [c for c in chistes if c['votos'] and c['votos'] > 20]

# Фильтр по источнику
pintamania = [c for c in chistes if c['origen'] == 'Pintamania']
```

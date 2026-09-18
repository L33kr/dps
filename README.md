# 🎮 Warframe DPS Calculator v2

Интерактивный калькулятор DPS для билдов Warframe с учетом:
- ✅ **Брони врагов** (Ferrite, Alloy) и её масштабирования по уровню
- ✅ **Уровня врага** (от 1 до 9999)
- ✅ **Статусов** — Viral, Corrosive, Heat, Slash (Bleed)
- ✅ **Типов здоровья** врагов (Cloned Flesh, Flesh, Robotic, Infested)
- ✅ **Уязвимостей урона** по типам брони и здоровья

**Стек**: Deno (бэкенд) + HTML/JS (фронтенд)

## 🚀 Быстрый старт

### 1. Форкните репозиторий

### 2. Разверните бэкенд на Deno Deploy

1. Откройте [dash.deno.com](https://dash.deno.com) и войдите через GitHub
2. Нажмите **New Project** → выберите свой форк
3. Entrypoint: `backend/server.ts`
4. Получите URL вида `https://ваш-проект.deno.dev`

### 3. Настройте фронтенд

В файле `frontend/app.js` замените строку:

```javascript
const DEFAULT_API = "https://ВАШ_ПРОЕКТ.deno.dev";
```

на URL вашего проекта из Deno Deploy.

### 4. Включите GitHub Pages

1. Settings → Pages
2. Source: **Deploy from a branch**
3. Branch: `main`, папка: `/frontend`
4. Save

Через 1-2 минуты сайт будет доступен по адресу `https://ваш-ник.github.io/имя-репозитория/`

## 🖥️ Локальный запуск

### Бэкенд
```bash
cd backend
deno task start
```
Сервер: `http://localhost:8000`

### Фронтенд
Откройте `frontend/index.html` в браузере.
Введите `http://localhost:8000` в поле API в правом верхнем углу.

## 📡 API

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/` | Health check |
| GET | `/api/weapons` | Список оружия |
| GET | `/api/mods` | Список модов |
| POST | `/api/calculate` | Расчет DPS |

## ⚙️ Формулы

### Броня
- **Масштабирование**: `Armor = BaseArmor × (1 + (Level - BaseLevel)^1.75 × 0.005)`
- **Снижение урона**: `DR = 90% × √(NetArmor / 2700)`

### Статусы
- **Viral**: 1-й стак +100% урона по здоровью, каждый следующий +25%, макс. +325%
- **Corrosive**: 1-й стак -26% брони, каждый следующий -6%, макс. -80%
- **Heat**: постепенно снижает броню до -50% (через 2 сек)
- **Slash (Bleed)**: 35% от модифицированного базового урона за тик, True Damage

## ⚠️ Ограничения

- Модель расчета упрощена (не учитывает критические тиры)
- Данные кэшируются на 6 часов
- Для точных расчетов используйте [Overframe.gg](https://overframe.gg)

## 📜 Лицензия

MIT
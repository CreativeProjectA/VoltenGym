# Volten Gym

Sistema completo del gimnasio: app de miembros y coaches + punto de venta, sobre Supabase.

<!-- deploy: 2026-07-07 -->


## Archivos principales

| Archivo | Qué es |
|---|---|
| `app.html` | App de miembros y coaches (PWA instalable) |
| `pos.html` | Punto de venta (recepción/cajeras, funciona sin internet) |
| `index.html` | Redirección a la app |
| `sw.js` | Service worker (carga offline) |
| `extracted_template.txt` | Código fuente de la app (se edita aquí) |
| `rebuild.js` | Reconstruye `app.html` desde la plantilla: `node rebuild.js` |
| `pos_migration*.sql` | Migraciones de la base (correr en Supabase → SQL Editor, en orden) |
| `PROJECT_RULES.md` / `POS_SPEC.md` | Reglas de diseño y especificación |

## Deploy

Proyecto estático — en Vercel basta importar el repo (sin build). La app queda en `/app.html` y el POS en `/pos.html`.

## Seguridad

El código solo contiene la llave **publishable** de Supabase (pública por diseño); todos los datos están protegidos por RLS. La llave secreta nunca va en el repo (`.env` está ignorado).

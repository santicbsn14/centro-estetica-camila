# Camila González Belleza — Sistema de Turnos

Sistema de gestión de turnos para un centro de estética. Clientas piden turno desde la web sin
registrarse; el centro aprueba o rechaza desde un panel; el sistema notifica por WhatsApp (Twilio)
y mail en cada paso.

**Fuente de verdad del modelo de datos:** [`modelo-datos-turnos.md`](./modelo-datos-turnos.md).
Leerlo antes de tocar modelos, endpoints o el algoritmo de disponibilidad — ahí están las
decisiones y el porqué de cada una. Este archivo no lo duplica, solo orienta la navegación del repo.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React + TypeScript + Vite (`client/`) |
| Backend | Node.js + Express + TypeScript (`server/`), pensado para Render |
| Base de datos | MongoDB Atlas (requiere replica set por transacciones) |
| Validación compartida | Zod (`shared/`), un esquema, dos consumidores |
| WhatsApp | Twilio → WhatsApp Business Platform |

## Estructura del monorepo

Workspaces de npm. Un solo `npm install` en la raíz instala los tres paquetes.

```
shared/   esquemas Zod + tipos inferidos, consumidos por server y client vía alias @shared/*
server/   Express + TS. models/ completos, routes/ y services/ todavía vacías
client/   React + TS + Vite
```

El alias `@shared/*` apunta directo a `shared/src/*` (no hay build intermedio): configurado por
`paths` en `tsconfig` para `tsx` en el server, y por `resolve.alias` en `vite.config.ts` para el
client. Al importar algo nuevo desde `shared/`, agregarlo también al `index.ts` del paquete.

## Reglas transversales del modelo (no negociables)

Documentadas a fondo en `modelo-datos-turnos.md` §3. Resumen para no pisarlas sin querer:

- **Tiempo:** patrón que se repite (horarios) → string `'HH:mm'` local. Instante único → `Date`
  UTC. Día de la semana siempre en `America/Argentina/Buenos_Aires`, nunca `Date.getDay()` sobre UTC.
- **Plata:** enteros en centavos. Nunca un `Number` decimal en campos monetarios.
- **Borrado:** no existe. `activo: false`. Los turnos referencian documentos que deben seguir existiendo.
- **Snapshots:** el turno congela precio, duración y datos de la clienta al reservar.
- **Transiciones de estado:** siempre con el estado esperado en el filtro del `findOneAndUpdate`,
  nunca un update ciego.
- **Nada calculable viaja desde el cliente:** precio, duración, `fin`, `finBloqueo` los deriva el
  server. Ver `shared/src/schemas/turno.schema.ts` — lo que falta ahí es a propósito.
- **Errores con forma fija:** `{ codigo, mensaje, detalle? }`.

## Estado del scaffolding

Sin lógica de negocio todavía. Los 8 modelos de Mongoose (`server/src/models/`) están completos
con sus índices tal como figuran en `modelo-datos-turnos.md` §9. `routes/` y `services/` existen
vacías a propósito — ahí va el próximo trabajo (algoritmo de disponibilidad, worker de
notificaciones, endpoints).

## Comandos

```
npm install       # una vez, en la raíz
npm run dev        # server (puerto 4000) + client (puerto 5173) en paralelo
npm run typecheck  # tsc --noEmit en los tres paquetes
```

El server arranca aunque falte `MONGODB_URI` (solo avisa por consola) — así el scaffolding corre
sin credenciales de Atlas reales. Copiar `server/.env.example` a `server/.env` para conectar de verdad.

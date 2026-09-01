# Sistema de Turnos — Camila González Belleza

## Modelo de datos y decisiones

**Estado:** modelo cerrado. Base para el chat de arquitectura.
**Fuente de verdad del alcance:** `propuesta_camiGonzalez_Belleza.docx` (aprobada por la clienta).

---

## 1. Contexto

Sistema de gestión de turnos para un centro de estética. Las clientas solicitan turno desde la web sin registrarse; el centro aprueba o rechaza desde un panel; el sistema notifica automáticamente por WhatsApp y mail en cada paso.

**Stack**

| Capa | Tecnología |
|---|---|
| Frontend | React + TypeScript + Vite (hosting a definir) |
| Backend | Node.js + Express + TypeScript, en Render |
| Base de datos | MongoDB Atlas (requiere replica set por transacciones) |
| WhatsApp | Twilio → WhatsApp Business Platform |
| Mail | proveedor con tier gratuito |

**Prioridad número uno:** la mensajería automática. Es lo que se vendió y el único componente con riesgo externo (aprobación de plantillas por Meta).

**Duración estimada:** 4 a 5 semanas.

---

## 2. Cómo funciona, de punta a punta

La clienta elige un servicio y ve las profesionales que lo prestan. Elige una, y el sistema le muestra los horarios libres: el horario del centro, recortado por el de la profesional, recortado por el del servicio, menos feriados y bloqueos, menos los turnos ya tomados con su buffer de limpieza. Deja nombre y teléfono — el mail si quiere — y confirma. Sin registro, sin contraseña.

El turno nace **pendiente** y ocupa el horario de inmediato. Le llega un WhatsApp de "recibimos tu solicitud" con un link personal, y arranca un reloj. Si nadie responde antes del vencimiento, el turno se rechaza solo y libera el horario.

En el panel, la admin o la profesional aprueban o rechazan con un clic. Al aprobar sale el WhatsApp con los detalles y queda programado el recordatorio de 24 horas antes. Al rechazar, sale el aviso correspondiente.

La clienta puede cancelar desde su link hasta 24 horas antes; pasado ese punto el link le muestra el teléfono del centro. Cancele quien cancele, sale la notificación y el horario vuelve a estar disponible al instante.

Cada mensaje se guarda como registro propio antes de salir. Un worker los toma, los manda, reintenta si falla y anota el resultado. **Nada se envía dentro del endpoint que crea el turno**, así que una caída de Twilio no rompe una reserva ni pierde un mensaje en silencio.

Pasada la hora, el turno se marca completado solo.

---

## 3. Reglas transversales

Aplican a todo el modelo, sin excepción.

**Tiempo.** Regla que se repite → string `'HH:mm'` en hora local. Instante único → `Date` en UTC. El día de la semana se calcula siempre en `America/Argentina/Buenos_Aires`, nunca con el `getDay()` de un `Date` UTC (un turno de las 22:00 del miércoles es jueves en UTC).

**Plata.** Enteros en centavos. Ningún `Number` decimal en campos monetarios.

**Borrado.** No existe. `activo: false` en servicios, usuarios y clientes. Los turnos referencian documentos que tienen que seguir existiendo.

**Snapshots.** El turno congela precio, duración y datos de la clienta al momento de reservar. Un cambio de precio no reescribe turnos viejos.

**Timestamps.** `creadoEn` y `actualizadoEn` en todas las colecciones.

**Transiciones de estado.** Siempre con el estado esperado en el filtro del `findOneAndUpdate`. Nunca un update ciego.

**Nada calculable viaja desde el cliente.** El body manda qué servicio y a qué hora. Precio, duración, `fin` y `finBloqueo` los deriva el server leyendo la base.

**Errores con forma fija.** `{ codigo, mensaje, detalle? }`. El front mapea por `codigo`, nunca por el texto.

---

## 4. Colecciones

Ocho en total. El sub-esquema de horarios se comparte entre tres de ellas.

### Sub-esquema de horarios

Compartido por `configuracion`, `usuarios` y `servicios`. Una sola forma, una sola función de intersección.

```ts
horarios: [{
  dia: 0,                    // 0 = domingo (convención de Date.getDay)
  bloques: [
    { desde: '09:00', hasta: '13:00' },
    { desde: '15:00', hasta: '20:00' }
  ]
}]
```

El array de bloques resuelve el corte del mediodía sin campos extra. Validaciones: los bloques de un mismo día no se solapan y van ordenados; `hasta > desde` siempre. **Sin cruce de medianoche** — limitación conocida y aceptada.

### configuracion

Documento único.

```ts
{
  _id: 'centro',
  nombre: string,
  timezone: 'America/Argentina/Buenos_Aires',

  horarios: [...],                 // techo duro del centro

  pasoGrillaMin: 30,
  antelacionMinimaHoras: 3,        // ver nota
  ventanaMaximaDias: 60,
  cancelacionMinimaHoras: 24,
  vencimientoPendienteHoras: 12,

  contacto: { telefonoE164, email, direccion }
}
```

`antelacionMinimaHoras` hace doble función: evita reservas sobre la hora **y** garantiza que quede tiempo de confirmar antes del vencimiento. Por eso 3 y no 2.

### servicios

```ts
{
  nombre: string,
  descripcion?: string,
  duracionMin: number,
  bufferPostMin: number,           // limpieza; ocupa agenda, no se cobra
  precio: number,                  // centavos, entero
  mostrarPrecio: boolean,
  horarios: [...] | null,          // null = hereda de la profesional
  orden: number,
  activo: boolean
}
```

`horarios: null` significa "sin restricción propia". **El array vacío está prohibido** por validación: significaría "nunca disponible" y se escribe casi igual que `null`. O es `null`, o tiene al menos un día con al menos un bloque.

### usuarios

```ts
{
  nombre, email, passwordHash,
  rol: 'admin' | 'profesional',
  atiende: boolean,                // aparece en el selector público
  servicios: ObjectId[],
  horarios: [...],
  telefonoE164?,                   // aviso de turno nuevo
  activo: boolean
}
```

`atiende` separado de `rol` permite que la dueña administre y atienda con un solo usuario, sin dos agendas para la misma persona.

### excepciones

```ts
{
  profesionalId: ObjectId | null,  // null = todo el centro
  desde: Date,                     // UTC
  hasta: Date,                     // UTC
  tipo: 'feriado' | 'vacaciones' | 'bloqueo',
  motivo?: string,
  creadoPor: ObjectId
}
```

Sin campo `alcance`: `profesionalId: null` ya lo dice, y una sola fuente de verdad.

Sin campo `todoElDia`: el panel arma el rango 00:00–23:59 local antes de mandarlo.

Sin recurrencia: los feriados se cargan uno por uno. Son ~15 al año. Dejarlos precargados es un buen detalle de entrega.

**Las excepciones sólo restan, nunca abren horario.** Eso mantiene el algoritmo monótono: cada capa recorta, y la disponibilidad nunca puede superar el horario del centro.

### clientes

```ts
{
  telefonoE164: string,            // índice único — es la identidad
  telefonoCrudo: string,           // lo que tipeó, para auditar
  nombre: string,
  email?: string,
  notas?: string,                  // interno, sólo admin
  optOut: boolean,
  creadoEn, actualizadoEn
}
```

Sin contadores ni fechas derivadas: salen de una agregación sobre `turnos` el día que hagan falta.

`notas` es el campo más sensible del sistema (alergias, cuestiones de piel). **No se expone en ningún endpoint público ni aparece nunca en el cuerpo de un mensaje.**

`optOut` frena recordatorios. Confirmación y cancelación son transaccionales y siguen saliendo.

Un mismo teléfono puede ser dos personas (madre e hija es habitual en el rubro). Lo resuelve el `clienteSnapshot` del turno, que guarda el nombre cargado en esa reserva. No se intenta separar identidades más allá de eso.

### turnos

```ts
{
  codigo: 'TRN-4821',              // legible, para hablar por teléfono

  clienteId: ObjectId,
  clienteSnapshot: { nombre, telefonoE164, email },
  profesionalId: ObjectId,
  profesionalNombre: string,

  servicio: {                      // snapshot, uno solo por turno
    servicioId, nombre, duracionMin, bufferPostMin, precio
  },

  inicio: Date,                    // UTC
  fin: Date,                       // inicio + duracionMin
  finBloqueo: Date,                // fin + bufferPostMin

  estado: 'pendiente' | 'confirmado' | 'rechazado'
        | 'cancelado' | 'completado' | 'ausente',
  expiraEn: Date,                  // sólo mientras está pendiente
  historial: [{ estado, fecha, porTipo: 'cliente'|'usuario'|'sistema', porId?, motivo? }],

  origen: 'web' | 'admin',
  fueraDeHorario: boolean,         // el admin pisó la política
  tokenHash: string,               // se guarda el hash, no el token

  creadoEn, actualizadoEn
}
```

`finBloqueo` guardado convierte la detección de solape en una comparación de rangos:

```
hay conflicto si  inicio < otro.finBloqueo  &&  finBloqueo > otro.inicio
```

`expiraEn` guardado (no calculado) permite que el worker lo busque por índice y que el panel muestre "vence en 3hs" con la lista ordenada por urgencia:

```ts
expiraEn = min(
  creadoEn + vencimientoPendienteHoras,
  inicio - antelacionMinimaHoras
)
```

El tope por `inicio` evita que un turno de mañana temprano venza después de haber ocurrido.

`tokenHash`: el link del WhatsApp lleva el valor crudo, la base guarda sólo el hash. Un dump filtrado no permite cancelar turnos ajenos.

### notificaciones

```ts
{
  turnoId: ObjectId,
  tipo: 'solicitud' | 'confirmacion' | 'recordatorio_24h'
      | 'cancelacion' | 'rechazo' | 'autorespuesta',
  canal: 'whatsapp' | 'email',
  destino: string,                 // E164 o email, snapshot

  programadaPara: Date,            // UTC
  estado: 'pendiente' | 'enviando' | 'enviada' | 'fallida' | 'cancelada',
  intentos: number,
  proximoIntento: Date,

  proveedorSid?: string,
  proveedorEstado?: string,        // queued / sent / delivered / read / failed
  payloadEnviado?: object,
  error?: { codigo, mensaje },

  creadaEn, enviadaEn?
}
```

### plantillas

Separada a propósito de `notificaciones.tipo`. El nombre de la plantilla es un identificador externo que no controlamos: Meta puede rechazar una y hay que reenviarla con otro nombre. Con el mapeo aparte, eso se resuelve editando un documento y no tocando código.

```ts
{
  tipo: '...',
  canal: 'whatsapp' | 'email',

  metaNombre: 'turno_confirmado',
  metaIdioma: 'es_AR',
  metaEstado: 'aprobada' | 'pendiente' | 'rechazada',
  contentSid?: string,             // HX... de Twilio. El ID que Twilio usa
                                   // para enviar. Distinto de metaNombre
                                   // (nombre legible) — este es el técnico.
  variables: ['nombre', 'servicio', 'fecha', 'hora', 'profesional'],

  asunto?: string,                 // canal email
  cuerpoHtml?: string,

  activa: boolean
}
```

> **Las variables de Meta son posicionales.** En la plantilla son `{{1}}`, `{{2}}`, `{{3}}` — no tienen nombre. El orden de `variables` **es** el significado. Reordenarlo hace que las clientas reciban el servicio donde va la hora. Va con un test que compare contra el orden esperado.

**`contentSid` vs `metaNombre`.** Twilio envía por `ContentSid` (HX...), no
por el nombre. `metaNombre` es legible/humano; `contentSid` es el que va en
la llamada a la API. Los cinco (aprobados 22/08/2026, ver §8) se siembran en
esta colección, no se hardcodean. Si Meta pausa/hace recrear una, cambia el
HX → se edita el documento, no el worker.

---

## 5. Disponibilidad

Intersección de tres capas, menos dos restas:

```
horario del centro
  ∩ horario de la profesional
  ∩ horario del servicio (si tiene)
  − excepciones (centro + profesional)
  − turnos activos + bufferPostMin
```

Todo el cálculo en el server, nunca en el cliente.

**Caso borde a cubrir en el panel:** si el horario de la profesional y el del servicio no se cruzan (ella trabaja martes y jueves, el servicio es miércoles y viernes), la intersección es vacía y la web no ofrece ni un turno. No es un bug, es configuración mal cargada — pero necesita una advertencia visible en la pantalla de configuración o va a parecer que el sistema está roto.

**Carrera al reservar.** La disponibilidad que ve la clienta es una foto de hace segundos. El `POST /api/turnos` revalida el solape dentro de una transacción y devuelve `409 SLOT_OCUPADO` con los slots actualizados.
### Anclaje de la grilla — DECISIÓN CERRADA

Los slots se anclan a la grilla fija del centro (`pasoGrillaMin`), no al
fin del turno anterior. El primer slot de cada bloque horario arranca en
el borde de la grilla; los siguientes se ofrecen cada `pasoGrillaMin`
minutos desde ahí.

Consecuencia aceptada: cuando un turno + buffer no cae justo en el borde
de la grilla, quedan minutos muertos entre el fin del buffer y el
siguiente slot ofrecido. Ej.: turno 9:00–10:45 con grilla de 30 → el
siguiente slot es 11:00, no 10:45. Se pierden 15 min.

Motivo: legibilidad y predecibilidad de la agenda por encima de exprimir
cada hueco. Para un centro chico, una agenda prolija vale más que la
ocupación máxima.

Reversibilidad: cambiar a anclaje-al-turno-anterior toca sólo la función
de generación de slots, no el modelo. Decisión no bloqueante.

Un slot candidato se ofrece sólo si [inicio, inicio+duracion+buffer) entra
completo dentro de un bloque de la intersección de las tres capas y no
solapa con ningún turno activo. El buffer se descuenta de la agenda pero
el slot ofrecido a la clienta muestra sólo inicio y fin del servicio, no
el buffer.
---
### 5.1 Algoritmo de disponibilidad — decisiones

**Anclaje: grilla fija a medianoche local.** Los slots candidatos son
múltiplos de `pasoGrillaMin` desde 00:00 en `timezone`, no desde el
`desde` de cada bloque. Consecuencia aceptada: un bloque que arranca
fuera de grilla (ej. 09:15) pierde ese arranque hasta el próximo punto
de grilla.

**Semántica del buffer: laxa.** El `bufferPostMin` del turno nuevo se
valida SÓLO contra turnos existentes, no contra el borde del horario ni
de las excepciones:
- el SERVICIO (`duracionMin`) debe entrar completo en la ventana de atención;
- la OCUPACIÓN (`duracionMin + bufferPostMin`) no debe pisar ningún turno activo.
El buffer puede derramar fuera del horario/excepción: es tiempo muerto en
hora cerrada, no se ofrece a nadie. Se prioriza no perder el último slot
del día. (Variante estricta descartada: exigir la ocupación completa
dentro de la ventana come el último turno.)

**Estados que ocupan agenda:** `pendiente` + `confirmado`. El resto libera
el horario. Va en el filtro de la query de turnos, no en la función.

**Capas y restas** (todo en el server, en ms UTC):
  centro ∩ profesional ∩ (servicio | null) − excepciones ⇒ ventanas
  - servicio = null ⇒ no restringe (hereda de la profesional).
  - servicio no-null sin bloque ese día ⇒ intersección vacía ⇒ 0 slots ese día.
Las excepciones sólo restan (algoritmo monótono). Los turnos se restan como
[inicio, finBloqueo] (finBloqueo ya incluye SU propio buffer).

**Doble longitud, no colapsar en una:** el chequeo "cabe en ventana" usa
`dur`; el chequeo "pisa turno" usa `dur + buffer`.

**Día de la semana:** siempre en `timezone` con Luxon, nunca `getDay()` de
un Date UTC. Mapeo `dow = weekday === 7 ? 0 : weekday` para la convención
`dia: 0=domingo` del sub-esquema.

**Dependencia nueva:** `luxon` para toda conversión TZ ↔ UTC y cálculo de
día. No hardcodear -3.

**Función pura.** `calcularDisponibilidad` recibe `excepciones` y `turnos`
YA filtrados por la capa de datos; no toca la DB. La query de turnos necesita
un margen hacia atrás en `inicio` (= mayor `dur + buffer` del catálogo) porque
un turno con `inicio` previo a la ventana puede seguir ocupando por su
`finBloqueo`, y no hay índice por `finBloqueo`. Se llama con la profesional
ya elegida (flujo público: servicio → profesional → horarios).

**Bordes cubiertos por tests:** intersección de capas vacía ⇒ []; buffer que
deja minutos muertos contra la grilla; slot que no entra completo antes del
fin del bloque; recorte por `antelacionMinimaHoras` (extremo cercano) y
`ventanaMaximaDias` (lejano); turno con override `fueraDeHorario` igual
bloquea (se resta contra todos los turnos activos, no sólo los que caen
dentro de horario).

## 6. Estados del turno

```
pendiente ──> confirmado ──> completado
    │              │
    │              ├──> cancelado
    │              └──> ausente
    ├──> rechazado
    └──> cancelado
```

| Transición | Quién |
|---|---|
| pendiente → confirmado | admin, profesional |
| pendiente → rechazado | admin, profesional, **sistema** (vencimiento) |
| pendiente → cancelado | clienta (sin límite de horas), admin |
| confirmado → cancelado | clienta (hasta 24hs antes), admin, profesional |
| confirmado → completado | sistema, por hora |
| confirmado → ausente | admin, profesional (manual) |

**Desde `pendiente` la clienta cancela sin límite de horas.** Todavía no le confirmaron nada; retirar una solicitud es libre. Las 24hs aplican sólo sobre lo confirmado.

**`completado` es automático.** Si dependiera de que alguien lo marque después de cada turno, no pasaría nunca. Un turno confirmado cuya hora pasó y nadie canceló, se completa solo. `ausente` queda como marca manual opcional.

**Rechazo manual y vencimiento comparten estado pero no actor.** `porTipo: 'sistema'` en el historial los distingue, y eso decide qué mensaje sale. El texto es distinto: "no pudimos confirmar tu turno, escribinos" no es un rechazo explícito.

**Un `pendiente` bloquea el horario.** Nadie recibe un rechazo por "ya lo tomaron". El vencimiento automático evita que un horario quede muerto si el panel no responde.

### Reglas de política vs. conflictos reales

La distinción es por tipo de regla, no por rol:

- **Políticas** (horarios de las tres capas, antelación mínima): el admin las puede pisar con confirmación explícita. Queda marcado en `fueraDeHorario`.
- **Conflictos reales** (solape con otro turno): **nadie** los pisa, ni el admin. Dos personas no pueden estar en la misma silla a la misma hora.

Así, `origen: 'web'` valida las cinco capas y `origen: 'admin'` valida sólo el solape. El turno excepcional entra al sistema igual, marcado — y sobre todo entra, con lo cual ese horario deja de ofrecerse a la próxima clienta.

---

## 7. Worker de notificaciones

**Tomar el trabajo, no leerlo.** `findOneAndUpdate` de `pendiente` → `enviando`, y recién ahí envía. Si dos ciclos se solapan — y con Render despertándose se van a solapar — el segundo no encuentra nada que tomar. Sin esto: dos WhatsApp a la misma clienta.

**Recuperar lo que quedó tomado.** Si el proceso muere entre el claim y el envío, ese documento queda en `enviando` para siempre. Al arrancar cada ciclo, todo lo que lleve más de 5 minutos en `enviando` vuelve a `pendiente`.

**Revalidar el turno antes de mandar.** El recordatorio se crea al confirmar y sale 24 horas después; en el medio el turno puede haberse cancelado. Doble defensa: al cambiar de estado, las notificaciones pendientes del turno pasan a `cancelada`; y aun así el worker relee el turno antes de enviar.

**Orden obligatorio al transicionar con cancelación de pendientes.** Cuando
una transición cancela las notificaciones `pendiente` de un turno (rechazar,
cancelar, §15.4/§15.5) Y ADEMÁS encola una notificación nueva del cambio en
sí (rechazo, cancelacion), el orden es: **primero cancelar lo pendiente
viejo, después crear la notificación nueva.** Al revés, la cancelación
masiva alcanza también a la notificación recién creada — nace `cancelada`
sin que nadie lo note. (Bug real encontrado el 12/08/2026 en
`encolarRechazo`/`encolarCancelacion`, corregido; ver §17.)

**Reintentos** con backoff 1, 5, 15, 60 minutos. A los 4 fallos → `fallida` y visible en el panel. Una notificación que falló en silencio es peor que ninguna, porque todos asumen que salió.

**Recordatorio:** si al confirmar faltan menos de 24 horas, la notificación de recordatorio no se crea. No se crea vencida ni se manda al instante — no existe.

---

## 8. WhatsApp / Meta

**Los cinco mensajes del sistema son plantillas aprobadas, sin excepción.** WhatsApp sólo permite texto libre dentro de las 24 horas posteriores al último mensaje *de la clienta*. Como todos los mensajes del sistema los inicia el centro, ninguno puede ser texto libre. Sin plantillas aprobadas no hay mensajería, y sin mensajería no hay entrega: es un bloqueante duro, no un trámite paralelo.

**Número nuevo y dedicado.** Un número de teléfono es una sola cuenta de WhatsApp: registrarlo en la API lo desloguea de la app, igual que instalar WhatsApp en un celular nuevo. Y el historial de chats vive cifrado en el dispositivo, así que no se migra — no hay dónde ponerlo.

Migrar el número que la clienta usa a diario metería su herramienta de trabajo dentro del único riesgo que no controlamos. Con número nuevo, si el trámite se traba ella sigue trabajando igual y sólo se demora la automatización.

El perfil de WhatsApp Business del número nuevo va con nombre, foto y dirección del centro. Eso cumple el espíritu de la propuesta, que buscaba evitar un número de pool anónimo.

**Autorespuesta a entrantes.** Cuando alguien escribe al número automático se abre la ventana de 24 horas, así que se puede responder con texto libre sin plantilla: "este número es sólo para avisos de turnos, escribinos al ...". Regla de no repetir dentro de la misma ventana.

**Coexistencia = fase 2.** Permite usar app y API sobre el mismo número, y Argentina está entre los países soportados. Dos condiciones a verificar antes de contar con ella: que Twilio la soporte, y que alguien abra la app al menos cada 14 días para mantener la conexión viva — una dependencia de comportamiento humano en la función crítica del sistema. Mejor migrar cuando todo esté andando y estable.


### Plantillas de WhatsApp — CERRADAS y en revisión de Meta (21/08/2026)

Las cinco creadas en Twilio Content Template Builder, categoría **Utility**,
idioma Spanish (ES), Content type Text. Enviadas a aprobación de Meta.
Nombre visible del sender: "Camila González Belleza". Sender online contra
WABA 1635937984615590 (Meta Business Manager 241420776704897), número
+5493364695239.

**El orden de variables ES el contrato (§plantillas). No reordenar sin
cambiar el mapeo del worker.**

| tipo (notificacion) | metaNombre | ContentSid (HX) | variables (orden posicional) |
|---|---|---|---|
| solicitud | turno_solicitud | HX49779c4e2e9c6edb7e1debc2ce8c89f8 | 1=nombre, 2=servicio, 3=fecha, 4=hora |
| confirmacion | turno_confirmado | HX741ec2158022acd9d3c4872a3b6448c7 | 1=nombre, 2=servicio, 3=fecha, 4=hora, 5=profesional |
| recordatorio_24h | turno_recordatorio | HXe134407ff84adbbb9e5c1b085e50c9dc | 1=nombre, 2=fecha, 3=hora, 4=servicio |
| cancelacion | turno_cancelado | HXc2265e76efdbca76145ffc2fa901b468 | 1=nombre, 2=fecha, 3=hora, 4=servicio |
| rechazo | turno_rechazado | HX78e2d34ed5c02f5c21a1a340829b7534 | 1=nombre, 2=fecha, 3=hora |

**Copy textual (para referencia; el que Meta aprobó/rechazará):**
- solicitud: "Hola {{1}}, recibimos tu solicitud de turno para {{2}} el {{3}} a las {{4}} en Camila González Belleza. Te confirmamos por este medio en cuanto lo revisemos."
- confirmacion: "¡Listo, {{1}}! Tu turno para {{2}} quedó confirmado para el {{3}} a las {{4}} con {{5}}. Te esperamos en Camila González Belleza."
- recordatorio_24h: "Hola {{1}}, te recordamos tu turno mañana {{2}} a las {{3}} para {{4}} en Camila González Belleza. Si no podés venir, avisanos con tiempo."
- cancelacion: "Hola {{1}}, tu turno del {{2}} a las {{3}} para {{4}} fue cancelado. Cualquier consulta, escribinos."
- rechazo: "Hola {{1}}, no pudimos confirmar tu turno solicitado para el {{2}} a las {{3}}. Escribinos para coordinar otro horario."

**OJO — el `metaNombre`/ContentSid son ahora datos de configuración, no
hardcode.** El §plantillas ya lo previó (mapeo aparte del `tipo`). Cuando se
conecte Twilio real, estos cinco HX van a la colección `plantillas` (o
config del worker), NO incrustados en el código del worker. Si Meta rechaza
alguna y hay que recrearla, cambia el HX → se edita el dato, no el código.


---

## 9. Índices

```ts
// servicios
{ activo: 1, orden: 1 }                          // catálogo público
{ nombre: 1 } unique                             // collation strength 2

// usuarios
{ email: 1 } unique
{ activo: 1, atiende: 1, servicios: 1 }          // "quiénes prestan este servicio"

// excepciones
{ profesionalId: 1, hasta: 1, desde: 1 }         // consultar con $in: [null, id]

// clientes
{ telefonoE164: 1 } unique                       // la identidad

// turnos
{ profesionalId: 1, estado: 1, inicio: 1 }       // disponibilidad
{ estado: 1, expiraEn: 1 }                       // worker de vencimiento
{ estado: 1, inicio: 1 }                         // panel
{ tokenHash: 1 } unique sparse
{ codigo: 1 } unique
{ clienteId: 1, inicio: -1 }                     // historial

// notificaciones
{ turnoId: 1, tipo: 1, canal: 1 } unique         // idempotencia
{ estado: 1, programadaPara: 1 }                 // worker de envío
{ proveedorSid: 1 } sparse                       // webhook de Twilio

// plantillas
{ tipo: 1, canal: 1 } unique partial (activa: true)
```

**Orden de campos: igualdad, orden, rango.** En el índice de disponibilidad, `profesionalId` y `estado` son igualdad y van primero; `inicio` es rango y va último. Al revés, Mongo escanea de más en la consulta más frecuente del sistema.

El índice único de `notificaciones` es la idempotencia: si el worker corre dos veces o Render reinicia a mitad de ciclo, el insert duplicado falla y nadie recibe dos mensajes.

---

## 10. Validaciones en tres capas

**Base de datos** — los índices únicos. Es lo único que sobrevive a la concurrencia. Todo "consulto si existe y después inserto" tiene una ventana en el medio.

**Esquema — Zod compartido entre front y back.** Se define una vez, el tipo sale con `z.infer`, y se usa para validar el body en Express y el formulario en React. Con Vite se resuelve con workspace de npm o carpeta `shared/` con path alias.

```ts
export const crearTurnoSchema = z.object({
  servicioId: z.string(),
  profesionalId: z.string(),
  inicio: z.string().datetime(),      // ISO UTC
  nombre: z.string().min(2).max(80),
  telefono: z.string().min(6),        // crudo, se normaliza en el server
  email: z.string().email().optional()
});
```

Lo que **no** está ahí es lo importante: `precio`, `duracionMin`, `fin`, `finBloqueo`. Si se acepta `precio` del body, alguien reserva a $1 con curl. Si se acepta `fin`, mete un turno de 5 minutos donde van 90.

**Negocio — en la capa de servicio.** Solape, transiciones, intersección de horarios, ventana de cancelación. Nada de esto entra en un esquema ni puede vivir en el controller si se quiere testear.

### Normalización de teléfono — DECISIÓN CERRADA

`libphonenumber-js` con `'AR'`, en el server, antes del `findOneAndUpdate` con
`upsert`. El E164 argentino de móvil lleva el 9 tras el +54.

**Regla: forzar el 9 cuando el número trae área completa; NUNCA adivinar el
área.** Si el input no trae código de área, se rechaza con `TELEFONO_INVALIDO`.
Reconstruir un área "por defecto" es una decisión de negocio frágil (una clienta
de otra localidad quedaría mal normalizada en silencio) — se descarta.

Formas de referencia y resultado real:

    +54 9 336 4123456   → +5493364123456   ✓ (área 336 + local 4123456)
    3364123456          → +5493364123456   ✓ (10 díg: área 336 + local)
    15 4123456          → TELEFONO_INVALIDO   (marcado local, sin área — irreconstruible)
    03364 15-4123456    → TELEFONO_INVALIDO   (errata previa: '3364' mete un díg de más en el área)

Los dos últimos NO convergen: no es un bug de normalización, es que no traen
información suficiente. El test los documenta como inválidos, no fuerza una
reconstrucción inventada.

**Consecuencia que se traslada al front (PENDIENTE web pública):** como el
server no reconstruye el área, el formulario de reserva DEBE garantizar que
llega un E164 válido — validación con libphonenumber-js en el input, prefijo
`+54 9` fijo o guiado, y bloquear el submit hasta que valide. Sin esto, una
clienta que tipea el número local (`15 4123456`, uso corriente en AR) recibe
`TELEFONO_INVALIDO` y no puede reservar. Es requisito de la web pública, no del
server.

### Validación de horarios (sub-esquema compartido) — DECISIÓN CERRADA

**Un factory de Zod, no un validador de negocio suelto.**
`horariosSchema({ nullable })` en `shared`, consumido por servicios, usuarios
y configuracion. Se define una vez (§10, front + back con `z.infer`); el
formulario de React valida sin round-trip.

La validación de horarios es enteramente self-contained por documento: no lee
la DB ni cruza estado entre documentos. Por eso NO entra en la capa de negocio
(el "negocio" del §10 es solape de turnos / transiciones / ventana de
cancelación, que sí necesitan DB o estado cruzado). Vive en el esquema.

**Parametrizado por `nullable` — un factory, tres llamadas:**
- `servicios` ⇒ `horariosSchema({ nullable: true })` — `null` = hereda de la
  profesional.
- `usuarios`, `configuracion` ⇒ `horariosSchema({ nullable: false })` — el
  centro y la profesional siempre tienen horario.

**Reglas (superRefine):**
- `null` válido sólo si `nullable: true`.
- Array top vacío `[]` ⇒ SIEMPRE prohibido (§servicios: significa "nunca
  disponible", se escribe casi igual que `null`).
- Día con `bloques: []` ⇒ prohibido. Cada entrada de día lleva ≥1 bloque.
  Profesional que no trabaja el martes ⇒ el martes NO aparece, no
  aparece-con-bloques-vacío.
- `dia` duplicado ⇒ prohibido. Un día aparece a lo sumo una vez; el split del
  mediodía lo resuelve el array de bloques.
- `hasta > desde` siempre. Sin cruce de medianoche (§sub-esquema, aceptado).
- Bloques de un mismo día no se solapan.

**Normalización (transform), no rechazo por orden.** El schema ordena días por
`dia` asc y bloques por `desde` asc DESPUÉS del superRefine. El invariante "van
ordenados" (§sub-esquema) queda garantizado por normalización, no exigido al
input: el front no ordena, una llamada manual desordenada se persiste ordenada
igual. El chequeo de solape ya ordena internamente ⇒ el sort es subproducto.
Idempotente: front y back corren el mismo schema.

**Reusa la primitiva de intervalos existente (§14), no la reimplementa.** El
no-solape convierte cada `'HH:mm'` a minutos-desde-medianoche y corre la
primitiva numérica de intersección que ya usa disponibilidad. Superficie nueva
(validación de escritura), primitiva compartida. Si la primitiva vive hoy
DENTRO del módulo de disponibilidad, extraerla a un util neutral: la validación
NO debe depender del módulo de disponibilidad; ambos dependen de la primitiva.

**disponibilidad sigue confiando en el invariante en lectura.** No re-valida
horarios al calcular slots — lo garantiza la escritura. Re-validar en lectura
sería redundante y castiga el CPU del free tier (§11).

**Superficie:** el validador devuelve el horarios parseado y ordenado; la capa
de servicio persiste eso. Servicios/usuarios/config sólo lo llaman.

**Bordes cubiertos por tests (aislado):**
- `null` con `nullable:true` ⇒ ok; con `nullable:false` ⇒ error.
- `[]` top ⇒ error en ambos modos.
- día con `bloques: []` ⇒ error.
- `dia` duplicado ⇒ error.
- `hasta <= desde` ⇒ error.
- bloques solapados en un mismo día ⇒ error.
- input desordenado ⇒ ok, se persiste ordenado (transform).
- válido multi-día multi-bloque ⇒ ok, orden estable.

### Seguridad de la superficie pública

El `tokenGestion` es la única puerta pública con permiso de escritura. Alcance a un solo turno, sin lectura de nada más, vencimiento al terminar el turno, sólo permite cancelar. **Rate limit por IP desde el día uno.**

---

## 11. Infraestructura

**MongoDB Atlas, no Mongo en Render.** Las transacciones requieren replica set; Atlas lo da hasta en el tier gratuito. Un Mongo como servicio en Render falla en runtime recién al abrir la primera transacción, que es tarde para enterarse. El tier gratuito comparte CPU: medir la consulta de disponibilidad antes de asumir que alcanza.

**El plan gratuito de Render duerme la instancia**, y eso rompe el worker de recordatorios — la función crítica del proyecto. Opciones: Render Cron Job, trigger externo contra un endpoint protegido, o BullMQ con Redis. Decisión pendiente, tiene impacto en el presupuesto acordado.

**Cuentas a nombre de la clienta desde el día uno:** dominio, Render, proveedor de mail, Twilio y sobre todo el Meta Business Manager. La propuesta dice "el sistema es tuyo"; migrar después un número de WhatsApp verificado de una cuenta a otra es lento y molesto. Si nace bien, no se hace nunca.

**La DB de test requiere replica set, no standalone.** Las transacciones
(`session.withTransaction`) fallan contra `MongoMemoryServer` standalone con
"Transaction numbers are only allowed on a replica set member". `dbTestSetup.ts`
usa `MongoMemoryReplSet` de un nodo. Todo flujo transaccional (POST creación,
transiciones de panel, cancelación) depende de esto en test.

**`autoIndex` no bloquea el arranque — los índices no existen al primer insert.**
`mongoose.connect()` resuelve antes de que `autoIndex` termine de construir los
índices en background. Un test que inserta y espera un `E11000` (unicidad) puede
dar falso negativo: el índice todavía no existe, el duplicado entra, la aserción
"debería fallar" no dispara. No es un problema de collation ni de declaración del
modelo — es timing de infra de test. Afecta a TODO índice único usado como
aserción: `nombre` de servicios (collation strength 2), idempotencia de
notificaciones (`turnoId+tipo+canal`), `telefonoE164`, `email`, `codigo`,
`tokenHash`.

Fix en `dbTestSetup.ts`, tras conectar:
`await Promise.all(Object.values(mongoose.connection.models).map((m) => m.init()))`
`Model.init()` resuelve cuando los índices de ese modelo están construidos. Global
sobre todos los modelos ⇒ toda la suite corre con los índices garantizados.
---

### Infra del worker — DECISIÓN CERRADA

**Worker embebido en el mismo proceso Express, mantenido despierto por un
ping externo.** No Render Cron Job separado, no BullMQ/Redis.

**Por qué se descartan las otras dos:**
- BullMQ/Redis: agrega infra nueva a operar (Redis administrado, aunque sea
  gratis) sin beneficio al volumen real (5-7 turnos/día ≈ techo de 25-35
  notificaciones/día). Sobre-ingeniería para este tamaño. Candidato a
  reconsiderar sólo si el volumen crece un orden de magnitud.
- Render Cron Job separado: es un segundo servicio a desplegar y mantener,
  con su propio riesgo de sleep si también es free tier. Si el proceso web ya
  está despierto por el ping, correr el ciclo del worker adentro con
  `setInterval` es menos piezas moviéndose.

**Mecanismo:** ping externo (mismo patrón ya usado en otro proyecto: UptimeRobot
/ cron-job.org) contra un endpoint de salud público y liviano, cada 5-10 min —
bien por debajo del timeout de sleep de Render free (15 min de inactividad).
El endpoint (`GET /healthz` o similar) no requiere auth, no ejecuta lógica de
negocio, sólo responde `200` con timestamp. El worker corre en el mismo
proceso, arrancado en el bootstrap del server con su propio `setInterval`
(ciclo cada 1 min, ver §7 para la lógica del ciclo — claim/envío/reintentos ya
diseñada ahí, no cambia por esta decisión de infra).

**Riesgo aceptado y su mitigación.** El ping es un workaround, no una garantía
— depende de un tercero. Si el servicio de pings falla, Render vuelve a
dormir la instancia y el fallo es silencioso hasta que un recordatorio no
sale. Mitigación obligatoria, no opcional: **activar alertas por downtime en
el servicio de ping** (disponibles gratis en UptimeRobot/cron-job.org, por
mail) — convierte el fallo silencioso en uno visible. Combinado con la
recuperación que ya tiene el worker (§7: todo lo que queda en `enviando` más
de 5 minutos vuelve a `pendiente`), una caída corta del pinger produce un
recordatorio tardío, no uno perdido. Sólo se pierde si la caída del pinger
dura más que el lead time del turno más próximo — con alertas activas, ese
escenario es detectable antes de que importe.

**No bloqueante, revisar si el proyecto escala:** si el volumen crece
significativamente o el approach de ping muestra problemas de confiabilidad
en producción, reabrir esta decisión — BullMQ/Redis pasa de sobre-ingeniería
a la opción correcta en ese escenario.



## 12. Alcance: qué entra y qué no

**Entra**

- Un servicio por turno
- Clientas sin registro
- Precios visibles en la web
- La clienta cancela sola hasta 24hs antes
- WhatsApp obligatorio, mail opcional
- Tres capas de horario + excepciones
- Cinco plantillas de mensaje

**No entra en esta versión**

| Fuera de alcance | Por qué |
|---|---|
| Reportes y analítica | Decisión de la clienta. El modelo los soporta sin migración: los snapshots y `ausente` separado de `cancelado` ya están. |
| Reprogramar desde el link | Implica recorrer todo el cálculo de disponibilidad desde la superficie pública. Lo hace el centro por WhatsApp. |
| Múltiples servicios por turno | No se habló con la clienta. Agregarlo después toca el algoritmo de disponibilidad entero. |
| Bandeja de mensajes entrantes | Es otro proyecto. Se cubre con autorespuesta. |
| Coexistencia de WhatsApp | Fase 2, con el sistema ya estable. |
| Seña con Mercado Pago | Candidato natural a segunda etapa. |

---

## 13. Pendientes

### Verificar antes de codear

- [ ] Si Twilio soporta coexistencia — define si la fase 2 es viable
- [ ] Normalización E.164 con el 9 argentino contra lo que espera Twilio
- [ ] Tarifario actual de Meta contra los USD 3–8/mes de la propuesta: son hasta 5 mensajes por turno y el volumen real puede quedar arriba de esa franja

- Cliente de envío de mail — el worker hoy filtra `canal:'whatsapp'` en el
  claim; las notificaciones `email` quedan `pendiente` sin que nadie las
  procese. WhatsApp es la prioridad (§1 de la propuesta), pero el mail
  también está prometido como canal, "opcional" del lado de la clienta
  (§clientes) pero no del sistema. Decidir el proveedor (§4 de la propuesta
  menciona un tier gratuito de hasta 100/día) antes de exponer a producción.

**Formato de `codigo` — DECISIÓN CERRADA.** `TRN-{año}-####` (ej.
`TRN-2026-0421`), no `TRN-####` a secas. El contador de 4 dígitos resetea
cada año — a 5-7 turnos/día (~2000-2500/año) el rango de 9000 nunca se
llena dentro de un año, y el prefijo evita que colisione en 4-5 años como
pasaría con un contador global. Sigue siendo decible por teléfono ("TRN
2026 cero cuatro dos uno"), que es el único requisito real del campo (§turnos:
"legible, para hablar por teléfono").

**Contador atómico en `configuracion`.** Campo nuevo `contadorTurnosPorAnio:
{ anio: number, ultimo: number }` en el singleton. Se incrementa con
`findOneAndUpdate` atómico dentro de la MISMA transacción del POST
/api/turnos (§15.1) — no una escritura aparte. Si `anio` guardado ≠ año
actual (calculado en `timezone` del centro, Luxon, nunca `Date.getFullYear()`
sobre UTC), resetea: `anio` pasa al actual, `ultimo` arranca en 1. Si
coincide, `ultimo += 1`. El código sale de `` `TRN-${anio}-${ultimo.toString().padStart(4,'0')}` ``.

**Por qué en `configuracion` y no un modelo propio.** Un `Counter` aparte es
una colección más a mantener por un solo campo. `configuracion` ya es el
singleton de estado global del centro (§4); el contador de turnos es
exactamente ese tipo de dato. Si en el futuro hicieran falta contadores para
otras entidades, se reevalúa extraerlo — no antes.

**Unicidad la sigue garantizando el índice** `{ codigo: 1 } unique` (§9), no
el contador. El contador evita colisiones en el camino feliz; el índice es
la defensa real contra una carrera (dos transacciones leyendo el mismo
`ultimo` antes de que la primera comitee) — ahí el segundo insert falla por
duplicado y hay que reintentar la generación del código dentro de la misma
transacción del turno (no reintentar la transacción entera, sólo regenerar
el código si el insert final da `E11000` sobre `codigo`).

### Espacio de códigos de turno — CERRADO E IMPLEMENTADO

Ver §4, campo `codigo` de `turnos`. `TRN-{año}-####` con contador atómico en
`configuracion`. Implementado el 12/08/2026 — detalle en §17.

### Definir con la clienta

Ordenados por urgencia. El primero es camino crítico.

1. **Número nuevo, Meta Business Manager a su nombre, cinco plantillas a aprobación.** Cuanto antes arranque, mejor: el tiempo de revisión no depende de nosotros.
2. **Son cinco mensajes, no cuatro.** El de rechazo/vencimiento no estaba en la propuesta. Falta definir qué dice, y si el precio va en el mensaje de confirmación.
3. **El mail va opcional.** Desvío chico pero real respecto del documento aprobado. Que quede consensuado por escrito.
4. **Hosting.** El plan gratuito de Render choca con el recordatorio de 24hs. Mejor plantearlo ahora que el día que un recordatorio no salga.
5. **Los $20.000.** La propuesta aprobada dice $700.000 en el texto y la tabla de cuotas suma $680.000. Resolverlo por escrito antes del segundo pago.
6. **Responsabilidad sobre los pendientes.** El vencimiento automático rechaza turnos si nadie responde. Conviene que lo sepa antes de que pase.

### Riesgos abiertos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Demora de Meta en aprobar plantillas | Bloquea la entrega | Arrancar el trámite ya. El canal mail queda funcional de punta a punta para entregar con mail solo si hace falta. |
| Render gratuito duerme la instancia | Rompe los recordatorios | Decidir infra del worker antes de la semana 3 |
| Costo real de Twilio sobre lo estimado | Número propio en documento aprobado | Revalidar contra tarifario antes de los primeros envíos |

- ~~Invalidar sesiones vivas al resetear password (admin)~~ — **CERRADO**,
  detalle en §17 (entrada del reset de password + rate limiter de login).

---

## 14. Estado de implementación

**Cerrado y testeado (server):**
- Algoritmo de disponibilidad (`calcularDisponibilidad`) + primitivas de
  intervalos. 5 tests.
- POST /api/turnos — transacción, solape, snapshots, precondiciones de
  catálogo, grilla por origen. 8 operaciones con `{ session }` verificadas.
- GET /api/disponibilidad + GET /api/servicios + GET /api/servicios/:id/profesionales.
  8 tests (margen hacia atrás, ventana fuera de política, catálogo inválido,
  no-fuga de campos internos).
- Infra de test: mongodb-memory-server + supertest, `vitest.config.ts` con
  alias `@shared`, `dbTestSetup.ts`.

**TODOs abiertos (no bloquean, marcados en código):**
- Espacio de códigos `TRN-####` — decisión propia pendiente (§13).

**Cerrado desde entonces:**
- **Autenticación del panel** (§16): sesiones server-side, cookie httpOnly
  (express-session + connect-mongo), argon2id con hash señuelo anti-timing,
  requireAuth/requireRol, ownership en la capa de servicio, seed idempotente
  del admin, rate limit en login.
- **Cinco transiciones de turno del panel** (§15.4/15.5): aprobar, rechazar,
  ausente, cancelar. `ejecutarTransicion` genérica (transacción + ownership +
  `findOneAndUpdate` filtrado por estado origen + encolado en la misma
  transacción). `RECORDATORIO_LEAD_HORAS` desacoplado de `cancelacionMinimaHoras`.
- **GET de turnos del panel** (§15.6): listado (`TurnoPanelLista`) + detalle
  (`TurnoPanel` canónico). Shape consolidado en un único mapper; las cinco
  transiciones lo reusan. Ownership asimétrico (filtro en listado, 403 en
  detalle). Ventana sin clamp inferior. Guardarraíl `.limit(1000)`.
- **Validador de horarios compartido** (§10): `horariosSchema({ nullable })`
  en `shared`, superRefine (null/[]/día-vacío/día-duplicado/hasta≤desde/solape)
  + transform de orden. Primitiva de intervalos extraída a `@shared/utils`,
  `solapan(a,b)` reusado por `pisaAlguno`. Instancias `horariosServicioSchema`/
  `Usuario`/`Config` bindeadas, sin CRUD todavía.
- **Namespace `/api/admin`** (§15.7): `requireAuth` + `requireRol('admin')`
  montado una vez en `adminRouter`, no repetido por ruta. Fija el patrón para
  todo el CRUD administrativo.
- **CRUD de servicios** (§15.7): `POST/GET/GET:id/PATCH` bajo
  `/api/admin/servicios`, sin DELETE (borrado lógico = `PATCH {activo:false}`).
  `ServicioPanel` con mapper único. Nombre único case-insensitive (`E11000` →
  `409 NOMBRE_DUPLICADO`, nunca el error crudo de Mongo). PATCH de `horarios`
  reemplaza el array entero. Desactivar/editar precio libres aunque haya
  turnos futuros — el snapshot los protege, no se valida contra ellos.
- **CRUD de configuración** (§15.8): singleton `_id:'centro'`, `GET/PATCH` sin
  POST (nace del seed). `editarConfiguracionSchema` parcial y `.strict()`:
  rechaza `timezone` (readonly, constante del sistema) y cualquier campo no
  declarado con `400 BODY_INVALIDO`, no en silencio. `horarios` vía
  `horariosConfigSchema` (nullable:**false** — a diferencia de servicios).
  `contacto.telefonoE164` normalizado server-side con la misma función del
  §10 antes de persistir. Seed idempotente de config junto al del admin
  (`scripts/seedAdmin.ts`), con placeholders para nombre/contacto/horarios.
- **CRUD de usuarios + "lo mío"** (§15.9): dos superficies separadas por gate,
  no una. `/api/admin/usuarios` (`requireRol('admin')`, cuelga de
  `adminRouter` como servicios/configuracion) — alta única vía, listar,
  detalle, editar (sin password), `POST .../reset-password`. `/api/mi/*`
  (`requireAuth`, router aparte) — perfil (sólo nombre), horarios y password
  propios, **sin `:id` en ninguna ruta**: el recurso sale siempre de
  `req.usuario.id`, elimina la clase de bug de ownership por construcción, no
  la valida en runtime. `UsuarioPanel` con mapper único (allowlist de campos,
  nunca `passwordHash`, verificado con test — mismo patrón que `tokenHash` en
  turnos). `editarUsuarioSchema`/`miPerfilSchema`/`misHorariosSchema` son
  `.strict()`: password en un PATCH de datos, o `rol`/`atiende`/`servicios`
  en `/api/mi/perfil`, dan `400 BODY_INVALIDO`, no se ignoran en silencio.
  `email` único (`E11000` → `409 EMAIL_DUPLICADO`). Desactivar con turnos
  futuros informa (`turnosFuturosActivos` en la respuesta), no bloquea.
- **CRUD de excepciones** (§15.10): `POST/GET/PATCH/DELETE` bajo
  `/api/admin/excepciones`. **Único recurso del sistema con DELETE físico**
  (`findByIdAndDelete`, no `activo:false`) — consciente, no un descuido: nada
  referencia una excepción por snapshot (§4), a diferencia de servicios/
  usuarios. `ExcepcionPanel` con mapper único. Listado por ventana solapada
  (`desde <= ventana.hasta && hasta >= ventana.desde`, cada mitad opcional),
  filtro por `profesionalId` trae las de ella + las del centro (`$in:
  [null, profId]`) — mismo criterio que disponibilidad (§5.1). Sin
  validación de solape entre excepciones (inocuo, sólo restan). El schema de
  Zod revalida `hasta > desde` cuando el PATCH trae los dos extremos; si sólo
  trae uno, el service revalida contra el documento existente antes de
  persistir. **Cierra el CRUD del panel completo.**

**Hallazgo de infra de test:** `autoIndex` no bloquea `mongoose.connect()` —
los índices (incluida la collation de `servicios.nombre`) pueden no existir
todavía en el primer insert de un test, dando falsos negativos en aserciones
de unicidad. Fix en `dbTestSetup.ts`: `await Promise.all(...models.map(m =>
m.init()))` tras conectar. Detalle en §11.

**Estado: CRUD del panel COMPLETO. 138 tests server + 10 shared verdes,
typecheck limpio en el monorepo.**

**Cerrado desde entonces:**
- **Worker de notificaciones — ciclo real** (§7, §11): `cicloWorker()` deja
  de ser un stub. Recuperación de `enviando` colgado, claim atómico
  (`findOneAndUpdate` de a una), revalidación del turno antes de enviar,
  envío mockeado vía `services/whatsapp.ts` (interfaz `ClienteWhatsApp`
  inyectable, reemplazable por Twilio real sin tocar el ciclo), reintentos
  con backoff 1/5/15/60min hasta `fallida` al 4to intento. Detalle completo
  en §17.
- **Fix: orden de `cancelarNotificacionesPendientes` en
  `encolarRechazo`/`encolarCancelacion`** (§7, "Orden obligatorio al
  transicionar con cancelación de pendientes"). El hallazgo de la entrada
  anterior (⚠ REVISAR EN WEB del 12/08/2026: la notificación recién creada
  se auto-cancelaba, ningún rechazo/cancelación llegaba a mandarse) ya está
  corregido — se invirtió el orden de dos líneas en cada función, cancelar
  antes de crear. Con test de regresión explícito por el estado, no sólo la
  cantidad. Detalle en §17.
- **Formato de código de turno** (§4/§13, DECISIÓN CERRADA): `TRN-{año}-####`
  con contador atómico `contadorTurnosPorAnio` en `configuracion`, generado
  dentro de la misma transacción del POST /api/turnos, con un reintento de
  último recurso ante colisión sobre el índice único. Cierra el TODO que
  quedaba abierto en `turnos.service.ts` desde el scaffolding inicial.
  Detalle en §17.
- **Twilio real conectado al worker** (§7, §8): `services/whatsapp.ts` ya no
  es sólo el mock — `crearClienteWhatsAppTwilio` arma el `contentVariables`
  posicional desde la `Plantilla` (resuelta por tipo+canal) y el `Turno`, y
  envía por `client.messages.create` con `contentSid`. Las 5 plantillas
  aprobadas por Meta sembradas en `plantillas` (`scripts/seedPlantillas.ts`,
  idempotente). El mock sigue existiendo para tests del worker. Detalle en
  §17.
- **CORS multi-origen** (§16, revisión "Dominios separados"): el `origin`
  fijo de `cors()` pasa a una función que valida contra una allowlist
  (`CORS_ORIGINS`, coma-separada; cae a `PANEL_ORIGIN` y de ahí al default
  de dev `:5173,:5174`). Cierra el ⚠ REVISAR EN WEB del scaffolding de
  `client-publico` — panel y web pública ya pueden convivir. No reabre
  `credentials`/`SameSite`. Detalle en §17.

---

## 15. Endpoints

### 15.1 POST /api/turnos — crear turno

Superficie pública con escritura y el único endpoint concurrency-critical.
Crea el turno en estado `pendiente` y encola su notificación de solicitud,
en una sola transacción.

**Body** (validado por `crearTurnoSchema`, §10):
`servicioId`, `profesionalId`, `inicio` (ISO UTC), `nombre`, `telefono`
(crudo), `email?`. Nada calculable viaja en el body (§3): precio, duración,
`fin` y `finBloqueo` los deriva el server.

**Precondiciones de catálogo (ambos orígenes).** Independientes de las cinco
capas de horario: validan el vínculo, no el tiempo. Leídas de la base, nunca
del body:
- `servicio` existe y `activo: true`.
- `profesional` existe, `activo: true` y `atiende: true`.
- `servicioId ∈ profesional.servicios`.
Si falla cualquiera ⇒ `400` (o `404` para distinguir "no existe" de
"combinación inválida"). NO tiene override de admin: agendar un servicio que
la profesional no presta es un dato incoherente, no una política flexible.

Ubicación: en la implementación quedaron DENTRO de la transacción, junto a la
lectura de profesional/servicio que alimenta los snapshots — se leen una sola
vez. Son invariantes durante el request (no cambian por concurrencia), así que
sacarlas afuera para no abrir transacción ante catálogo inválido es una
optimización posible pero deferible: al volumen real la diferencia es
despreciable. Sólo el solape requiere estar dentro por concurrencia.

**Concurrencia: transacción + relectura.** No hay índice de exclusión por
rango en Mongo (eso es Postgres `EXCLUDE`); el solape por rango arbitrario
no se expresa como unicidad. Se resuelve con transacción sobre replica set
(Atlas lo da en free tier):
1. Abrir transacción.
2. Releer turnos activos (`pendiente` + `confirmado`) de la profesional que
   solapen `[inicio, finBloqueo]`, con la regla `a.inicio < b.finBloqueo &&
   a.finBloqueo > b.inicio`.
3. Si hay conflicto ⇒ abortar, `409 SLOT_OCUPADO`.
4. Si no ⇒ upsert de cliente por teléfono normalizado, insertar turno
   `pendiente` + notificación `solicitud`, commit.

Todas las operaciones de la transacción (find de solape, find de excepciones,
upsert de cliente, insert de turno y de notificación) pasan `{ session }`. Una
operación sin la sesión lee/escribe fuera de la transacción y anula la garantía
de concurrencia en silencio.

**Respuesta 409:** además del error, devuelve la disponibilidad actualizada
de esa profesional para el día del `inicio` pedido. Reusa la relectura que ya
hizo la transacción — costo casi nulo — y ahorra al front un segundo
round-trip. Forma: `{ codigo: 'SLOT_OCUPADO', mensaje, detalle: { slots: Slot[] } }`.

**Validación de grilla según origen.** La grilla es política de presentación,
no conflicto real (§6):
- `origen: 'web'` ⇒ el `inicio` DEBE ser múltiplo de `pasoGrillaMin` anclado a
  medianoche local. Un fuera-de-grilla desde la web sólo puede venir de un
  request manipulado (la web nunca ofrece 09:07) ⇒ `400`. Valida las cinco
  capas de disponibilidad.
- `origen: 'admin'` ⇒ acepta cualquier `inicio` que no solape. Marca
  `fueraDeHorario: true`. Valida SÓLO el solape (conflicto real); las
  políticas (horarios, antelación, grilla) las puede pisar. Ese rango deja de
  ofrecerse a la próxima clienta.

En ambos casos el solape con otro turno NO se puede pisar. Nadie, ni el admin.

**Snapshots al crear** (§3): el turno congela `servicio` (precio, duración,
buffer) y `clienteSnapshot` (nombre, teléfono E164, email) leídos de la base
al momento de reservar.

**Cliente existente:** `$setOnInsert` en el upsert — un teléfono ya registrado
no pisa nombre/email en cada reserva. El `clienteSnapshot` del turno captura el
nombre de ESA reserva (resuelve madre/hija sobre el mismo teléfono, §clientes).
`clientes` es identidad estable; el snapshot es lo que varía por turno.

**tokenGestion:** se genera el token crudo (va en el link de WhatsApp), se
guarda sólo `tokenHash`. No se expone en la respuesta 201: es la única puerta
pública de escritura (§10), cuanto menos viaje mejor; la clienta recibe su link
por WhatsApp (lo arma el worker), no en el JSON. Rate limit por IP desde el día
uno (§10).
### 15.2 GET /api/disponibilidad — slots de una profesional

Read puro, sin transacción. Wrapper fino sobre `calcularDisponibilidad`
(§5.1): arma las entradas leyendo la base y delega el cálculo.

**Query params:** `servicioId` (req), `profesionalId` (req), `desde?`
(ISO date), `hasta?` (ISO date). La profesional viene siempre elegida —
disponibilidad es de UNA profesional (ver flujo abajo). El caso "cualquier
profesional" es fase 2: agregarlo obliga a devolver qué profesional queda
libre por slot y a resolverla en el POST. Fuera de alcance.

**Ventana:** `[desde, hasta]` se clampea en el server a
`[ahora + antelacionMinimaHoras, ahora + ventanaMaximaDias]`. Sin params ⇒
ventana completa. El front pide sólo el tramo que muestra (semana/mes) para
no traer 60 días ni castigar el CPU del free tier (§11).

**Precondiciones de catálogo** (mismas que §15.1, pero sin transacción por
ser read): `servicio` activo, `profesional` activo + atiende,
`servicioId ∈ profesional.servicios`. Combinación inválida ⇒ `400`. El front
no debería mandarla nunca (obtiene la profesional del endpoint de
profesionales); un inválido es manipulación o dato desactualizado.

**Query de turnos con margen hacia atrás.** Se traen turnos activos
(`pendiente` + `confirmado`) de la profesional con
`inicio >= inicioVentana − margen` **y** `inicio < hastaVentana`,
`margen = max(duracionMin + bufferPostMin)` sobre servicios activos. La cota
inferior con margen captura un turno cuyo `inicio` es previo a la ventana pero
cuyo `finBloqueo` cae dentro (no hay índice por `finBloqueo`, §9). La cota
superior es limpia en `hastaVentana`: un turno que empieza después del fin de
la ventana no puede ocupar nada dentro de ella. Sin la cota superior, la query
trae todos los turnos futuros de la profesional y el post-filtro los descarta —
correcto pero derrochador si el volumen crece. Índice
`{ profesionalId, estado, inicio }` cubre ambas cotas. `pisaAlguno` hace el
filtro fino. Excepciones: `profesionalId ∈ {null, profId}` que solapen la ventana.

Implementado como `inicio: { $gte: desdeEfectivo − margen, $lt: hastaEfectivo }`.
Verificado con test: turno de otro servicio (dur 60 + buffer 120), inicio 07:00,
finBloqueo 10:00 dentro de ventana 09:00–20:00 ⇒ bloquea 09:00 y 09:30, primer
slot libre 10:00. Ejercita el margen global (max sobre servicios activos, no el
pedido).

**Respuesta:** `{ slots: Slot[] }`, `Slot = { inicio, fin }` ISO UTC — misma
forma que `detalle.slots` del 409 (§15.1), el front la reusa. Lista plana; el
front agrupa por día local con Luxon. Intersección vacía por config mal
cargada ⇒ `{ slots: [] }` sin error (la advertencia es del panel, §5).

Rate limit por IP (read público, se pega en cada navegación de calendario).

### 15.3 Reads públicos de soporte

Completan el flujo servicio → profesional → horarios. Ambos read puro,
rate limit por IP.

**GET /api/servicios** — catálogo público. Servicios `activo: true` ordenados
por `orden`. Índice `{ activo, orden }`. Devuelve sólo lo público: `nombre`,
`descripcion`, `duracionMin`, `precio` (si `mostrarPrecio`), `_id`. Nunca
`horarios`, `buffer` ni campos internos.

**GET /api/servicios/:id/profesionales** — quiénes prestan el servicio.
Filtra `activo: true`, `atiende: true`, `servicios ∋ id`. Índice
`{ activo, atiende, servicios }`. Devuelve **sólo `_id` + `nombre`**. NUNCA
`email` ni `telefonoE164`: es superficie pública, exposición mínima.

### 15.4 Transiciones de turno desde el panel — aprobar / rechazar / ausente

Tres endpoints, uno por acción. No un genérico `PATCH /estado` con la acción
en el body: cada transición tiene precondición de estado, efecto colateral y
encolado distintos; un genérico los ramifica adentro con un switch y ensucia
el test. Separados, cada uno es una transición atómica.

- `POST /api/turnos/:id/aprobar`  — `pendiente → confirmado`
- `POST /api/turnos/:id/rechazar` — `pendiente → rechazado`
- `POST /api/turnos/:id/ausente`  — `confirmado → ausente`

(Cancelar desde el panel va aparte en §15.5: nace de `pendiente` O
`confirmado` — precondición `$in`, no valor único — y arrastra la ventana de
cancelación. No entra acá.)

**Auth:** las tres montan `requireAuth` + ownership en la capa de servicio
(§16). Profesional sólo opera turnos con `profesionalId === req.usuario._id`;
admin bypassa. Acá `verificarOwnershipTurno` deja de ser función suelta: el
test de integración verifica que la ruta rechaza al profesional ajeno con
`403 SIN_PERMISO`, no sólo la función pura.

**Transición atómica con estado esperado en el filtro (§3, §6).** Cada acción
es un `findOneAndUpdate` con el estado de origen en el filtro:

    aprobar:  { _id, estado: 'pendiente' }  → $set estado 'confirmado'
    rechazar: { _id, estado: 'pendiente' }  → $set estado 'rechazado'
    ausente:  { _id, estado: 'confirmado' } → $set estado 'ausente'

Si el filtro no matchea (el turno ya cambió de estado por otra vía —venció, lo
canceló la clienta, otro operario lo tomó), el update devuelve null ⇒
`409 ESTADO_INVALIDO` con el estado actual en el detalle. Nunca un update
ciego que pise una transición ajena. Empuja `historial` con
`{ estado, fecha, porTipo: 'usuario', porId: req.usuario._id }`.

**Encolado dentro de la misma transacción.** El cambio de estado y el insert
de su notificación van juntos, como en §15.1: nada se envía en el endpoint,
sólo se encola; el worker manda. Si el commit falla no queda un turno
confirmado sin notificación ni al revés.

- **aprobar** ⇒ transición + insert notificación `confirmacion` + (condicional)
  insert notificación `recordatorio_24h` programada para `inicio − 24h`.
- **rechazar** ⇒ transición + insert notificación `rechazo`. `porTipo: 'usuario'`
  distingue del vencimiento del sistema (§6): el texto es distinto.
- **ausente** ⇒ transición sola. No encola nada. Marca operativa interna.

**Recordatorio condicional al aprobar (§7).** Si al aprobar faltan menos de
`cancelacionMinimaHoras` (24h) para el `inicio`, la notificación de
recordatorio NO se crea. No se encola vencida ni para envío inmediato: no
existe. La condición se evalúa en el instante de aprobar, no al crear el turno.

**Cancelación de notificaciones pendientes.** Al rechazar, las notificaciones
del turno aún en estado `pendiente` (típicamente ninguna, porque `solicitud`
ya salió, pero defensa por las dudas) pasan a `cancelada` en la misma
transacción. Doble defensa junto a la relectura del worker (§7).

**Liberación del slot.** Rechazar y ausente sacan el turno de los estados que
ocupan agenda (`pendiente`+`confirmado`, §5.1). El horario vuelve a ofrecerse
sin acción extra: la query de disponibilidad ya filtra por estado. Aprobar
mantiene el slot ocupado (sigue en `confirmado`).

**Respuesta:** `200` con el turno actualizado (mismo shape público que el
resto del panel). `409 ESTADO_INVALIDO` si la precondición no matchea,
`403 SIN_PERMISO` por ownership, `404` si el turno no existe.

**Tests:**
- aprobar pendiente ⇒ confirmado + notificación confirmacion encolada.
- aprobar con `inicio` a <24h ⇒ confirmado SIN recordatorio; a >24h ⇒ CON.
- aprobar un turno ya confirmado ⇒ 409 ESTADO_INVALIDO (filtro no matchea).
- rechazar pendiente ⇒ rechazado + notificación rechazo, `porTipo: 'usuario'`.
- ausente sobre confirmado ⇒ ausente, sin notificación.
- ausente sobre pendiente ⇒ 409 (no es transición válida).
- ownership integración: profesional sobre turno ajeno ⇒ 403; admin ⇒ ok.
- rechazar libera el slot: disponibilidad vuelve a ofrecer ese horario.

**Notas de implementación 15.4 (cerrado, 30/30 tests):**
- Las tres transiciones comparten un `ejecutarTransicion` genérico (transacción
  + ownership + `findOneAndUpdate` filtrado por estado origen + encolado +
  commit) con tres wrappers finos. Tres rutas separadas se mantienen; sólo la
  maquinaria de transacción es compartida, para no triplicarla.
- `TurnoPanel` (shape de respuesta: id, codigo, estado, inicio/fin/finBloqueo,
  clienteSnapshot, profesional, servicio, origen, fueraDeHorario, historial —
  SIN tokenHash) quedó definido acá de forma provisional. **Es el shape
  canónico que fija el GET de panel (15.5+): reusar, no redefinir.**
- **Desacople del umbral de recordatorio:** el recordatorio_24h se crea sólo si
  faltan >= 24h, atado a la MISMA constante que su offset (`inicio - 24h`), NO a
  `cancelacionMinimaHoras`. Son knobs distintos que hoy coinciden en 24h; si la
  ventana de cancelación cambiara, el recordatorio no debe seguirla.


### 15.5 Cancelar turno desde el panel

`POST /api/turnos/:id/cancelar` — `pendiente | confirmado → cancelado`.

Consistente con §15.4 (requireAuth + ownership, transacción, transición atómica,
encolado en la misma transacción). Dos diferencias propias:

- **Precondición con `$in`:** filtro `{ _id, estado: { $in: ['pendiente',
  'confirmado'] } }`. Única transición del panel con dos estados de origen. Si
  no matchea (ya cancelado/rechazado/completado/ausente) → `409 ESTADO_INVALIDO`.
- **Sin ventana de cancelación.** `cancelacionMinimaHoras` (24h) restringe SÓLO
  a la clienta desde su link público (endpoint con token, futuro). El
  admin/profesional cancelan sin límite horario: es su agenda. Acá no se chequea.

**Efecto:**
- Transición a `cancelado`, historial `{ porTipo: 'usuario', porId, motivo? }`.
- Encola notificación `cancelacion`. **Transaccional**: sale aun con
  `cliente.optOut` (§clientes) — el opt-out sólo frena recordatorios.
- Pasa a `cancelada` las notificaciones del turno aún `pendiente`, **incluido el
  `recordatorio_24h`** programado al aprobar. Doble defensa con la relectura del
  worker (§7).
- Libera el slot (sale de los estados que ocupan agenda, §5.1).

**Body:** `motivo?` (string, opcional) → al historial. Nada más.

**Rechazar vs. cancelar:** rechazar es sólo desde `pendiente` (no confirmar una
solicitud); cancelar da de baja algo que ya existía, típicamente `confirmado`.
Mensajes distintos: `rechazo` ≠ `cancelacion`.

**Tests:**
- cancelar un pendiente → cancelado + notificación cancelacion.
- cancelar un confirmado con recordatorio_24h programado → cancelado; el
  recordatorio_24h pasa a `cancelada`.
- cancelar un turno ya cancelado/completado → 409 ESTADO_INVALIDO.
- ownership: profesional sobre turno ajeno → 403; admin → ok.
- notificación cancelacion se encola aun con cliente optOut:true (transaccional).
- libera el slot: disponibilidad vuelve a ofrecer ese horario.


**Notas de implementación 15.5 (cerrado, 49/49 tests):**
- `cancelarTurno` reusa `ejecutarTransicion`, generalizada a
  `estadoOrigen: EstadoTurno | EstadoTurno[]` (filtro `$in` cuando es array) +
  `motivo` opcional que viaja hasta el push de historial.
- `cancelarNotificacionesPendientes` extraído como helper compartido entre
  rechazar y cancelar (mismo comportamiento, deduplicado).
- Schema propio `cancelarTurnoPanelSchema` (panel, requireAuth) — distinto del
  `cancelarTurnoSchema` público por token que cancela la clienta desde su link
  (ese endpoint no existe todavía). No confundir.

**Deuda de test — rate limiter de login acoplado al harness.** ~~El límite de
login (10/15min) es global por instancia de `app`...~~ **CERRADO**, detalle en
§17 (misma entrada que la invalidación de sesión al resetear password).


### 15.6 GET de turnos del panel — listado + detalle

Dos endpoints, read puro, sin transacción. `requireAuth` + ownership.

- `GET /api/turnos`      — listado de filas (`TurnoPanelLista`)
- `GET /api/turnos/:id`  — detalle (`TurnoPanel` canónico, con historial)

Separados porque el listado NO arrastra `historial` (lo más pesado del
shape, invisible en la fila). Click en fila del panel → detalle.

**Shape canónico consolidado.** `TurnoPanel` (definido provisional en §15.4)
queda fijado acá SIN cambios salvo el agregado de `expiraEn`. Es la respuesta
del detalle y de las transiciones (§15.4/15.5). NO redefinir en endpoints
futuros: reusar.

    TurnoPanel = {
      id, codigo, estado,
      inicio, fin, finBloqueo,       // ISO UTC
      expiraEn: Date | null,         // sólo poblado en pendiente; null en el resto
      clienteSnapshot: { nombre, telefonoE164, email? },
      profesional: { id, nombre },
      servicio: { servicioId, nombre, duracionMin, bufferPostMin, precio },
      origen, fueraDeHorario,
      historial: [{ estado, fecha, porTipo, porId?, motivo? }]
      // NUNCA tokenHash. NUNCA clientes.notas (no vive en el snapshot; §clientes).
    }

`TurnoPanelLista` (fila) = mismo shape, **sin `historial`** y con nested
recortado (mismos nombres de key para mapeo uniforme del front):

    TurnoPanelLista = {
      id, codigo, estado,
      inicio, fin, finBloqueo,
      expiraEn: Date | null,
      clienteSnapshot: { nombre, telefonoE164 },   // sin email
      profesional: { id, nombre },
      servicio: { nombre, duracionMin, precio },   // sin servicioId ni buffer
      origen, fueraDeHorario
    }

`telefonoE164` va en la fila: el operador llama a la clienta desde el listado.
`bufferPostMin`/`servicioId`/`email` sólo en el detalle. `tokenHash` en ninguno.

**Filtros (query params, todos opcionales):**
- `estado`: `$in` de estados. Default: sin filtro (todos). La cola de acción
  llama `?estado=pendiente`.
- `desde` / `hasta` (ISO date): rango sobre `inicio`. Default
  `[hoy 00:00 local, hoy + ventanaMaximaDias]`. `desde > hasta` ⇒ `400`.
- `profesionalId`: sólo lo honra el admin. Ver ownership.

**Sin clamp inferior a `ahora`** — a diferencia de disponibilidad (§15.2).
El panel muestra histórico legítimamente: `desde` en el pasado se respeta.

**Orden:** `inicio` asc, desempate `_id` asc (determinístico). La urgencia de
pendientes (`expiraEn` asc) la resuelve el front sobre el set filtrado por
`estado=pendiente` — chico. No hay `orden` param.

**Paginación: ninguna. La ventana ES la cota.** El panel pide la semana/mes que
renderiza. Guardarraíl `.limit(1000)`; a este volumen no se dispara. Si se
disparara, es señal de revisar con cursor, no de recortar en silencio.

**Ownership — asimétrico entre listado y detalle:**
- Listado: **filtro, no 403.** Profesional ⇒ se fuerza
  `profesionalId = req.usuario._id`, ignorando el query param. Admin ⇒
  `profesionalId` opcional; sin él, ve todo.
- Detalle: **403 SIN_PERMISO** si el profesional pide un turno ajeno (acceso a
  recurso, mismo criterio que §15.4). `404` si no existe.

**Índices y trade-off aceptado.** Las llamadas CON filtro de estado usan
`{ estado, inicio }` (admin) y `{ profesionalId, estado, inicio }` (profesional).
La llamada "todos los estados en una ventana" no tiene índice con `inicio` de
prefijo ⇒ scan acotado por la ventana. A 2–6 usuarios y decenas de turnos/semana
es despreciable: NO se agrega índice en v1 (medir antes de asumir, §11). Si
perfilás y molesta: `{ inicio: 1 }` + `{ profesionalId: 1, inicio: 1 }`.

**Fuera de alcance (fase 2):** histórico de una clienta por teléfono ⇒ va por
`{ clienteId, inicio: -1 }`, endpoint aparte. No se mezcla con este listado.

**Tests:**
- admin sin filtros ⇒ ventana default, todos los estados, orden inicio asc.
- `estado=pendiente` ⇒ sólo pendientes, `expiraEn` poblado.
- profesional ⇒ sólo sus turnos aunque pase `profesionalId` de otro (filtro forzado).
- `desde` explícito en el pasado ⇒ devuelve históricos (sin clamp a ahora).
- `desde > hasta` ⇒ 400.
- fila no filtra email / bufferPostMin / servicioId / tokenHash (no-fuga).
- detalle ⇒ `TurnoPanel` completo con historial, sin tokenHash.
- detalle de turno ajeno por profesional ⇒ 403; admin ⇒ ok.

### 15.7 CRUD administrativo — namespace y servicios

**Namespace `/api/admin/*` para todo el CRUD administrativo** (servicios,
usuarios, excepciones, configuracion). `requireRol('admin')` montado una vez
en el router del namespace, no repetido por ruta. Fija el patrón para los
bloques que siguen.

Motiva la separación una colisión real: `GET /api/servicios` público (§15.3)
devuelve sólo `activo:true` + campos públicos; el panel necesita todos los
servicios (incl. inactivos) con todos los campos. Mismo método, shape
incompatible. Ramificar por presencia de sesión ensucia el test y arriesga
fuga de campos internos. Superficies separadas por prefijo.

**Inconsistencia consciente con turnos-panel.** El panel de turnos vive en
`/api/turnos` (§15.6), NO en `/api/admin`. Turnos-panel no colisiona (no hay
GET público de turnos, sólo POST); servicios sí. La línea: un recurso va a
`/api/admin` cuando su CRUD colisiona con una superficie pública del mismo
método. No se reabre §15.6 para moverlo. Excepción a tener presente cuando se
arme el CRUD de usuarios: **editar horarios propios NO es admin-only** (§16),
así que esa ruta puntual no cae bajo `/api/admin` — va aparte con
`requireAuth` + ownership.

**Endpoints de servicios** (todos `requireRol('admin')`):
- `POST   /api/admin/servicios`      — crear
- `GET    /api/admin/servicios`      — listar todos, incl. inactivos
- `GET    /api/admin/servicios/:id`  — uno, todos los campos (form de edición)
- `PATCH  /api/admin/servicios/:id`  — editar parcial (incluye `activo`)

**Sin DELETE.** Borrado lógico = `PATCH { activo: false }` (§4). Reactivar =
`PATCH { activo: true }`. Un solo mecanismo; un DELETE que hace soft-delete
miente y duplica el camino de reactivación.

**`ServicioPanel` (shape de respuesta del CRUD):** todos los campos del modelo
(§4) — `id, nombre, descripcion?, duracionMin, bufferPostMin, precio,
mostrarPrecio, horarios, orden, activo, creadoEn, actualizadoEn`. Distinto del
shape público (§15.3), que recorta a `nombre/descripcion/duracionMin/precio`.

**Crear (`crearServicioSchema`, Zod compartido):**
`nombre` (min 2), `duracionMin` (int > 0), `bufferPostMin` (int ≥ 0), `precio`
(int ≥ 0, centavos — §3), `mostrarPrecio` (bool), `horarios`
(`horariosServicioSchema`, nullable — §10), `descripcion?`, `orden` (int).
Nada calculable ni derivable en el body. `activo` no se acepta al crear:
nace `true`.

**Nombre único case-insensitive.** Índice `{ nombre: 1 } unique collation
strength 2` (§9). El insert que colisiona lanza `E11000` ⇒ se mapea a
`409 NOMBRE_DUPLICADO` con la forma de error fija (§3); NUNCA se filtra el
error crudo de Mongo. **Verificar que el índice real se creó CON la collation:**
sin ella el unique es case-sensitive y "Uñas"/"uñas" pasan ambas.

**Editar (`editarServicioSchema`):** todos los campos opcionales (PATCH
parcial). `activo` editable acá (borrado lógico + reactivación).
- Si el body trae `horarios`, **reemplaza el array entero** — sin merge por
  día. Merge parcial sería sorprendente. Reemplazo total es la regla.
- El mismo mapeo `E11000 → 409 NOMBRE_DUPLICADO` aplica al renombrar.

**Desactivar y editar precio son libres, aunque el servicio tenga turnos
futuros.** Los turnos congelaron su snapshot al reservar (§3): desactivar no
los toca, sólo saca el servicio del catálogo público; editar el precio no
reescribe turnos viejos. NO se valida contra turnos futuros — la advertencia
"tiene N turnos futuros" es UI del panel, no del server.

**Tests:**
- crear válido ⇒ 201 `ServicioPanel` completo, `activo:true`.
- crear con nombre duplicado (distinta capitalización) ⇒ 409 NOMBRE_DUPLICADO.
- crear con horarios solapados ⇒ 400 (validador §10).
- crear con `horarios:null` ⇒ ok (nullable:true).
- listar admin ⇒ incluye inactivos (a diferencia del público §15.3).
- GET :id inexistente ⇒ 404.
- PATCH sólo `precio` ⇒ cambia precio, no toca resto.
- PATCH `horarios` ⇒ reemplaza el array entero (no merge).
- PATCH `activo:false` ⇒ borrado lógico; el público (§15.3) deja de listarlo;
  un turno futuro con snapshot del servicio sigue intacto.
- PATCH `activo:true` sobre inactivo ⇒ reactiva.
- profesional (no admin) sobre cualquier ruta del namespace ⇒ 403.

### 15.8 CRUD administrativo — configuración (singleton)

Bajo `/api/admin` (§15.7), `requireRol('admin')`. Singleton `_id: 'centro'`
(§4): GET + PATCH, sin POST — nace del seed.

- `GET   /api/admin/configuracion`  — leer el singleton completo
- `PATCH /api/admin/configuracion`  — editar parcial

**Seed idempotente**, junto al del admin (§16). Crea el singleton con los
defaults numéricos del §4 (`pasoGrillaMin:30`, `antelacionMinimaHoras:3`,
`ventanaMaximaDias:60`, `cancelacionMinimaHoras:24`,
`vencimientoPendienteHoras:12`) + `timezone` fijo; `nombre`/`contacto`/
`horarios` con placeholders que Camila completa por PATCH. `$setOnInsert` —
si ya existe no lo pisa. El GET asume que existe (lo garantiza el seed); si
falta ⇒ error de operación, NO se auto-crea en el GET (escondería un seed no
corrido).

**`timezone` es readonly — constante del sistema, no config de negocio.**
Todo el modelo asume `America/Argentina/Buenos_Aires`: la semántica de los
`'HH:mm'` locales, el día de la semana en disponibilidad, el anclaje de grilla
a medianoche local. Editarlo en runtime reinterpreta todos los `'HH:mm'` ya
guardados y desalinea la grilla contra los turnos existentes. **Fuera del
schema de PATCH; se rechaza explícito si viene** (no se ignora en silencio: el
admin creería que lo cambió). `editarConfiguracionSchema` es `.strict()` ⇒
rechaza `timezone` y cualquier campo no declarado (form controlado).

**Editar políticas afecta turnos NUEVOS, no recalcula los existentes.**
`pasoGrillaMin`, `vencimientoPendienteHoras`, `antelacionMinimaHoras`
cambiados aplican de ahí en más. Los pendientes ya congelaron `expiraEn`, los
confirmados su `inicio` — no se recalculan (mismo principio de snapshot que
precio en servicios, §3). Achicar `horarios` del centro tampoco cancela un
turno confirmado que quede fuera del nuevo techo: el snapshot lo protege, sólo
deja de ofrecerse ese rango a nuevas clientas. **No se valida contra turnos
futuros.**

**Campos editables (`editarConfiguracionSchema`, parcial, `.strict()`):**
- `nombre` (min 2)
- `horarios` ⇒ `horariosConfigSchema` (nullable:**false**, §10). Reemplazo
  entero, sin merge por día.
- `pasoGrillaMin` (int ≥ 5 — sin forzar divisibilidad), `antelacionMinimaHoras`
  (int ≥ 0), `ventanaMaximaDias` (int ≥ 1), `cancelacionMinimaHoras` (int ≥ 0),
  `vencimientoPendienteHoras` (int ≥ 1).
- `contacto` ⇒ sub-objeto `{ telefonoE164, email, direccion }`. Si viene, se
  valida y reemplaza completo (consistente con horarios: "si viene, pisa").
  `telefonoE164` se normaliza con la regla del §10 (libphonenumber-js server-
  side) — es el teléfono del link de cancelación vencido, debe ser E164 válido.
- `timezone` ⇒ NO (readonly, ver arriba).

**`ConfiguracionPanel` (respuesta):** el doc completo. Sin superficie pública
⇒ sin recorte de campos (todo admin). Config no se expone al público: el
front público consume `/api/disponibilidad` (cálculo server-side), no la
config cruda. (Si el header público llegara a necesitar `nombre`, es un GET
público mínimo aparte — fuera de este bloque.)

**Sin transacción.** Documento único, `findOneAndUpdate` atómico. Last-write-
wins aceptable a 2-6 admins.

**Tests:**
- GET tras seed ⇒ 200 singleton completo con defaults.
- PATCH `nombre` ⇒ cambia sólo nombre.
- PATCH `pasoGrillaMin` ⇒ cambia sólo eso, no toca horarios ni contacto.
- PATCH `horarios` con solape ⇒ 400 (validador §10).
- PATCH `horarios:null` ⇒ 400 (config es nullable:false).
- PATCH `timezone` presente ⇒ 400 (`.strict()` lo rechaza).
- PATCH `contacto` con telefonoE164 inválido ⇒ 400 (normalización §10).
- PATCH `pasoGrillaMin: 2` (< 5) ⇒ 400.
- profesional (no admin) ⇒ 403.
### 15.9 CRUD de usuarios + superficie "lo mío"

Dos superficies separadas por gate, no una:

- **CRUD de usuarios** → `/api/admin/usuarios`, `requireRol('admin')`. Alta,
  editar rol/atiende/servicios/nombre, activar/desactivar, reset de password.
- **"Lo mío"** → `/api/mi/*`, `requireAuth` (no admin). Perfil, horarios y
  password propios. **Sin `:id` en la URL — el recurso se deriva de
  `req.usuario._id`, nunca del path.** No existe la ruta donde una profesional
  pase el `:id` de otra; elimina la clase de bug de ownership por construcción.

**Endpoints admin** (`requireRol('admin')`):
- `POST  /api/admin/usuarios`                 — alta (única vía, no auto-registro)
- `GET   /api/admin/usuarios`                 — listar todos, incl. inactivos
- `GET   /api/admin/usuarios/:id`             — uno (form de edición)
- `PATCH /api/admin/usuarios/:id`             — editar (NO password, NO email-sin-cuidado)
- `POST  /api/admin/usuarios/:id/reset-password` — admin resetea

**Endpoints "lo mío"** (`requireAuth`, recurso = sesión):
- `GET   /api/mi/perfil`     — mis datos
- `PATCH /api/mi/perfil`     — nombre (NO rol/atiende/servicios)
- `PATCH /api/mi/horarios`   — mis horarios
- `POST  /api/mi/password`   — cambiar la mía (requiere la actual)

**Password nunca en el canal de datos.** Un PATCH de usuario NO acepta
`password` en el body. Operaciones dedicadas:
- `POST /api/admin/usuarios/:id/reset-password`: el admin pone una nueva (no
  requiere la vieja); se comunica por fuera (sin mail de reset en v1, §16).
- `POST /api/mi/password`: la profesional cambia la suya; **requiere la actual**
  (`argon2.verify` antes de pisar). Admin reseteando: sin la vieja. Dueña
  cambiando la suya: con la vieja.
`passwordHash` NUNCA en una respuesta. `UsuarioPanel` lo omite en el mapper
(como `tokenHash` en turnos).

**`UsuarioPanel` (respuesta):** `id, nombre, email, rol, atiende, servicios,
horarios, telefonoE164?, activo, creadoEn, actualizadoEn`. Sin `passwordHash`.

**Alta (`crearUsuarioSchema`):** `nombre` (min 2), `email` (válido),
`password` (inicial, min 8), `rol` (enum), `atiende` (bool), `servicios`
(ObjectId[]), `horarios` (`horariosUsuarioSchema`, nullable:**false**, §10),
`telefonoE164?` (normalizado §10). Los ObjectId de `servicios` NO se validan
contra existencia: un id inexistente es inocuo (no se ofrece); validarlo es
round-trip por poco. `activo` no se acepta al crear: nace `true`.

**Editar admin (`editarUsuarioSchema`, parcial, `.strict()`):** `nombre`,
`email`, `rol`, `atiende`, `servicios`, `horarios`, `telefonoE164`, `activo`.
NO `password` (canal aparte). Si viene `horarios`/`servicios`, reemplazo
entero.

**`email` editable pero es identidad de login.** Índice `{ email:1 } unique`
(§9) = credencial de acceso. Colisión ⇒ `E11000 → 409 EMAIL_DUPLICADO`, forma
fija, nunca el error crudo. **Consecuencia a avisar en el panel (UI):** cambiar
el email cambia con qué se loguea esa profesional. No se bloquea; se informa.

**Desactivar profesional con turnos futuros — se informa, NO se bloquea.**
Diferencia con servicios (§15.7): un servicio inactivo sólo deja de ofrecerse;
una profesional inactiva con turnos confirmados futuros deja turnos en pie que
ya no puede gestionar desde el panel. No es problema de integridad (el turno
vive de su snapshot) sino operativo. El PATCH `activo:false` devuelve en la
respuesta `turnosFuturosActivos: number` (conteo de pendiente+confirmado con
`inicio > ahora` de esa profesional) para que el panel advierta "tiene N
turnos, reasignalos o cancelalos". La acción es de la dueña, no del sistema.
Reasignar a otra profesional es fase 2 (toca disponibilidad); en v1 la salida
es cancelar y reagendar por WhatsApp. **Descartado: bloquear la desactivación
hasta cero turnos futuros** — deja a la dueña sin poder desactivar a alguien
que renunció sin antes cancelar todo a mano. Informar > bloquear.

**`rol`/`atiende`/`servicios` son admin-only aunque sean "míos".** `/api/mi/*`
sólo toca nombre, horarios y password. Rol/atiende/servicios son política del
centro, no preferencia personal: una profesional que editara sus `servicios`
se habilita trabajos que no hace. `atiende:false` (admin) la saca del selector
público sin tocar rol ni turnos existentes — "no toma turnos nuevos pero
sigue", más suave que desactivar la cuenta.

**`usuario.servicios` puede referenciar servicios desactivados.** No se limpia
en cascada (borrado lógico, §4). El endpoint público de profesionales (§15.3)
ya filtra por servicio activo ⇒ un servicio inactivo en la lista de alguien
simplemente no se ofrece. No es bug, no requiere acción.

**Sin transacción** en el CRUD (documentos únicos por operación, unicidad por
índice). El reset y el cambio de password tampoco: un solo `findOneAndUpdate`.

**Tests:**
- alta válida ⇒ 201 `UsuarioPanel`, `activo:true`, sin `passwordHash`.
- alta con email duplicado (case-insensitive si aplica) ⇒ 409 EMAIL_DUPLICADO.
- alta con horarios solapados ⇒ 400 (validador §10); `horarios:null` ⇒ 400
  (nullable:false).
- PATCH admin con `password` en el body ⇒ rechazado (`.strict()`, 400).
- PATCH admin `email` a uno existente ⇒ 409 EMAIL_DUPLICADO.
- PATCH admin `activo:false` sobre profesional con 2 turnos futuros ⇒ 200 +
  `turnosFuturosActivos: 2`.
- reset-password (admin) ⇒ 200; la profesional loguea con la nueva, no la vieja.
- `/api/mi/password` sin la actual correcta ⇒ 401/403; con la correcta ⇒ 200.
- `/api/mi/perfil` PATCH con `rol` en el body ⇒ rechazado (no editable acá).
- `/api/mi/horarios` ⇒ edita los propios; no hay forma de tocar los de otra
  (sin `:id`).
- profesional sobre cualquier `/api/admin/usuarios/*` ⇒ 403.
- ninguna respuesta incluye `passwordHash`.### 15.9 CRUD de usuarios + superficie "lo mío"

Dos superficies separadas por gate, no una:

- **CRUD de usuarios** → `/api/admin/usuarios`, `requireRol('admin')`. Alta,
  editar rol/atiende/servicios/nombre, activar/desactivar, reset de password.
- **"Lo mío"** → `/api/mi/*`, `requireAuth` (no admin). Perfil, horarios y
  password propios. **Sin `:id` en la URL — el recurso se deriva de
  `req.usuario._id`, nunca del path.** No existe la ruta donde una profesional
  pase el `:id` de otra; elimina la clase de bug de ownership por construcción.

**Endpoints admin** (`requireRol('admin')`):
- `POST  /api/admin/usuarios`                 — alta (única vía, no auto-registro)
- `GET   /api/admin/usuarios`                 — listar todos, incl. inactivos
- `GET   /api/admin/usuarios/:id`             — uno (form de edición)
- `PATCH /api/admin/usuarios/:id`             — editar (NO password, NO email-sin-cuidado)
- `POST  /api/admin/usuarios/:id/reset-password` — admin resetea

**Endpoints "lo mío"** (`requireAuth`, recurso = sesión):
- `GET   /api/mi/perfil`     — mis datos
- `PATCH /api/mi/perfil`     — nombre (NO rol/atiende/servicios)
- `PATCH /api/mi/horarios`   — mis horarios
- `POST  /api/mi/password`   — cambiar la mía (requiere la actual)

**Password nunca en el canal de datos.** Un PATCH de usuario NO acepta
`password` en el body. Operaciones dedicadas:
- `POST /api/admin/usuarios/:id/reset-password`: el admin pone una nueva (no
  requiere la vieja); se comunica por fuera (sin mail de reset en v1, §16).
- `POST /api/mi/password`: la profesional cambia la suya; **requiere la actual**
  (`argon2.verify` antes de pisar). Admin reseteando: sin la vieja. Dueña
  cambiando la suya: con la vieja.
`passwordHash` NUNCA en una respuesta. `UsuarioPanel` lo omite en el mapper
(como `tokenHash` en turnos).

**`UsuarioPanel` (respuesta):** `id, nombre, email, rol, atiende, servicios,
horarios, telefonoE164?, activo, creadoEn, actualizadoEn`. Sin `passwordHash`.

**Alta (`crearUsuarioSchema`):** `nombre` (min 2), `email` (válido),
`password` (inicial, min 8), `rol` (enum), `atiende` (bool), `servicios`
(ObjectId[]), `horarios` (`horariosUsuarioSchema`, nullable:**false**, §10),
`telefonoE164?` (normalizado §10). Los ObjectId de `servicios` NO se validan
contra existencia: un id inexistente es inocuo (no se ofrece); validarlo es
round-trip por poco. `activo` no se acepta al crear: nace `true`.

**Editar admin (`editarUsuarioSchema`, parcial, `.strict()`):** `nombre`,
`email`, `rol`, `atiende`, `servicios`, `horarios`, `telefonoE164`, `activo`.
NO `password` (canal aparte). Si viene `horarios`/`servicios`, reemplazo
entero.

**`email` editable pero es identidad de login.** Índice `{ email:1 } unique`
(§9) = credencial de acceso. Colisión ⇒ `E11000 → 409 EMAIL_DUPLICADO`, forma
fija, nunca el error crudo. **Consecuencia a avisar en el panel (UI):** cambiar
el email cambia con qué se loguea esa profesional. No se bloquea; se informa.

**Desactivar profesional con turnos futuros — se informa, NO se bloquea.**
Diferencia con servicios (§15.7): un servicio inactivo sólo deja de ofrecerse;
una profesional inactiva con turnos confirmados futuros deja turnos en pie que
ya no puede gestionar desde el panel. No es problema de integridad (el turno
vive de su snapshot) sino operativo. El PATCH `activo:false` devuelve en la
respuesta `turnosFuturosActivos: number` (conteo de pendiente+confirmado con
`inicio > ahora` de esa profesional) para que el panel advierta "tiene N
turnos, reasignalos o cancelalos". La acción es de la dueña, no del sistema.
Reasignar a otra profesional es fase 2 (toca disponibilidad); en v1 la salida
es cancelar y reagendar por WhatsApp. **Descartado: bloquear la desactivación
hasta cero turnos futuros** — deja a la dueña sin poder desactivar a alguien
que renunció sin antes cancelar todo a mano. Informar > bloquear.

**`rol`/`atiende`/`servicios` son admin-only aunque sean "míos".** `/api/mi/*`
sólo toca nombre, horarios y password. Rol/atiende/servicios son política del
centro, no preferencia personal: una profesional que editara sus `servicios`
se habilita trabajos que no hace. `atiende:false` (admin) la saca del selector
público sin tocar rol ni turnos existentes — "no toma turnos nuevos pero
sigue", más suave que desactivar la cuenta.

**`usuario.servicios` puede referenciar servicios desactivados.** No se limpia
en cascada (borrado lógico, §4). El endpoint público de profesionales (§15.3)
ya filtra por servicio activo ⇒ un servicio inactivo en la lista de alguien
simplemente no se ofrece. No es bug, no requiere acción.

**Sin transacción** en el CRUD (documentos únicos por operación, unicidad por
índice). El reset y el cambio de password tampoco: un solo `findOneAndUpdate`.

**Tests:**
- alta válida ⇒ 201 `UsuarioPanel`, `activo:true`, sin `passwordHash`.
- alta con email duplicado (case-insensitive si aplica) ⇒ 409 EMAIL_DUPLICADO.
- alta con horarios solapados ⇒ 400 (validador §10); `horarios:null` ⇒ 400
  (nullable:false).
- PATCH admin con `password` en el body ⇒ rechazado (`.strict()`, 400).
- PATCH admin `email` a uno existente ⇒ 409 EMAIL_DUPLICADO.
- PATCH admin `activo:false` sobre profesional con 2 turnos futuros ⇒ 200 +
  `turnosFuturosActivos: 2`.
- reset-password (admin) ⇒ 200; la profesional loguea con la nueva, no la vieja.
- `/api/mi/password` sin la actual correcta ⇒ 401/403; con la correcta ⇒ 200.
- `/api/mi/perfil` PATCH con `rol` en el body ⇒ rechazado (no editable acá).
- `/api/mi/horarios` ⇒ edita los propios; no hay forma de tocar los de otra
  (sin `:id`).
- profesional sobre cualquier `/api/admin/usuarios/*` ⇒ 403.
- ninguna respuesta incluye `passwordHash`.

### 15.10 CRUD administrativo — excepciones

Bajo `/api/admin` (§15.7), `requireRol('admin')`. Cierra el CRUD del panel.
Sin superficie "mía": en v1 la dueña carga las excepciones de todos
(feriados del centro, vacaciones/bloqueos por profesional). Auto-gestión de
licencias por la profesional ⇒ candidato fase 2.

- `POST   /api/admin/excepciones`      — crear
- `GET    /api/admin/excepciones`      — listar (filtro por rango, ver abajo)
- `PATCH  /api/admin/excepciones/:id`  — editar (rango, motivo, tipo)
- `DELETE /api/admin/excepciones/:id`  — **borrado FÍSICO** (ver abajo)

**DELETE físico — única excepción consciente a "borrado no existe" (§4).**
§4 prohíbe el borrado en recursos REFERENCIADOS por snapshots (servicios,
usuarios: los turnos congelan sus datos). Una excepción NO es referenciada por
ningún turno — es un filtro efímero sobre disponibilidad ("del 10 al 20 no
atiendo"). Cargada por error o ya pasada, borrarla de verdad es correcto: no
rompe integridad de nada, y `activo:false` sólo dejaría basura permanente que
la query de disponibilidad tendría que filtrar para siempre. Es el ÚNICO
recurso con DELETE físico, y lo es precisamente porque nada lo referencia —
cumple §4, no lo contradice.

**Rango `desde`/`hasta` como Date UTC ya armado desde el panel (§4).** Sin
campo `todoElDia`: el panel construye el rango 00:00–23:59 local y lo manda
como dos ISO UTC. El schema recibe dos ISO UTC, valida `hasta > desde`. La
conversión local→UTC es del front — **mismo contrato que el `inicio` de
turnos: `.toUTC().toISO()`, NUNCA offset** (`z.string().datetime()` rechaza
formato con offset). Tercer punto del sistema con este contrato (turnos,
listado de panel, excepciones); dejarlo escrito en el front una vez.

**`crearExcepcionSchema`:** `profesionalId?` (nullable — `null`/ausente = todo
el centro, §4; si viene, regex hex, NO se valida existencia — un id inexistente
da una excepción que no aplica a nadie, inocuo), `desde` (ISO UTC), `hasta`
(ISO UTC, `> desde`), `tipo` (enum `feriado|vacaciones|bloqueo`), `motivo?`.
`creadoPor` lo pone el server desde `req.usuario._id`, no el body.

**`editarExcepcionSchema`:** parcial, `.strict()`. `desde`/`hasta`/`motivo`/
`tipo`/`profesionalId`. Si cambia el rango, revalida `hasta > desde` sobre el
resultado.

**Solape entre excepciones: NO se valida.** Dos excepciones que se pisan son
redundantes pero inofensivas — las excepciones sólo restan (§5, monótono);
restar dos veces el mismo rango = restarlo una. Contraste con horarios (§10),
donde el solape SÍ se valida porque ahí es señal de error de carga; acá no
tiene consecuencia. No se gasta validación en prevenir algo inocuo.

**Listado con filtro por rango.** Query `desde?`/`hasta?` (ISO UTC) +
`profesionalId?`. Devuelve excepciones que solapan la ventana pedida, para que
el panel traiga "las de este mes" sin el histórico entero. Sin params ⇒ todas.
Apoyado en `{ profesionalId, hasta, desde }` (§9). Filtro por `profesionalId`:
si se pasa, trae las de esa profesional Y las del centro (`null`) — son las que
la afectan (`$in: [null, profId]`), mismo criterio que disponibilidad (§5.1).

**`ExcepcionPanel` (respuesta):** `id, profesionalId, desde, hasta, tipo,
motivo?, creadoPor, creadoEn`. Admin-only, sin recorte.

**Sin transacción.** Documentos independientes, una operación por request.

**Tests:**
- crear feriado del centro (`profesionalId:null`) ⇒ 201.
- crear bloqueo de una profesional (`profesionalId` hex) ⇒ 201.
- crear con `hasta <= desde` ⇒ 400.
- crear con `profesionalId` malformado (no hex) ⇒ 400 (no un 500 por CastError).
- listar con ventana ⇒ sólo las que solapan; sin params ⇒ todas.
- listar con `profesionalId` ⇒ las de ella + las del centro (null).
- PATCH rango ⇒ revalida `hasta > desde`.
- DELETE ⇒ el documento desaparece físicamente (no `activo:false`); un GET
  posterior no lo trae.
- una excepción borrada deja de restar en disponibilidad (el horario vuelve).
- profesional (no admin) sobre cualquier ruta ⇒ 403.


## 16. Autenticación del panel

**Sesiones server-side con cookie httpOnly, no JWT.** A esta escala (2-6 usuarios) el statelessness no aporta. La sesión da lo que importa acá: revocación instantánea vía `activo:false`, sin token en JS (XSS), y Render dormido es irrelevante porque la sesión vive en Mongo, no en el proceso.

**Store en Mongo (connect-mongo), no Redis.** No se suma infra: Redis todavía es decisión abierta del worker (§11) y la sesión no lo justifica sola. Si más adelante entra Redis por BullMQ, se mueve.

**La sesión guarda sólo `usuarioId`.** `rol`, `activo` y `atiende` se releen del documento en cada request. Storear el rol lo vuelve stale tras un cambio; releer es un findById indexado y da revocación y cambio de rol al instante.

**Cookie:** httpOnly, Secure, SameSite=Lax, firmada, rolling ~14 días (`rolling: true`). Requiere `app.set('trust proxy', 1)` en Render (proxy delante) o el Secure no viaja.

**SameSite=Lax obliga a front y API bajo el mismo dominio registrable** (`panel.camigonzalez.com` + `api.camigonzalez.com`). El POST del panel queda same-site y Lax lo protege de CSRF sin token extra. Si el front queda en un host distinto (vercel.app vs onrender.com), la cookie pasa a SameSite=None+Secure y hay que agregar tokens CSRF. Colocar todo bajo el dominio de la clienta es además coherente con "el sistema es tuyo" de la propuesta.

### Dominios separados — DECISIÓN CERRADA (revisión de §16)

**Contexto que cambió:** el front va a vivir en un dominio pago propio; la
API queda en el dominio gratuito de Render (`*.onrender.com`). Son dominios
registrables distintos — la asunción original de §16 (mismo dominio,
`SameSite=Lax` sin CSRF extra) no aplica más.

**Cookie: `SameSite=None; Secure`.** Obligatorio para que la cookie de
sesión viaje en requests cross-site del panel — con `Lax` el browser no la
manda y el login deja de funcionar, no es una degradación silenciosa.

**CORS: `origin` fijo al dominio real del front, `credentials: true`.** No
puede ser `*` — es incompatible con `credentials`. El front manda
`credentials:'include'` (o `withCredentials:true`) en cada request; con
same-site el browser lo hacía solo, cross-site hay que pedirlo explícito.

**CSRF: header custom en vez de token dedicado — DECISIÓN CERRADA.**
`SameSite=Lax` daba protección CSRF gratis (§16 original); con `None` hay
que reponerla. Se descartó el token CSRF clásico (synchronizer/double-submit)
por sobre-ingeniería a esta escala (2-6 usuarios de confianza, panel
administrativo, no multi-tenant): agrega un endpoint de token, su ciclo de
vida y estado nuevo sin beneficio proporcional acá.

En su lugar: middleware que exige un header custom (`X-Requested-With` o
similar) en todo request mutante (POST/PATCH/DELETE) bajo `requireAuth`. Un
ataque CSRF típico (formulario auto-submit, `<img>`, tag cross-site) no
puede setear headers custom — sólo JS ejecutando same-origin-fetch puede.
No es tan fuerte como un token criptográfico, pero cierra el vector real a
este tamaño de proyecto. Reevaluar si el panel crece a multi-tenant o
maneja datos más sensibles.

**`trust proxy`** ya estaba contemplado en §16 original (`app.set('trust
proxy', 1)`, necesario en Render para que `Secure` viaje detrás del proxy)
— no cambia con esta revisión, sigue siendo requisito.

**Consecuencia para el front (ya en marcha en su propio chat):** cada
request a la API necesita `credentials:'include'` y el header custom en
mutaciones. Avisar en el chat de frontend cuando se cierre esta tarea.

**Password:** argon2id — `passwordHash` ya existe en `usuarios` (§4). Login con verify de tiempo constante; error genérico, no revelar si falló usuario o contraseña. Regenerar la sesión al loguear (fijación). Logout destruye sesión y limpia cookie.

**Sin auto-registro.** El admin (Camila) se siembra con un script idempotente desde env (`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`). El admin crea profesionales y resetea contraseñas. Nunca hay ruta pública de registro de usuarios de panel.

**Sin reset self-service en v1.** El admin resetea. El reset por mail es fase 2 (el canal mail ya existe).

**Middleware, dos gates + ownership:**
- `requireAuth`: sin sesión → 401; carga usuario; si `!activo` destruye la sesión → 401; adjunta `req.usuario`.
- `requireRol(...roles)`: 403 si el rol no está.
- **Ownership en la capa de servicio, no en middleware.** Una profesional sólo opera turnos con `profesionalId === req.usuario._id`; el admin no lleva ese filtro. No es role-gate, es chequeo por recurso — misma lógica que la distinción política/conflicto del §6.

**Mapa de autorización:**

| Ruta | Auth |
|---|---|
| `POST /api/auth/login` | pública, rate-limited |
| `POST /api/auth/logout`, `GET /api/auth/me` | requireAuth |
| listar / aprobar / rechazar / ausente turno | requireAuth + ownership (admin bypass) |
| CRUD servicios, configuracion, usuarios, excepciones | requireAuth + requireRol('admin'), bajo `/api/admin` (§15.7/15.8/15.9) |
| `/api/mi/*` — perfil (sólo nombre), horarios y password propios | requireAuth, sin `:id` — recurso = `req.usuario.id` (§15.9) |

**Rate limit en login** por IP (express-rate-limit, ~10/15min). Cubre parte del TODO de rate limit de los públicos (§14). Store en memoria alcanza con una sola instancia en Render; si escala a varias, mover a store compartido.

**CORS con credentials:** `origin` explícito del panel (no `*`), `credentials: true`.

**El front no guarda token.** Se apoya en la cookie y llama `GET /api/auth/me` al montar para saber si hay sesión y qué rol. Un 401 en cualquier request → redirige a login.

**Notas de implementación (cerrado y testeado):**
- Login corre un `argon2.verify` contra un hash señuelo cuando el usuario no existe o está inactivo, para no delatar por tiempo de respuesta si el email existe. Cierra el timing side-channel; el error sigue siendo genérico `CREDENCIALES_INVALIDAS`.
- connect-mongo abre conexión propia a Atlas en vez de reusar el cliente de mongoose, para no acoplar el orden de arranque. **Deuda:** segunda conexión viva contra el free tier (límite de conexiones bajo). Si aparecen timeouts o pool saturado bajo carga, pasarle el `client` existente. No bloqueante a este volumen.

## 17. Registro de implementación

Bitácora de código, append-only — no especificación. Cada entrada es lo que
realmente se implementó al cerrar una tarea, con qué archivos y con qué
resultado de test. La especificación (el qué y el porqué) vive en las
secciones de arriba; acá sólo el registro de que se hizo.

### 2026-08-12 — CRUD administrativo: excepciones (§15.10)

Cierra el CRUD del panel completo (servicios, configuración, usuarios,
excepciones, las cuatro bajo `/api/admin` con el mismo gate).

**Archivos:**
- `shared/src/schemas/excepcion.schema.ts` (nuevo): `crearExcepcionSchema`
  (`.refine` `hasta > desde`) y `editarExcepcionSchema` (parcial, `.strict()`,
  mismo `.refine` cuando el PATCH trae los dos extremos). Exportado desde
  `shared/src/index.ts`.
- `server/src/services/excepciones.service.ts` (nuevo): mapper único
  `ExcepcionPanel`, `crearExcepcionPanel` (recibe `creadoPor` como parámetro,
  no del body), `listarExcepcionesPanel` (filtro de solape + `profesionalId`),
  `editarExcepcionPanel` (revalida el rango contra el documento existente
  cuando el PATCH sólo trae `desde` o `hasta`, no los dos), `eliminarExcepcion`
  (`findByIdAndDelete` — física, sin `activo`).
- `server/src/routes/admin/excepciones.routes.ts` (nuevo): `POST/GET/PATCH/
  DELETE`, mismo patrón `safeParse` + `next(ApiError)` que servicios/usuarios.
  `queryExcepcionesSchema` local a la ruta (mismo criterio que
  `queryDisponibilidadSchema`/`queryTurnosSchema`: query schemas no se
  comparten vía `shared`, sólo los de body).
- `server/src/routes/admin/index.ts`: agregado `excepcionesAdminRouter` al
  namespace.

**Decisiones de implementación no cubiertas en detalle por la especificación:**
- DELETE responde `204` sin body — primer DELETE físico del sistema, no había
  precedente; es lo idiomático y no rompe ningún consumidor existente.
- La revalidación de rango en PATCH cuando sólo viene un extremo no puede
  resolverse en Zod (no tiene acceso al documento existente): el schema
  revalida cuando el PATCH trae los dos extremos, y `editarExcepcionPanel`
  hace un segundo chequeo contra la base antes del `findByIdAndUpdate`
  cuando sólo vino uno.

**Tests:** `server/src/routes/admin/excepciones.routes.test.ts` (10 casos,
cubren los 11 escenarios de §15.10 — listar-con-ventana y listar-sin-params
comparten un `it`), incluido un test de efecto real sobre
`consultarDisponibilidad` (crea la excepción, confirma `slots: []`, la borra
por `DELETE`, confirma que los slots vuelven).

**Problemas encontrados:** ninguno — sin sorpresas de infra esta vez.

**Resultado:** 104 tests server (94 + 10 nuevos) + 10 shared, verdes.
Typecheck limpio en `shared`/`server`/`client`.

### 2026-08-12 — Infra del worker: andamiaje (§11)

Sólo el esqueleto — `GET /healthz` + arranque del worker embebido con un
ciclo stub. La lógica real del ciclo (§7: claim, envío por Twilio,
reintentos, recuperación de `enviando` colgado) queda para la próxima tarea,
deliberadamente no tocada.

**Archivos:**
- `server/src/app.ts`: `GET /healthz` — registrado **antes** de
  `cors`/`helmet`/la sesión, no `after`. Motivo: es la sonda que un ping
  externo (UptimeRobot/cron-job.org) golpea cada 5-10min para mantener
  despierta la instancia (§11); no debe depender de ningún middleware
  global, y en particular no debe tocar el store de sesión (connect-mongo
  abre su propia conexión a Mongo). Responde `{ status: 'ok', timestamp }`,
  sin auth, sin leer la base. No vive bajo `/api` — no es un recurso de la
  API, es una sonda de infra; se mantiene separado del `GET /api/health` ya
  existente (ese reporta `sharedAliasCampos`, un chequeo de scaffolding, no
  el healthcheck de infra).
- `server/src/worker.ts` (nuevo): `arrancarWorker()` / `detenerWorker()`,
  `WORKER_INTERVAL_MS = 60_000` (constante nombrada, §11 pide el ciclo cada
  1 minuto). Expuesto como funciones, no ejecutado a nivel de módulo — así
  ningún test que importe el módulo arranca un interval por accidente; hoy
  ningún test lo importa, pero queda listo para cuando el ciclo real (§7)
  necesite tests con `vi.useFakeTimers()`. El handler (`cicloWorker`) es un
  stub: un `console.log('worker tick')` y nada más.
- `server/src/index.ts`: `arrancarWorker()` se llama después de que
  `connectDB()` resuelve con éxito, no antes — si no hay `MONGODB_URI` o la
  conexión falla, el worker no arranca (hoy es inocuo porque el stub no toca
  la DB, pero el ciclo real sí, y arrancar sin conexión sería peor que no
  arrancar).

**Tests:** `server/src/app.health.test.ts` — `GET /healthz` ⇒ 200,
`status: 'ok'`, `timestamp` parseable. Sin test del ciclo del worker (es
stub, no hay comportamiento que verificar todavía).

**Problemas encontrados:** ninguno.

**Resultado:** 105 tests server (104 + 1 nuevo) + 10 shared, verdes.
Typecheck limpio en `shared`/`server`/`client`.
- El test de ownership ejercita la función pura `verificarOwnershipTurno`, no el flujo HTTP (el endpoint de aprobar no existe todavía). El test de integración de ownership va con 15.4: la ruta de aprobar/rechazar debe rechazar al profesional ajeno, no sólo la función suelta.

### 2026-08-12 — Worker de notificaciones: ciclo real (§7)

Reemplaza el stub de `cicloWorker()` por la lógica completa: recuperación de
lo colgado, claim atómico, revalidación del turno, envío (mockeado) y
reintentos con backoff. `GET /healthz` no se tocó.

**Archivos:**
- `server/src/services/whatsapp.ts` (nuevo): interfaz `ClienteWhatsApp`
  (`enviar(params) → { exito, proveedorSid } | { exito:false, error }`) +
  `crearClienteWhatsAppMock(simular?)`, que por defecto siempre tiene éxito
  y expone `simular` como punto de control desde tests (un `vi.fn()` con
  resultados encadenados). Sin credenciales Twilio ni plantillas Meta
  todavía (§8, §13), así que hoy es la única implementación; el día que
  existan, se agrega `crearClienteWhatsAppTwilio()` acá y se inyecta en
  `arrancarWorker()` — `worker.ts` no cambia una línea.
- `server/src/worker.ts`: `cicloWorker(cliente)` ya no es un stub.
  Secuencia por tick: `recuperarEnviandoColgadas()` → hasta `LOTE_MAX=10`
  claims de `tomarNotificacionPendiente()` → `procesarNotificacion()` por
  cada una. `arrancarWorker(opciones?)` ahora acepta
  `{ clienteWhatsApp? }` inyectable (default: el mock); `index.ts` no
  necesitó cambios porque no pasa opciones — sigue usando el mock por
  default, que es lo correcto mientras no haya credenciales reales.

**Decisión de implementación no cubierta en detalle por §7/§9 — reutilizar
`proximoIntento` como lease de claim, no un campo nuevo.** §7 pide recuperar
lo que lleva "más de 5 minutos en `enviando`", pero el modelo de
`notificaciones` no tiene un timestamp de "cuándo entró a `enviando`"
(`timestamps: { updatedAt: false }` es deliberado, ver `notificacion.model.ts`).
En vez de agregar un campo nuevo al modelo (fuera de lo que pide esta
tarea), `tomarNotificacionPendiente()` reutiliza `proximoIntento` con un
segundo sentido: además de "gate de backoff" cuando `estado:'pendiente'`,
funciona como "vence a los 5 min" cuando `estado:'enviando'` (se fija a
`ahora+5min` en el mismo `findOneAndUpdate` del claim). Nunca compiten sobre
el mismo documento porque dependen del estado. `recuperarEnviandoColgadas()`
hace `findOneAndUpdate` en loop filtrando `estado:'enviando'` — mismo patrón
de estado-esperado-en-el-filtro que las transiciones de turno — no un
`updateMany` ciego sobre todos los colgados a la vez.

**Regla de revalidación (§7 sólo da el ejemplo de cancelación, no una
matriz completa por tipo):** se implementó como "el turno debe NO estar en
`cancelado` ni `rechazado`, salvo que la notificación sea justamente
`rechazo`/`cancelacion` (anuncia esa transición) o `autorespuesta`
(no depende de una transición de turno, la dispara un mensaje entrante)".
Cualquier otra combinación turno-terminal + notificación-que-no-la-anuncia
aborta el envío y pasa a `cancelada`.

**El canal `email` queda fuera de esta tarea a propósito** (el prompt pidió
sólo Twilio/WhatsApp mockeado): `tomarNotificacionPendiente()` filtra
`canal:'whatsapp'` en el claim, así que las notificaciones `email`
(confirmación/cancelación con `clienteSnapshot.email`) quedan `pendiente`
sin que el worker las toque. No es una regresión — antes tampoco había
ningún envío real — pero queda como TODO explícito para cuando se decida
el cliente de mail.

**⚠ REVISAR EN WEB — bug preexistente encontrado, NO corregido (no se tocó
`turnos.service.ts`, fuera del alcance de esta tarea):**
`encolarRechazo()`/`encolarCancelacion()` (`turnos.service.ts`) crean la
notificación de rechazo/cancelación con `Notificacion.create(...)` y
*inmediatamente después*, en la misma transacción, llaman
`cancelarNotificacionesPendientes(turno._id, session)`, que hace
`updateMany({ turnoId, estado:'pendiente' }, { estado:'cancelada' })` sin
excluir la notificación recién creada — que en ese momento todavía está
`pendiente`. Confirmado empíricamente con un test ad-hoc: tras `rechazarTurno`,
tanto la notificación `rechazo` como la `solicitud` quedan `estado:'cancelada'`.
Consecuencia real: **hoy ningún turno rechazado o cancelado llega a mandar
su WhatsApp de rechazo/cancelación** — el worker nunca las ve `pendiente`.
El test existente de `turnos.panel.test.ts` ("rechaza un pendiente...") sólo
verifica `toHaveLength(1)`, no el `estado`, por eso no lo detectó. Esto no es
una decisión de §1-16 que yo pueda reinterpretar ni un campo del modelo de
notificaciones — es un bug de orden de operaciones en código ya cerrado. Se
avisa a Santiago por este medio; el fix (mover el `cancelarNotificacionesPendientes`
antes del `create`, o excluir el tipo recién creado) queda pendiente de
decisión en la sesión de arquitectura o de una tarea explícita que sí
autorice tocar `turnos.service.ts`.

**Tests:** `server/src/worker.test.ts` (7 casos) — claim atómico (dos
`cicloWorker()` solapados sobre la misma notificación pendiente ⇒
`enviar` se llama una sola vez), recuperación de `enviando` colgado (lease
vencido se recupera y reprocesa en el mismo tick; lease vigente queda
intacto), revalidación (turno cancelado ⇒ notificación pasa a `cancelada`
sin llamar a `enviar`; notificación `rechazo` sobre turno `rechazado` SÍ
sale), reintentos con backoff 1/5/15min hasta `fallida` con `error` visible
al 4to intento (usa `vi.useFakeTimers({ toFake: ['Date'] })` para avanzar el
reloj sin esperar los minutos reales ni tocar el documento a mano — sólo se
fakea `Date`, nunca `setInterval`/`setTimeout`, para no interferir con los
timers internos del driver de Mongo), idempotencia (insert duplicado
`{turnoId,tipo,canal}` ⇒ rechazado por el índice único, `code: 11000`), y
`arrancarWorker` disparando `cicloWorker` cada `WORKER_INTERVAL_MS` (fakea
sólo los timers para disparar el tick sin esperar 60s reales, vuelve a
reloj real antes de esperar el resultado async contra la DB de test con
`vi.waitFor`, evitando el mismo problema de fake timers + I/O real de Mongo).

**Problemas encontrados:** el bug de `encolarRechazo`/`encolarCancelacion`
arriba (⚠ REVISAR EN WEB). Ninguno otro.

**Resultado:** 112 tests server (105 + 7 nuevos) + 10 shared, verdes.
Typecheck limpio en `shared`/`server`/`client`.

### 2026-08-12 — Fix: orden de cancelación en encolarRechazo/encolarCancelacion (§7)

Cierra el ⚠ REVISAR EN WEB de la entrada anterior. Fix decidido y confirmado
en §7 ("Orden obligatorio al transicionar con cancelación de pendientes",
párrafo nuevo) antes de tocar el código.

**Archivos:**
- `server/src/services/turnos.service.ts`: en `encolarRechazo()` y
  `encolarCancelacion()`, se invirtió el orden — `cancelarNotificacionesPendientes(turno._id, session)`
  corre ANTES de `Notificacion.create(...)`, no después. Cambio de orden de
  dos líneas por función, nada más: no se tocó la lógica de
  `cancelarNotificacionesPendientes` ni la de ningún otro `encolarX`
  (`encolarConfirmacion` no la llama, no tenía el bug).
- `server/src/routes/turnos.panel.test.ts`: test nuevo en el describe de
  rechazar ("regresión: la notificación de rechazo queda pendiente, no se
  auto-cancela al crearse") — el test existente de rechazo se dejó intacto
  (sigue chequeando sólo `toHaveLength`, documentado que no cubría el
  estado). El test de cancelar con `recordatorio_24h` ya encolado se
  extendió (no se duplicó) con una aserción nueva: la notificación
  `cancelacion` recién creada queda `pendiente`, mientras el
  `recordatorio_24h` viejo sigue pasando a `cancelada` — mismo test, cubre
  ambos lados del comportamiento correcto en un solo escenario.

**Por qué no se tocó el worker:** consume el mismo estado de notificaciones
(`Notificacion.findOneAndUpdate` filtrando `estado:'pendiente'`) pero no
tiene ninguna lógica acoplada al bug — simplemente no veía estas
notificaciones porque nacían `cancelada`. Con el fix, las ve `pendiente`
como cualquier otra; no hizo falta cambiar una línea de `worker.ts` ni de
`services/whatsapp.ts`. La suite completa (incluidos los 7 tests de
`worker.test.ts` cerrados en la tarea anterior) sigue verde sin
modificaciones.

**Problemas encontrados:** ninguno — el fix era literalmente el orden de
dos líneas, tal como estaba decidido en §7 antes de empezar.

**Resultado:** 113 tests server (112 + 1 nuevo; el otro caso de regresión
se sumó como aserción a un test ya existente, no como `it` nuevo) + 10
shared, verdes. Typecheck limpio en `shared`/`server`/`client`.

### 2026-08-12 — Formato de código de turno: TRN-{año}-#### (§4/§13)

Cierra el TODO de espacio de códigos abierto desde el scaffolding inicial
(§13, "Decisión pendiente: espacio de códigos de turno"). Decisión ya
cerrada en el `.md` antes de tocar código: `TRN-{año}-####` con contador
atómico en `configuracion`.

**Archivos:**
- `server/src/models/configuracion.model.ts`: campo nuevo
  `contadorTurnosPorAnio?: { anio: number; ultimo: number }` en
  `IConfiguracion` y el schema, sin `required` ni `default` (no existe hasta
  el primer turno del año). Mismo patrón que `contacto`: objeto inline, no
  un sub-`Schema` propio, sin `_id`. **No se tocó**
  `editarConfiguracionSchema` (shared) ni `ConfiguracionPanel`/
  `mapConfiguracionParaPanel` (`configuracion.service.ts`) — el campo es
  interno, no editable ni expuesto por el panel, mismo criterio que ya
  excluye `timezone` del PATCH.
- `server/src/services/turnos.service.ts`:
  - `generarCodigoTurno(session, timezone)` (nueva, `async`, reemplaza la
    vieja `generarCodigoTurno()` sincrónica de 4 dígitos random). Año actual
    con Luxon en el timezone del centro (`DateTime.now().setZone(timezone).year`),
    nunca `Date.getFullYear()` sobre UTC (§3). Dos `findOneAndUpdate`
    atómicos en secuencia, ambos con `{ session }`: el primero intenta
    `$inc` filtrando `contadorTurnosPorAnio.anio: añoActual` (camino feliz,
    el año coincide); si no matchea (año viejo o el campo no existe
    todavía), el segundo resetea con `$set` sin condición. Ninguno de los
    dos lee-y-luego-escribe desde la aplicación — cada uno es atómico en sí
    mismo, y Mongo no ofrece una única operación "incrementá o reseteá
    según el valor actual" con `$inc`/`$set` puros (sin pipeline update, que
    se descartó por legibilidad frente a esta alternativa de dos pasos,
    igual de atómica en la práctica).
  - `intentarCrearTurno`: la generación del código se movió DENTRO de la
    función (antes se generaba afuera, en `crearTurno`, con la función
    random vieja, y viajaba en `ParamsInternos.codigo`). Ahora corre justo
    antes del insert del turno, con `config.timezone` ya cargado más arriba
    en la misma función — nada del resto (precondiciones de catálogo,
    solape, grilla, cliente upsert) se tocó.
  - `crearTurno`: se eliminó el loop externo `for (intento < MAX_INTENTOS_CODIGO)`
    que reintentaba la TRANSACCIÓN COMPLETA ante colisión de código (diseño
    viejo, ya no aplica). Ahora abre una sola `session`/`withTransaction`.
    El reintento ante colisión (E11000 sobre el índice único de `codigo`,
    §9) quedó DENTRO de `intentarCrearTurno`: un `try/catch` alrededor del
    `Turno.create` que, si `esColisionDeCodigo(err)`, regenera el código
    (repite el paso del contador) y reintenta el insert UNA vez más, en la
    misma transacción — no se reintenta desde afuera. `esColisionDeCodigo`
    no cambió.
  - El TODO viejo ("el espacio de códigos... decidir esquema definitivo
    antes de sacarlo de scaffolding") se borró del código — ya no aplica.

**Decisión de implementación no explícita en el prompt — `as const` en los
campos literales del documento de turno.** Al extraer los campos fijos del
turno a `camposTurno` (para no duplicar ~20 líneas entre el intento y el
reintento del insert), TypeScript widening convierte `estado: 'pendiente'`
y `porTipo: 'usuario'|'cliente'` en `string` al no estar contextualmente
tipados contra `ITurno` (el objeto ya no se pasa como literal directo a
`Turno.create`). Se anotaron con `as const` puntuales — `estado: 'pendiente' as const`
y el ternario de `porTipo` con `as const` en cada rama (no se puede aplicar
`as const` al ternario completo, sólo a literales). Sin esto no compilaba;
con esto, cero cambios de tipo público.

**Tests:** `server/src/routes/turnos.creacion.test.ts`, describe nuevo
("código de turno (§4/§13, DECISIÓN CERRADA)"), 3 casos: formato
`TRN-{año}-####` vía regex sobre el año real de Luxon; dos turnos seguidos
con `ultimo` consecutivo (mismo año); `contadorTurnosPorAnio` forzado a un
año viejo (`Configuracion.updateOne`, sin fakear el reloj — alcanza con
forzar el valor guardado, que es lo único que lee `generarCodigoTurno`) ⇒
el turno siguiente resetea a `0001` del año actual, verificado tanto en el
código devuelto como en el documento de configuración actualizado. No se
agregó test explícito del reintento por colisión (E11000) — no estaba en
la lista pedida y mockear un `E11000` real de Mongo en el primer insert
sin tocar la lógica de negocio no daba una ganancia clara sobre lo ya
cubierto por el índice único (§9, cubierto en `worker.test.ts` para
notificaciones con el mismo patrón de índice).

**Problemas encontrados:** ninguno con el modelo ni con la decisión — el
único ajuste fue el `as const` de TypeScript, mecánico.

**Resultado:** 116 tests server (113 + 3 nuevos) + 10 shared, verdes.
Typecheck limpio en `shared`/`server`/`client`.

### 2026-08-12 — Rate limit por IP en los 4 endpoints públicos (§13, bloqueante "antes de exponer")

Cierra el TODO de §13/§14 (POST /api/turnos, GET /api/disponibilidad,
GET /api/servicios, GET /api/servicios/:id/profesionales). `express-rate-limit`
en memoria, mismo paquete que ya usaba login — sin Redis ni store compartido
(mismo criterio de volumen que §11 para el worker).

**Límites elegidos (no hay número cerrado en el .md, criterio propio):**
- `POST /api/turnos`: **20 req / 10 min** por IP. El único de los cuatro que
  escribe y el único concurrency-critical — bastante más estricto que las
  lecturas en términos relativos. 20/10min da margen para reintentos tras un
  409 SLOT_OCUPADO o varias reservas de una misma familia compartiendo wifi,
  sin abrir la puerta a flood de reservas scripteado.
- `GET /api/disponibilidad`: **60 req / min** por IP. Se pega en cada
  navegación de calendario (§15.2 ya lo señalaba) — generoso a propósito para
  no cortar el uso normal de la web.
- `GET /api/servicios` + `GET /api/servicios/:id/profesionales`: **60 req /
  min** por IP, **compartido entre los dos** (un `router.use()` a nivel de
  router, no un limiter por ruta) — ambos son reads livianos que se piden
  juntos al armar servicio → profesional → horarios (§15.3 los agrupa), no
  hay razón para presupuestos separados.

Los tres GET quedan muy por debajo del ratio de login (10/15min ≈
0.67/min) en términos de severidad relativa — son órdenes de magnitud más
generosos, que es justamente lo pedido: no cortar navegación legítima.

**Forma del error:** `429 { codigo: 'DEMASIADAS_SOLICITUDES', mensaje }` —
código distinto de `DEMASIADOS_INTENTOS` (login): ahí es sobre intentos de
credenciales, acá es throttling genérico de tráfico.

**Archivos:**
- `server/src/routes/turnos.routes.ts`: `turnosRouter` pasó de `Router()`
  singleton exportado a **factory** `crearTurnosRouter()` — mismo patrón que
  `auth.routes.ts` ya usaba, y por el mismo motivo (el comentario de
  `auth.routes.ts` ya lo explicaba: cada `createApp()` arma su propio limiter
  en memoria, con contador propio). El limiter sólo se aplica al
  `POST /` público; las cinco rutas de panel (aprobar/rechazar/ausente/
  cancelar/GET) no lo llevan — van detrás de `requireAuth`, no son la
  superficie de §13.
- `server/src/routes/disponibilidad.routes.ts`: mismo cambio, `Router()`
  singleton → `crearDisponibilidadRouter()`.
- `server/src/routes/servicios.routes.ts`: mismo cambio, `Router()` singleton
  → `crearServiciosRouter()`, limiter montado con `.use()` antes de los dos
  `GET` para compartir presupuesto.
- `server/src/app.ts`: los tres imports/usos pasaron de importar el router ya
  armado a llamar a la factory (`app.use('/api/turnos', crearTurnosRouter())`,
  etc.), igual que ya se hacía con `crearAuthRouter()`.

**Por qué factory y no `router.use(limiter)` sobre un singleton — la razón
real, no sólo estilo.** `modelo-datos-turnos.md` ya tenía una deuda de test
anotada para esto mismo (§15.5, "Deuda de test — rate limiter de login
acoplado al harness"): con un limiter en un módulo-singleton, todos los
`createApp()` de un mismo proceso/archivo de test comparten un único
contador. `turnos.creacion.test.ts` hace 14 POSTs reales de turno a través de
UNA sola `app` compartida en `beforeAll` — con un limiter singleton y
cualquier límite razonablemente estricto, esos 14 hubieran empezado a caer en
429 a mitad del archivo. La factory hace que cada `createApp()` (aislado o
no) tenga su propio limiter desde cero, así que: (a) los archivos de test
existentes que comparten una `app` para varios `it()` siguen funcionando
mientras el total de requests legítimas del archivo quede debajo del límite
(14 < 20, con margen), y (b) el test que sí quiere ejercitar el 429 arma su
propia `app` aislada (`createApp()` de nuevo, mismo patrón "App aislada" que
ya usaba `auth.routes.test.ts`) y no hereda ni contamina el contador de los
demás tests del archivo.

**Tests:** un `describe` nuevo por endpoint, cada uno con una `app` aislada
(evita interferencia con los tests existentes del mismo archivo, que también
pegan contra estos endpoints):
- `server/src/routes/turnos.creacion.test.ts` — "POST /api/turnos — rate
  limit por IP (§13)": un request bien formado por debajo del límite ⇒ 201
  normal; luego 20 requests más con body vacío (el limiter corre ANTES de la
  validación del body, así que un 400 también consume cupo — no hace falta
  un turno válido para probar el corte) ⇒ el último da 429
  `DEMASIADAS_SOLICITUDES`.
- `server/src/routes/disponibilidad.routes.test.ts` — mismo patrón: un
  request sin params (400 QUERY_INVALIDA, prueba que pasa por la validación
  normal, no lo corta el rate limit) + 60 más ⇒ 429 en el último.
- `server/src/routes/servicios.routes.test.ts` — dos `describe` nuevos, uno
  por endpoint (`GET /` y `GET /:id/profesionales`), cada uno con su propia
  `app` aislada aunque compartan limiter dentro de esa app — confirma que el
  cupo compartido también corta desde cualquiera de los dos.

**Problemas encontrados:** ninguno de fondo — el único ajuste fue notar a
tiempo (antes de escribir el primer test) que un limiter singleton rompía
`turnos.creacion.test.ts` por el volumen de requests que ya hacía ese
archivo; se resolvió con la factory en vez de subir el límite hasta un
número artificialmente alto sólo para no romper tests.

**Resultado:** 120 tests server (116 + 4 nuevos) + 10 shared, verdes.
Typecheck limpio en `shared`/`server`/`client`.

### 2026-08-12 — Dos deudas técnicas de auth (§13, §15.5): rate limiter de login inyectable + invalidar sesiones al resetear password

Independientes entre sí, agrupadas en una entrada porque son chicas.

**DEUDA 1 — rate limiter de login inyectable.**

- `server/src/routes/auth.routes.ts`: `crearAuthRouter(options)` ahora acepta
  `{ loginRateLimit?: { windowMs, limit } }`. Sin override usa el default real
  de siempre (`LOGIN_RATE_LIMIT_DEFAULT`, 10/15min) — producción y dev no
  cambian.
- `server/src/app.ts`: `CreateAppOptions` suma `loginRateLimit`. Si el caller
  no pasa nada, `resolverLoginRateLimitDeTest()` decide: bajo
  `NODE_ENV==='test'` (Vitest lo setea solo, no hace falta tocarlo) devuelve
  un límite alto/casi-infinito (1.000.000/15min); fuera de test devuelve
  `undefined` y `crearAuthRouter` cae en su propio default real.
- Esto cierra la deuda anotada en §15.5: antes, CUALQUIER archivo de test que
  compartiera una `app` para varios logins (no sólo el de cancelar, que fue
  donde se notó primero) corría riesgo de pisar el límite real de
  producción con volumen que no tiene nada que ver con rate limiting. El
  workaround que había en el código — "app fresca por login", una
  `createApp()` nueva en cada llamada a `loguearAgente()` sólo para no
  compartir cupo — ya no hace falta y se simplificó en los 6 archivos que lo
  tenían: `turnos.panel.test.ts`, `turnos.panel.get.test.ts`,
  `admin/usuarios.routes.test.ts`, `admin/servicios.routes.test.ts`,
  `admin/configuracion.routes.test.ts`, `admin/excepciones.routes.test.ts`,
  `mi.routes.test.ts`. Cada uno pasó a crear UNA `app` compartida en
  `beforeAll` (mismo patrón que ya usaban los archivos sin login), y
  `loguearAgente()` quedó en un `request.agent(app)` liso.
- El único lugar que sigue necesitando el límite real es
  `auth.routes.test.ts` › "rate limit: corta después del límite de intentos
  por IP" — ahora pasa `loginRateLimit: { windowMs: 15*60*1000, limit: 10 }`
  explícito al `createApp()` de esa prueba puntual, en vez de depender
  (como antes) de que el default de la app aislada ya fuera bajo.
- Test nuevo de regresión en el mismo archivo — "con el default de test
  (alto), muchos intentos en el mismo archivo NO interfieren entre sí": 15
  intentos de login seguidos sobre la `app` COMPARTIDA de `beforeAll` (la
  misma que ya usan otros tests de login de ese archivo) sin ningún 429 —
  confirma en los hechos que la app compartida ya no necesita el workaround.

**DEUDA 2 — invalidar sesiones vivas al resetear password.**

- `server/src/middleware/session.ts`: `resolverStore()` pasa a `stringify:
  false` en `MongoStore.create(...)`. Con el default de connect-mongo
  (`stringify: true`) el documento de sesión se guarda como un blob
  `JSON.stringify` — `usuarioId` queda enterrado en un string, no filtrable
  por Mongo. En `false`, connect-mongo usa su `defaultSerializeFunction` y
  guarda la sesión como subdocumento real: `session.usuarioId` pasa a ser un
  campo consultable con un query normal. Se exporta `SESIONES_COLLECTION =
  'sesiones'` desde este módulo — antes el nombre de colección era un string
  suelto sólo en `resolverStore`; ahora lo necesita también el service de
  reset.
- `server/src/services/usuarios.service.ts` › `resetPasswordUsuario`: tras
  actualizar `passwordHash`, `mongoose.connection.collection(SESIONES_COLLECTION)
  .deleteMany({ 'session.usuarioId': usuario._id.toString() })`. Va directo
  contra la colección por `mongoose.connection`, no por la API del store de
  connect-mongo: `session.Store` (la interfaz de express-session) sólo
  expone borrado por `sid`, no un "borrar todo lo de este usuario". Mongoose
  y connect-mongo abren conexiones separadas (§16, deuda ya conocida) pero
  apuntan al mismo `mongoUrl` ⇒ misma base física ⇒ mismo `deleteMany` les
  pega a los documentos reales de sesión.
- Sin índice nuevo sobre `session.usuarioId` — a 2-6 usuarios y un
  `deleteMany` que corre sólo en el reset (evento raro), un collection scan
  es irrelevante. Se reevalúa si el volumen cambia (mismo criterio que ya
  viene aplicándose en el resto del documento para no sumar infra
  anticipada).
- `cambiarMiPassword` (self-service, `/api/mi/password`) NO se tocó — la
  deuda de §13 hablaba puntualmente del reset del admin sobre la sesión de
  otra persona; el cambio de la propia password no estaba pedido y generaliza
  distinto (¿debería la clienta cerrar sus OTRAS sesiones al cambiar su
  propia password? es una pregunta de producto, no de esta deuda puntual).

**Tests:**
- `server/src/routes/auth.routes.test.ts`: test nuevo de no-interferencia
  (arriba). El test de 429 existente se ajustó para pasar el límite real
  explícito.
- `server/src/routes/admin/usuarios.routes.test.ts` › describe
  `POST /api/admin/usuarios/:id/reset-password`: caso nuevo "invalida las
  sesiones vivas de la profesional (§13): la cookie vieja da 401 después del
  reset" — loguea a la profesional, confirma `GET /api/auth/me` 200, un
  admin resetea su password, la MISMA cookie (mismo agente de supertest, sin
  volver a loguear) da 401 en un `GET /api/auth/me` posterior.

**Problemas encontrados:** ninguno de fondo. El único ajuste fue notar que
`stringify:false` cambia la FORMA del documento guardado (objeto real en vez
de string) — no rompe nada existente porque nada más leía esa colección
directamente todavía, pero es la razón por la que no se podía escribir el
query sin tocar antes `session.ts`.

### 2026-08-13 — Auth cross-site: SameSite=None + CORS configurable + CSRF por header (§16, revisión "Dominios separados")

Cierra la revisión de §16 agregada para el front en dominio pago propio
(dominio registrable distinto de la API en `*.onrender.com`). Tres cambios:
cookie de sesión, origin de CORS configurable, y el middleware CSRF nuevo. No
se tocó el modelo de sesión en sí (connect-mongo, `stringify:false`, la
invalidación por reset — todo eso sigue igual).

**Archivos:**
- `server/src/middleware/session.ts`: `cookie.sameSite` pasó de `'lax'` a
  `'none'`. `cookie.secure` NO quedó en `true` fijo — quedó en `'auto'`.
  **Por qué, algo que el prompt no anticipaba:** con `secure:true` literal,
  `express-session` descarta el `Set-Cookie` ENTERO cuando la conexión no es
  https (`issecure()` en `express-session/index.js`, comentario propio del
  paquete: "only send secure cookies via https") — no es una degradación de
  un atributo, es que la cookie deja de salir. Sobre `app.set('trust proxy',
  1)` (Render, ya cerrado en §16 original) eso resuelve bien en producción
  (`X-Forwarded-Proto: https` del proxy ⇒ `req.secure` da `true`), pero en
  dev/test sobre http plano (sin ese header) tira TODA la suite de auth: 79
  tests fallando con 401 en cascada (login nunca deja cookie, cada request
  autenticado subsiguiente ve sesión inexistente) fue la primera corrida
  después del cambio literal a `true`. `'auto'` resuelve `cookie.secure` por
  request vía la misma `issecure()` (respeta `trust proxy` +
  `X-Forwarded-Proto`): en producción real da `true` (Secure sale, que es lo
  que exige `SameSite=None`), en dev/test sobre http da `false` (la cookie
  sale igual, sin el atributo Secure, en vez de no salir). `sameSite` se dejó
  fijo en `'none'` (no `'auto'` — ese modo de `express-session` haría
  `sameSite` `'none'`/`'lax'` según la misma detección, pero acá siempre hace
  falta `None` por el cross-site, independiente de si la conexión puntual se
  detectó como segura).
- `server/src/middleware/auth.ts`: CSRF adentro de `requireAuth`, no como
  middleware separado a encadenar después. Con `requireAuth` ya montado en 6
  puntos distintos del árbol de rutas (`turnos.routes.ts` y `auth.routes.ts`
  por ruta individual; `admin/index.ts` y `mi.routes.ts` una vez por router),
  meterlo ahí adentro da el efecto de "una sola definición, cero repetición
  por ruta" sin agregar un séptimo punto de montaje. Chequea método (todo
  menos `GET/HEAD/OPTIONS`) contra el header `x-requested-with` con valor
  exacto `XMLHttpRequest`, ANTES del `Usuario.findById` (evita la query si ya
  va a rechazar por CSRF). 403 `CSRF_HEADER_FALTANTE`. Exporta `HEADER_CSRF`
  y `VALOR_CSRF` — los usan los tests y quedan disponibles si el front los
  necesita en algún momento vía import (no aplica hoy, front es otro
  paquete/chat).
- `server/src/app.ts`: `resolverPanelOrigin()` — antes, sin `PANEL_ORIGIN`,
  reflejaba cualquier origen (`return true` en `cors()`, con warning). Con
  `credentials:true` + cookie cross-site ya en juego, reflejar cualquier
  origen es peor que antes (antes era sólo un fallback de dev poco usado; con
  SameSite=None es la superficie real). Cambiado a un default literal
  (`PANEL_ORIGIN_DEV_DEFAULT = 'http://localhost:5173'`, el puerto que ya usa
  Vite en este proyecto — `client/vite.config.ts`) en vez de reflejar. La env
  var `PANEL_ORIGIN` ya existía desde el §16 original (`credentials:true`
  también ya estaba) — no se duplicó nada, sólo se le puso un default
  explícito. Sigue sin dominio pago definitivo: cuando esté decidido, sólo
  hay que setear `PANEL_ORIGIN` en Render, no tocar código.
- `server/src/test/httpTestHelpers.ts` (nuevo): `conCsrf(agente)` envuelve un
  agente de supertest para que `post/patch/delete` manden el header CSRF
  solos — evita repetir `.set(HEADER_CSRF, VALOR_CSRF)` en cada request
  mutante de cada archivo de test. Se usa donde cada archivo ya tenía su
  propio `loguearAgente()` local (no se centralizó ese helper en sí, sólo el
  wrapping del header — mismo criterio de no tocar de más que ya venía
  aplicándose).

**Tests:**
- `server/src/routes/auth.routes.test.ts`: describe nuevo "CSRF: header
  custom en requests mutantes autenticados" — sin header ⇒ 403
  `CSRF_HEADER_FALTANTE` y la sesión sigue viva (el rechazo pasa por
  `requireAuth` antes de tocar `req.session.destroy`); con header ⇒ pasa
  normal; GET autenticado no lo necesita; ruta pública (`POST
  /api/auth/login`) tampoco. Test nuevo de atributos de cookie: pide login
  con `X-Forwarded-Proto: https` (simula estar detrás del proxy TLS de
  Render — sin este header el test estaría afirmando un `Secure` que
  `'auto'` no pone sobre http plano, no reproduciría el caso real) y
  confirma `SameSite=None` + `Secure` en el `Set-Cookie`. El test existente
  de logout se ajustó para mandar el header (si no, rompía con el 403 nuevo,
  no era el escenario que probaba).
- `mi.routes.test.ts`, `turnos.panel.test.ts`, `admin/usuarios.routes.test.ts`,
  `admin/servicios.routes.test.ts`, `admin/configuracion.routes.test.ts`,
  `admin/excepciones.routes.test.ts`: el `loguearAgente()` de cada uno ahora
  envuelve el agente con `conCsrf()` — todos sus POST/PATCH/DELETE existentes
  (aprobar/rechazar/cancelar turnos, CRUD de servicios/usuarios/configuración/
  excepciones, cambio de password/perfil/horarios propios) ya mandan el
  header sin tocar cada `it()` individual. `turnos.panel.get.test.ts` no
  necesitó cambios — sólo hace GET además del login. `disponibilidad.routes.test.ts`,
  `servicios.routes.test.ts` (público), `turnos.creacion.test.ts` tampoco —
  son endpoints públicos sin `requireAuth`, fuera del alcance del CSRF nuevo
  a propósito (§16: "no aplicarlo a rutas públicas").

**Problemas encontrados — el único no anticipado por el prompt:**
`secure:true` literal en `cookie` rompe TODA la suite de auth en dev/test
sobre http (ver arriba, detalle en el comentario de `session.ts`) porque
`express-session` directamente no manda el `Set-Cookie` cuando detecta que la
conexión no es segura — no vale ponerlo fijo en `true` sólo porque
`SameSite=None` lo exige en producción; hay que dejar que se resuelva por
request (`'auto'`) para que dev/test sobre http sigan recibiendo cookie
(sin el atributo Secure, que es exactamente lo que un browser real haría
también sobre http — la diferencia es que un browser real tampoco aceptaría
`SameSite=None` sin `Secure`, así que probar el login del panel contra un
front local servido por http, no https, va a fallar en un browser aunque los
tests automatizados sigan verdes; no es parte de esta tarea resolverlo).

**Info para el chat de frontend (según pide el prompt):** cada request
mutante autenticado (POST/PATCH/DELETE detrás de sesión — no aplica a `POST
/api/turnos`, que sigue público) necesita el header exacto
**`X-Requested-With: XMLHttpRequest`**. Sin sesión (login, rutas públicas) no
hace falta. Además de esto, todo el cliente HTTP del front necesita
`credentials: 'include'` (fetch) o `withCredentials: true` (axios) en TODOS
los requests, mutantes o no, para que la cookie de sesión viaje cross-site —
eso ya estaba anticipado en el §16 original, no es nuevo de esta tarea, pero
queda repetido acá para que no se pierda.

**Resultado:** 127 tests server (122 + 5 nuevos, todos en `auth.routes.test.ts`)
+ 10 shared, verdes. Typecheck limpio en `shared`/`server`/`client`.

**Resultado:** 122 tests server (120 + 2 nuevos) + 10 shared, verdes.

### 2026-08-13 — Ajuste dev-only: cookie de sesión sobre http local (§16, NO reabre el contrato prod)

Cierra el "no es parte de esta tarea resolverlo" que había quedado anotado en
la entrada anterior (2026-08-13, "Auth cross-site"): con `sameSite:'none'`
fijo, un browser real descarta la cookie si no viaja con `Secure`, y
`Secure` real requiere https — así que el login del panel contra `npm run
dev` (front Vite `:5173` sobre http plano, sin mkcert) no podía funcionar en
un browser aunque los tests automatizados (que no aplican las reglas de un
browser real) siguieran verdes. Sólo cambia el comportamiento en dev; prod
queda exactamente igual, a propósito — no se reabre §16.

**Archivos:**
- `server/src/middleware/session.ts`: nuevo helper `esDev()` (`NODE_ENV ===
  'development'`). La cookie ahora resuelve `secure`/`sameSite` por rama:
  prod (`NODE_ENV==='production'`) sigue en `secure:'auto'` +
  `sameSite:'none'`, sin cambios de comportamiento. Dev pasa a
  `secure:false` + `sameSite:'lax'` — front (`:5173`) y API (`:4000`) son
  same-site en local (mismo `localhost`, sólo cambia el puerto), así que
  `Lax` alcanza y no hace falta `Secure` sobre http plano.
  Deliberadamente **test (`NODE_ENV='test'`) no entra por la rama de dev** —
  sigue cayendo en la misma rama que prod (`'auto'`/`'none'`) para no romper
  el test de `auth.routes.test.ts` que ya afirma `SameSite=None` + `Secure`
  simulando el proxy de Render con `X-Forwarded-Proto`. Ese test sigue
  siendo el que reproduce el contrato real de producción; el dev-only nuevo
  no lo toca.
- `server/.env.example` ya traía `NODE_ENV=development` (de antes, sin
  cambios) — es lo que activa la rama dev al copiarlo a `.env` para
  `npm run dev`. Si no hay `.env`/`NODE_ENV`, `esDev()` da `false` y cae en
  la rama de prod (mismo default seguro de siempre).

**CORS confirmado, sin cambios:** `server/src/app.ts` ya tenía
`cors({ origin: resolverPanelOrigin(...), credentials: true })` con
`PANEL_ORIGIN_DEV_DEFAULT = 'http://localhost:5173'` cuando no hay
`PANEL_ORIGIN` seteada (ver entrada "Auth cross-site" arriba) — cubre el
`npm run dev` sin tocar nada.

**Problemas encontrados:** ninguno nuevo — el único a resolver era
exactamente el que ya estaba anotado como pendiente.

**Resultado:** 127 tests server (sin tests nuevos, es un cambio de
configuración por entorno — la cobertura de cookie/CSRF ya existente en
`auth.routes.test.ts` sigue verde tal cual, corre por la rama de prod) + 10
shared, verdes. Typecheck limpio en `shared`/`server`/`client`.
Typecheck limpio en `shared`/`server`/`client`.

### 2026-08-25 — Twilio real conectado al worker; siembra de las 5 plantillas de WhatsApp (§7, §8, §4)

Reemplaza el mock de `services/whatsapp.ts` por el cliente real de Twilio y
siembra en la colección `plantillas` los cinco `contentSid` aprobados por
Meta (§8, 21/08/2026). El worker (`worker.ts`) no se tocó — sigue
consumiendo la misma interfaz `ClienteWhatsApp`, sólo cambia qué
implementación le inyecta el bootstrap (`index.ts`).

**Archivos:**
- `models/plantilla.model.ts`: campo nuevo `contentSid?: string` (el HX de
  Twilio, distinto de `metaNombre`) — ya estaba previsto en §4, faltaba en
  el schema real.
- `scripts/seedPlantillas.ts` (nuevo): siembra idempotente de las 5
  plantillas de whatsapp, `updateOne` con `$setOnInsert` + `upsert:true` por
  `{tipo, canal:'whatsapp'}` — mismo criterio que `seedConfiguracion()` en
  `seedAdmin.ts`: si el documento ya existe (por ejemplo editado a mano
  desde el panel, o el HX cambió porque Meta pausó una plantilla) el seed no
  lo pisa. Script nuevo `npm run seed:plantillas --workspace=server`
  (independiente de `seed:admin`, mismo patrón de invocación manual).
  Exporta `seedPlantillas()` para poder invocarla desde tests sin pasar por
  `main()` (guardado detrás de `require.main === module`).
- `services/whatsapp.ts`: se mantiene `crearClienteWhatsAppMock` (lo sigue
  usando `worker.test.ts` para no pegarle a Twilio) y se agrega
  `crearClienteWhatsAppTwilio(opciones)`, misma interfaz `ClienteWhatsApp`.
  Dado que `EnvioWhatsAppParams` sólo trae `{turnoId, tipo, destino}` (así
  lo llama el worker, sin tocarlo), el armado del mensaje vive acá: resuelve
  la `Plantilla` por `{tipo, canal:'whatsapp', activa:true}`, relee el
  `Turno` por `turnoId` para sacar nombre/servicio/profesional/inicio, y
  formatea fecha/hora en `America/Argentina/Buenos_Aires` con Luxon
  (`dd/MM/yyyy` / `HH:mm`). `armarContentVariables(variables, datos)`
  (exportada, testeada aparte) arma el objeto posicional `{"1":..,"2":..}`
  siguiendo el array `variables` de la plantilla **en su orden tal cual** —
  el contrato de §4/§8, no se reordena acá. Envía con
  `cliente.messages.create({from, to:'whatsapp:'+destino, contentSid,
  contentVariables: JSON.stringify(...)})`. La opción `cliente` en
  `OpcionesClienteWhatsAppTwilio` es el punto de inyección de un stub en
  tests (subconjunto mínimo tipado `ClienteTwilioMensajes`, sólo
  `messages.create`) — no se mockea el módulo `twilio` entero. Error de
  Twilio (o plantilla/turno faltante) se mapea a `ResultadoEnvioWhatsApp`
  fallo con `{codigo, mensaje}`, nunca tira una excepción sin capturar (el
  worker no sabría qué hacer con eso).
- `index.ts`: `resolverClienteWhatsApp()` nuevo — real si están las tres env
  vars (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`),
  si no, warning por consola + `clienteWhatsAppMock` (mismo criterio que el
  arranque sin `MONGODB_URI`: no bloquea el arranque en dev/CI sin cuenta de
  Twilio). Se lo inyecta a `arrancarWorker({ clienteWhatsApp })`.
- `package.json` (server): dependencia `twilio` (`^6.1.0`) + script
  `seed:plantillas`.
- `.env.example` (server): `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/
  `TWILIO_WHATSAPP_FROM` ya estaban documentadas desde el scaffolding
  inicial — no hizo falta agregar nada.

**Tests (`services/whatsapp.test.ts`, nuevo, 8 tests):**
- `armarContentVariables` puro, un `it` por plantilla, comparando contra el
  orden posicional exacto de §4/§8 (test explícito pedido: "que compare
  contra el orden esperado").
- `crearClienteWhatsAppTwilio` con `cliente` stub inyectado (sin Twilio
  real): arma `to`/`from`/`contentSid`/`contentVariables` correctos contra
  un turno real en Mongo y una plantilla sembrada; propaga un error de
  Twilio (`err.code`/`err.message`) como fallo tipado, sin excepción; falla
  con `PLANTILLA_NO_CONFIGURADA` si la colección está vacía.
- `seedPlantillas` idempotente: primera corrida crea 5 documentos con el
  mapeo tipo→contentSid→variables esperado; edición manual de un `contentSid`
  después del seed sobrevive intacta a una segunda corrida (no se pisa).

**Problemas encontrados:** ninguno de spec — el prompt ya traía los 5 HX,
el orden de variables y las env vars resueltos. Un hallazgo de infra ajeno
a esta tarea: `auth.routes.test.ts` tiene 2 tests de rate-limit por IP que
dan timeout corriendo la suite completa bajo carga (17 archivos en
paralelo) pero pasan limpios corriendo el archivo solo — flaky preexistente
de timing, no relacionado con whatsapp/plantillas/Twilio; no se tocó nada
de auth para esta tarea.

**Resultado:** 135 tests server (127 + 8 nuevos) + 10 shared, verdes.
Typecheck limpio en `shared`/`server`/`client`.

### 2026-08-25 — CORS multi-origen: allowlist en vez de un origin único (§16, revisión "Dominios separados")

Cierra el ⚠ REVISAR EN WEB de la tarea de scaffolding de `client-publico`
(`frontend.md` §5, 2026-08-25): CORS sólo admitía un origen (`PANEL_ORIGIN`),
así que la web pública (`localhost:5174` en dev) no podía pegarle a la API
en cuanto tuviera un request real. No reabre §16 — `credentials:true` y
`SameSite=None`/CSRF por header siguen intactos, sólo cambia CÓMO se valida
el origen (de string fijo a función contra una lista).

**Archivos:**
- `server/src/app.ts`: `cors({ origin: ... })` pasa de un string fijo a
  `crearValidadorOrigen(resolverOrigenesPermitidos(...))`, una función
  `(origin, callback)` que valida pertenencia a un array. Env var nueva
  `CORS_ORIGINS` (coma-separada); si no está seteada cae a `PANEL_ORIGIN`
  (compat, un solo origen) y si tampoco está, al default de dev
  `http://localhost:5173,http://localhost:5174` (panel + pública — antes
  el default era sólo `:5173`). Sin header `Origin` (curl, healthcheck,
  server-to-server) se deja pasar, no hay cookie cross-site en juego.
  `CreateAppOptions.panelOrigin` no cambió de forma (sigue siendo un string
  único) — todos los tests existentes que lo pasan siguen funcionando igual,
  ahora como lista de un elemento.
- `server/.env.example`: `CORS_ORIGINS` de ejemplo (panel + pública);
  `PANEL_ORIGIN` se deja documentada como fallback de compat, no hace falta
  setear las dos.
- `server/src/app.health.test.ts`: describe nuevo "CORS — allowlist de
  orígenes" (3 tests, sobre `GET /api/health` que sí pasa por el middleware
  `cors`, a diferencia de `/healthz`) — default de dev refleja `:5173` y
  `:5174`, un origen fuera de la lista no trae
  `Access-Control-Allow-Origin`, y `panelOrigin` como override reemplaza el
  default en vez de extenderlo.

**Pendiente, fuera de esta tarea:** `client-publico/.env.example` y
`frontend.md` §5 todavía tienen el comentario/entrada viejos describiendo el
gap de CORS como no resuelto — no se tocaron (son del lado del front,
protocolo de este repo los deja para la sesión de arquitectura/frontend).

**Problemas encontrados:** ninguno nuevo. Confirmada otra vez la flakiness
de contención ya documentada (2026-08-17, 2026-08-25): en la corrida
completa fallaron 3 tests distintos por timeout de 5000ms (uno de
`auth.routes.test.ts`, uno de `turnos.panel.test.ts`, uno de
`usuarios.routes.test.ts` — ninguno relacionado con CORS ni tocado en esta
tarea), los 3 pasan limpio corridos en aislamiento.

**Resultado:** 138 tests server (135 + 3 nuevos de CORS) + 10 shared,
verdes (confirmado en aislamiento). Typecheck limpio en
`shared`/`server`/`client`/`client-publico`.

### 2026-09-01 — Topología de repo y deploy: monorepo único, tres services en Render

**Decisión (cierra pendiente abierto en el chat de deploy):** el proyecto se
versiona y deploya como **un solo repo monorepo** (npm workspaces:
`shared/ server/ client/ client-publico/` + `package.json` raíz +
`tsconfig.base.json`). NO repos separados por app.

**Motivo:** el código YA es monorepo — `server/` resuelve `@shared` en runtime
(schemas Zod, contratos). Separar exigiría duplicar `shared/`, publicarlo como
package privado, o submódulo git; los tres rompen el single-source-of-truth de
los contratos que `shared/` garantiza, a cambio de nada para un proyecto de un
dev. El deploy debe reflejar la forma que el código ya asume.

**Mapa repo → Render (tres services, un repo):**
| Service Render | Tipo         | Root Directory | Build                                   | Start / Publish            |
|----------------|--------------|----------------|-----------------------------------------|----------------------------|
| API            | Web Service  | (raíz, vacío)  | `npm install && npm run build --workspace=server` | start del server (dist)     |
| pública        | Static Site  | `client-publico` | `npm install && npm run build`        | `dist`                     |
| panel          | Static Site  | `client`       | `npm install && npm run build`          | `dist`                     |

Root Directory del Web Service = **raíz (vacío)**: los workspaces necesitan el
`package.json` raíz para resolver `@shared`; apuntar a `server/` rompe el build.
(Los Static Sites sí usan Root Directory por-app; su `vite build` resuelve
`@shared` vía el alias de Vite, no necesitan la raíz — a confirmar en el primer
build de cada uno.)

**Contra conocida (aceptada):** un push al repo dispara rebuild de los tres
services por default en Render. Costo bajo (los static buildean en segundos);
si molesta, se acota con filtros de path por service más adelante.

**Higiene de secretos (raíz del incidente que originó esto):** `.env` NUNCA se
versiona — GitHub Push Protection ya bloqueó un push con `TWILIO_ACCOUNT_SID`
en `server/.env`. Valores reales sólo en la pestaña Environment de cada service
en Render. En el repo, sólo `.env.example` sin valores.
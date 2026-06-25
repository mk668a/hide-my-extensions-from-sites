# hide-my-extensions-from-sites 🛡

**[English](../../README.md) ・ [日本語](README.ja.md) ・ [简体中文](README.zh-CN.md) ・ [한국어](README.ko.md) ・ Español ・ [Français](README.fr.md)**

<p align="center">
  <img src="../../store/assets/promo-marquee-1400x560.png" alt="Los sitios te identifican por tus extensiones. Oculta la lista entera. Universal, local, gratis: el uBlock de la privacidad para la enumeración de extensiones." width="820">
</p>

**Hide my extensions from every site that scans.**

Los sitios web pueden leer en silencio *qué extensiones de navegador tienes instaladas*. Solicitan URLs `chrome-extension://{id}/{resource}` una por una y **enumeran** tus extensiones instaladas según cuáles responden: el truco que destapó el «BrowserGate» de LinkedIn. Es una señal de fingerprinting potente, utilizable para rastreo, segmentación y censura.

`hide-my-extensions-from-sites` acaba con esta enumeración **en todos los sitios**, no como un parche por sitio, sino bloqueando la técnica en sí: un «uBlock de la privacidad».

> En una línea: **haz que tu lista de extensiones sea invisible para cualquier sitio.**

---

## 😩 Por qué construirlo

- **Las extensiones son una huella.** El conjunto de extensiones instaladas es un identificador estable que sobrevive al borrado de cookies.
- **Las defensas actuales son demasiado locales.** Herramientas como browsergate-shield solo coinciden con los IDs concretos de LinkedIn. En Chrome no existe una defensa **universal** frente a otros sitios que usen la misma técnica.

---

## 🧱 Cómo funciona

1. **Interceptar los sondeos `chrome-extension://` en el MAIN world**: interceptar el sondeo de IDs de extensión vía `fetch` / `XHR` / DOM (etiquetas `img`/`link`) / Workers / caché desde un content_script.
2. **Ocultar la existencia (defensa pasiva)**: devolver una respuesta uniforme de «no presente» para que no se puedan leer las extensiones instaladas.
3. **Envenenar la enumeración (engaño activo, modo opcional)**: en lugar de solo «no presente», devolver una **lista falsa de extensiones** para corromper los resultados del escáner. Si la defensa pasiva es «no filtrar», esto es «hacer que se traguen mentiras».
4. **Verlo en acción**: cuando se pilla a un sitio escaneando, el icono muestra una insignia (p. ej. `🛡 12 scans blocked`) con un registro en tiempo real.

| Defensa pasiva: oculta la lista | Modo engaño: envenena el escaneo |
|:---:|:---:|
| ![Popup que muestra sondeos de extensión bloqueados en la pestaña actual](../../store/assets/screenshot-1-hero.png) | ![Popup que devuelve al escáner resultados falsos de «instalado»](../../store/assets/screenshot-2-deception.png) |

---

## 🥊 Comparativa

| | Alcance | Engaño activo |
|---|---|---|
| browsergate-shield | Solo LinkedIn | no |
| TrackPrivacy | universal | no |
| **hide-my-extensions-from-sites** | **universal (todos los sitios)** | **sí (modo opcional)** |

---

## 🔒 Alcance

- **Sin cuentas, sin servidores, sin nube.** Todo se ejecuta localmente en tu navegador: determinista, sin conexión, gratis.
- **Lista de permitidos para extensiones de confianza.** Algunas extensiones sirven recursos a la página de forma legítima; añade su id en el popup y sus peticiones pasan intactas.
- Objetivo: **Chrome / Chromium** (111+) y **Firefox** (140+), Manifest V3.

---

## 🎯 Modelo de amenaza y cobertura

El atacante es una **página web** que intenta averiguar qué extensiones tienes instaladas solicitando URLs `chrome-extension://{id}/{resource}` (o `moz-extension://…`) y observando cuáles se resuelven. Nos ejecutamos en el MAIN world de la página en `document_start`, antes de cualquier script de la página, y neutralizamos todos los canales de petición que una página puede usar para emitir u observar tal sondeo.

**Vectores de sondeo bloqueados** (cada uno con su test de regresión):

| Canal | Cómo se neutraliza |
|---|---|
| `fetch()` | los sondeos a URLs de extensión se rechazan (o se falsean en modo engaño) |
| `XMLHttpRequest` | el `open()` a una URL de extensión se redirige a una URL muerta |
| `src`/`href` de `<img>` / `<script>` / `<link>` | se reescriben el setter de la propiedad y `setAttribute` |
| `<iframe>` / `<object>` / `<embed>` | se reescriben los setters de `src` / `data` y `setAttribute` |
| `srcset` (`<img>` / `<source>`) | se reescriben el setter y `setAttribute` |
| `xlink:href` de SVG `<use>` | se reescribe `setAttributeNS` (con espacio de nombres) |
| CSS `url(extension://…)` | se depuran `setProperty` / `cssText` / `setAttribute("style")` |
| `navigator.sendBeacon` | se descartan los beacons a URLs de extensión |
| `EventSource` | los flujos a URLs de extensión se redirigen a una URL muerta |

**Frontera de confianza.** El puente del ISOLATED world entrega al MAIN world un nonce por cada carga antes de que se ejecute cualquier script de la página; toda actualización de configuración debe llevarlo, por un canal del mismo origen (`'/'`). Por tanto, una página hostil **no puede falsificar un mensaje para desactivar la protección** ni husmear el nonce.

**Carencias conocidas (documentadas, por diseño):**

- **`el.style.backgroundImage = …`** (propiedad camelCase directa) es un *setter nombrado nativo* en Chrome: no está en `CSSStyleDeclaration.prototype`, así que no se puede parchear. Además, CSS no da señal de load/error, lo que lo hace un oráculo de enumeración pobre; las rutas CSS basadas en cadenas de arriba *sí* están cubiertas.
- **Oráculos de temporización** (diferencias de latencia en `onload`/`onerror`) no se normalizan: esto requiere un diseño, no un solo parche, y queda fuera del alcance de 1.0.
- Una advertencia de `web-ext` lint para **Firefox-for-Android** (mínimo de clave de recolección de datos); esta es una compilación orientada a escritorio.

**Esquema de configuración (congelado en v1).** La configuración almacenada es exactamente `{ schemaVersion, enabled, deception, allowlist }`. Al cargarse se migra a esta forma: `enabled` es a prueba de fallos (cualquier valor no booleano significa **protección activada**), `deception` es estrictamente opt-in y `allowlist` se valida como ids en minúsculas de 32 caracteres. Las configuraciones antiguas o corruptas se actualizan in situ, de forma idempotente.

---

## 📦 Instalación (cárgala localmente)

Aún sin ficha en la tienda: ejecútala sin empaquetar. `npm run build` produce dos zips en `dist/`: `…-chrome-<version>.zip` y `…-firefox-<version>.zip`. Comparten el mismo código; solo difiere el manifest (Firefox usa un background de tipo event-page y declara que no recolecta datos).

**Chrome / Chromium (111+):**

1. Consigue la carpeta de Chrome (clona el repo o descomprime `…-chrome-<version>.zip`).
2. Abre `chrome://extensions` → activa el **Modo de desarrollador** (arriba a la derecha).
3. Haz clic en **Cargar descomprimida** y elige la carpeta que contiene `manifest.json`.

**Firefox (140+):**

1. Descomprime `…-firefox-<version>.zip`.
2. Abre `about:debugging#/runtime/this-firefox`.
3. Haz clic en **Cargar complemento temporal…** y elige el `manifest.json` de dentro.

En cualquier caso, el icono 🛡 aparece en la barra de herramientas; haz clic para alternar la protección y ver el recuento de escaneos por pestaña.

> Un `.zip` no se puede instalar directamente: descomprímelo primero. Firefox necesita 140+ y Chrome/Chromium necesita 111+ (ambos por los content scripts del MAIN world).

## 🧪 Desarrollo y pruebas

```sh
npm install
npm test            # unitarias + integración (vitest + jsdom)
npm run test:e2e    # prueba de sistema (Playwright; ejecuta `npx playwright install chromium` una vez)
npm run build       # produce el zip cargable en dist/
```

Las pruebas están en capas: unitarias + integración (`tests/`) corren bajo vitest, y una prueba E2E carga la extensión real sin empaquetar en Chromium. El manifest de la compilación de Firefox se genera a partir del de Chrome con `tools/firefox-manifest.js` (una única fuente de verdad) y se valida con `web-ext lint`.

## 🚧 Estado

**v1.0 — estable.** El esquema de configuración está congelado (con migración in situ) y los vectores bloqueados están documentados arriba, cada uno con su test de regresión (unitario + integración + E2E en Chromium). Se distribuye como un zip local de «Cargar descomprimida / Cargar complemento temporal»; aún no está publicada en la Chrome Web Store ni en Firefox Add-ons.

## 📄 Licencia

MIT

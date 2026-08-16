# Changelog

Todas las entradas de cambios visibles de este proyecto se documentan en este archivo.

## [1.2.0] - 2026-08-16

### Added

- Limpieza automática del badge "Made in Framer" (crédito del plan free) al exportar, en 3 capas:
  - HTML: se elimina el div `#__framer-badge-container` (renderizado por SSR) y su regla CSS inline.
  - JS: se neutraliza el IIFE del runtime que remonta el badge (`getElementById("__framer-badge-container")`), con escaneo balanceado de paréntesis para no romper el resto del bundle minificado.
  - Se borra el módulo huérfano del badge (`.mjs`) que quedaba sin referencias.

Verificado contra un sitio real: el badge desaparece, el sitio renderiza completo y sin errores de consola.

## [1.1.0] - 2026-08-15

### Docs

- README: la sección "Abrir el mirror" ahora deja claro que **no se debe abrir con `file://`** (los ES modules se bloquean por CORS y el sitio queda sin animaciones) y explica el `python3 -m http.server` como paso obligatorio.
- README: "Limitaciones conocidas" actualizado — los chunks del runtime de Framer por import dinámico **sí** se capturan, así que las animaciones de scroll funcionan en el mirror.

### Fixed

- Importación de chunks del runtime de Framer (`./motion.xxx.mjs`, `./framer.xxx.mjs` y otros). El runtime carga estos módulos por import dinámico y no están referenciados en el HTML; ahora el export los descubre dentro de los `.mjs` descargados, los descarga y reescribe sus rutas a locales.
- Imports dinámicos escritos con backticks (`` import(`./x.mjs`) ``), típicos del bundler de Framer.
- Recursos referenciados con rutas relativas dentro del runtime (`../../images/x.svg`): ahora se reescriben a rutas absolutas locales (`/assets/...`), porque el runtime los resuelve contra el documento y no contra el módulo.
- URLs absolutas usadas como base de `new URL(rel, base)` dentro del runtime: se protegen del reescritura, ya que `new URL()` exige una base absoluta con protocolo. Sin este fix el runtime de Framer crasheaba con `Invalid base URL` y desactivaba toda la interactividad (animaciones de scroll, menús, etc.).

### Changed

- Las URLs absolutas dentro de los `.mjs` ahora se reescriben a rutas absolutas locales (`/assets/...`) en lugar de relativas al módulo, para que el runtime las resuelva correctamente contra el documento.

## [1.0.1] - 2026-08-15

### Removed

- Flag `--strip-framer`: eliminado del código. Manipular el DOM del sitio exportado rompía el JS del runtime de Framer que acompaña al HTML; para mantener el código estable, la limpieza de referencias a Framer (crédito "Made in Framer", links, metadatos, placeholders) queda a disposición del usuario, preferiblemente con un agente de IA.

### Fixed

- `README.md`: la sección "Limpieza post-export" ahora indica que la limpieza del crédito "Made in Framer" la hace el usuario (con un agente de IA), no el script.

## [1.0.0] - 2026-08-15

Versión inicial del repositorio público.

### Added

- Publicación del script `framer-downloader.js` (renombrado desde `website-downloader.js`).
- `package.json` con Playwright `1.62.1` como única dependencia y scripts `npm start` / `npm run mirror`.
- `README.md` con instalación, uso, estructura de salida, limpieza post-export y troubleshooting.
- `CHANGELOG.md` y `.gitignore` (`node_modules/`, `mirror-*/`).

### Changed

- Banner del script: `WEBSITE MIRROR` → `FRAMER DOWNLOADER & EXPORT`.

### Fixed

- Documentado que el crédito "Made in Framer" no se elimina por defecto (quedó a disposición del usuario vía `--strip-framer` o limpieza con agente de IA), en lugar de asumir que el export sale "limpio".
# Changelog

Todas las entradas de cambios visibles de este proyecto se documentan en este archivo.

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
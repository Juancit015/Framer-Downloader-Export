# Changelog

Todas las entradas de cambios visibles de este proyecto se documentan en este archivo.

## [1.0.0] - 2026-08-15

Versión inicial del repositorio público.

### Added

- Publicación del script `framer-downloader.js` (renombrado desde `website-downloader.js`).
- Flag `--strip-framer`: elimina el crédito visible "Made in Framer" / "Made with Framer" del HTML exportado.
- `package.json` con Playwright `1.62.1` como única dependencia y scripts `npm start` / `npm run mirror`.
- `README.md` con instalación, uso, estructura de salida, limpieza post-export y troubleshooting.
- `CHANGELOG.md` y `.gitignore` (`node_modules/`, `mirror-*/`).

### Changed

- Banner del script: `WEBSITE MIRROR` → `FRAMER DOWNLOADER & EXPORT`.

### Fixed

- Documentado que el crédito "Made in Framer" no se elimina por defecto (quedó a disposición del usuario vía `--strip-framer` o limpieza con agente de IA), en lugar de asumir que el export sale "limpio".
# Framer Downloader & Export

Descarga un sitio de Framer completo — HTML ya renderizado, CSS, imágenes, fuentes, videos y el resto de los recursos — y lo convierte en un **mirror estático** con todas las URLs reescritas a rutas locales, para reutilizarlo como plantilla propia en cualquier hosting o servidor estático.

El sitio original no se modifica: todo el trabajo ocurre localmente en una carpeta `mirror-<dominio>/`.

## Qué hace

- Recorre todas las páginas internas del sitio (BFS) respetando límites de profundidad y de cantidad de páginas.
- Descarga cada recurso que el sitio sirve (estilos, scripts, imágenes, fuentes, media) y además un pase extra que parsea el HTML/CSS guardado para bajar todo lo que el navegador no llegó a pedir (cache, lazy loading, fuentes en CSS inline).
- **Bloquea por completo** los dominios del editor de Framer (`framerstatic.com`, `framer.com`, `framercanvas.com`) y de analytics/widgets: no se descargan ni se referencian.
- **Reescribe URLs** en HTML, CSS y JS a rutas relativas locales (correctas por profundidad de carpeta), incluyendo `url()` de CSS inline y `srcset`.
- Guarda también la página 404, `robots.txt`, `favicon.ico` y un `mirror-info.json` con el mapeo URL → archivo local.
- Soporta **resume**: si el proceso se corta, retoma desde donde iba (`mirror-state.json`).

## Stack

- Node.js `v24.16.0` (versión con la que fue probado).
- Playwright `1.62.1` con Chromium headless (única dependencia, ver `package.json`).

## Instalación

### Requisitos previos

Necesitás Node.js y npm instalados en el sistema.

**Linux (Debian/Ubuntu):**

```bash
sudo apt install nodejs npm
```

**Arch Linux:**

```bash
sudo pacman -S nodejs npm
```

**Fedora:**

```bash
sudo dnf install nodejs npm
```

**Windows:**

Instalar desde <https://nodejs.org> (versión LTS).

**macOS:**

```bash
brew install node
```

### Pasos

```bash
git clone https://github.com/Juancit015/Framer-Downloader-Export.git
cd Framer-Downloader-Export
```

```bash
npm install
```

```bash
npx playwright install chromium
```

`npx playwright install chromium` descarga el navegador Chromium que usa el script; solo hace falta la primera vez.

## Uso

```bash
node framer-downloader.js https://sitio.framer.app/
```

Si no pasás una URL como argumento, el script te la pregunta interactivamente.

### Flags

| Flag | Descripción |
| --- | --- |
| `--depth=N` | Máxima profundidad de enlaces a recorrer. `-1` (por defecto) = infinita; `1` = solo la home y sus enlaces directos. |
| `--max-pages=N` | Máximo de páginas a descargar (por defecto `500`). Protege contra sitios con paginación infinita. |
| `--fresh` | Ignora el estado guardado y empieza de cero. |
| `--blocked=dominio1,dominio2` | Dominios adicionales a bloquear (además de los del editor de Framer y analytics). |

### Abrir el mirror

```bash
cd mirror-<dominio>
python3 -m http.server 8000
```

Abrir con doble clic (`file://`) **no funciona bien**: los sitios de Framer usan ES modules, que el navegador bloquea por CORS cuando no se sirven por HTTP.

## Estructura de la salida

```
mirror-<dominio>/
├── index.html              # Home (cada ruta interna se guarda como <ruta>/index.html)
├── 404.html                # Página de error del sitio
├── robots.txt              # Si el sitio la expone
├── favicon.ico             # Si existe en la raíz
├── mirror-info.json        # Mapeo URL → archivo local y lista de fallos
└── assets/                 # Todos los recursos: CSS, JS, imágenes, fuentes…
```

## Limpieza post-export (importante)

El script **descarga** el sitio, pero no "des-Frameriza" la plantilla. Para reutilizarla como plantilla propia, la limpieza de todo lo que delata a Framer **queda a disposición del usuario** y se recomienda hacerla con un agente de IA, pidiéndole por ejemplo: *"elimina de estos HTML toda referencia a Framer: el crédito 'Made in Framer', links de crédito del footer, metadatos `og:`, textos placeholder de la plantilla, favicon y tipografía de marca, conservando el diseño"*.

Qué incluye esa limpieza:

- **Crédito visible "Made in Framer"** del footer.
- **Links de crédito** al sitio de Framer.
- **Metadatos** (`og:`, canonical, títulos genéricos de plantilla).
- **Textos placeholder** y mensajes de ejemplo que trae la plantilla.
- **Favicon y tipografía de marca** si se quieren reemplazar por los propios.

El script no hace esta limpieza a propósito: el HTML exportado es el renderizado por el navegador y cualquier manipulación del DOM del sitio rompe el JS del runtime de Framer que lo acompaña. Por eso, para mantener el código estable, la limpieza se hace después del export y por el propio usuario.

Nota: los sitios publicados en dominios gratuitos de Framer (`*.framer.app`) requieren el crédito "Made in Framer"; quitarlo puede violar los términos de Framer. La decisión queda a disposición del usuario.

- **Interactividad:** los formularios y colecciones del CMS de Framer dependen de la API de Framer y **no se pueden replicar** en un mirror estático.

## Troubleshooting

| Error | Causa | Solución |
| --- | --- | --- |
| `Executable doesn't exist ... chromium` | No está instalado el navegador de Playwright | `npx playwright install chromium` |
| La página queda en blanco o los estilos no cargan | Se abrió el mirror con `file://` | Servir con `python3 -m http.server` dentro de la carpeta del mirror |
| `Error: browserType.launch: Target closed` | Playwright desactualizado frente al navegador | `npm install playwright@latest && npx playwright install chromium` |

## Limitaciones conocidas

- El HTML guardado es el **renderizado** por el navegador, no el HTML original del servidor (irrelevante para el resultado visual, relevante para quien quiera el HTML fuente).
- Los módulos JS que el runtime de Framer inyecta dinámicamente pueden no capturarse; el contenido visual queda igual porque el HTML ya está renderizado.
- El iframe de Google Maps embebido y los enlaces externos siguen dependiendo de internet.

## CHANGELOG

Consultar [CHANGELOG.md](CHANGELOG.md).
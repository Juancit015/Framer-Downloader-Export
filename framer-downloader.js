const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");

const EDITOR_DOMAINS = [
    "framerstatic.com",
    "framer.com",
    "framercanvas.com"
];

const ANALYTICS_DOMAINS = [
    "googletagmanager.com",
    "google-analytics.com",
    "doubleclick.net",
    "googleadservices.com",
    "googlesyndication.com",
    "facebook.net",
    "connect.facebook.net",
    "hotjar.com",
    "intercom.io",
    "intercomcdn.com",
    "crisp.chat",
    "tidiochat.com",
    "segment.io",
    "amplitude.com",
    "mixpanel.com",
    "fullstory.com",
    "zendesk.com",
    "hubspot.com",
    "clarity.ms",
    "bugsnag.com",
    "sentry.io",
    "newrelic.com",
    "datadoghq.com",
    "cookiebot.com",
    "onetrust.com"
];

const EXTENSION_BY_CONTENT_TYPE = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/svg+xml": "svg",
    "image/x-icon": "ico",
    "image/vnd.microsoft.icon": "ico",
    "image/bmp": "bmp",
    "image/tiff": "tiff",
    "text/css": "css",
    "text/javascript": "js",
    "application/javascript": "js",
    "application/json": "json",
    "application/manifest+json": "webmanifest",
    "font/woff": "woff",
    "font/woff2": "woff2",
    "font/ttf": "ttf",
    "font/otf": "otf",
    "application/font-woff": "woff",
    "application/font-woff2": "woff2",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "application/pdf": "pdf"
};

function parseArgs(argv) {
    const config = {
        url: null,
        depth: -1,
        maxPages: 500,
        fresh: false,
        stripFramer: false,
        extraBlocked: []
    };

    for (const arg of argv) {
        if (arg.startsWith("--")) {
            const eq = arg.indexOf("=");
            const key = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
            const value = eq === -1 ? true : arg.slice(eq + 1);

            switch (key) {
                case "depth":
                    config.depth = parseInt(value, 10);
                    break;
                case "max-pages":
                    config.maxPages = parseInt(value, 10);
                    break;
                case "fresh":
                    config.fresh = true;
                    break;
                case "strip-framer":
                    config.stripFramer = true;
                    break;
                case "blocked":
                    config.extraBlocked = String(value)
                        .split(",")
                        .map(s => s.trim())
                        .filter(Boolean);
                    break;
            }
        } else if (!config.url) {
            config.url = arg;
        }
    }

    return config;
}

function isBlockedHost(hostname, domains) {
    return domains.some(
        d => hostname === d || hostname.endsWith("." + d)
    );
}

function ask(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

const waitMs = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {

    const config = parseArgs(process.argv.slice(2));

    console.log(`
╔══════════════════════════════════════════════╗
║      FRAMER DOWNLOADER & EXPORT             ║
║           Playwright Mirror                 ║
╚══════════════════════════════════════════════╝
`);

    let inputUrl = config.url;

    if (!inputUrl) {
        inputUrl = await ask(
            "🌐 Introduce la URL del sitio: "
        );
    }

    if (!inputUrl) {
        console.log("❌ No introdujiste ninguna URL.");
        process.exit(1);
    }

    if (!/^https?:\/\//i.test(inputUrl)) {
        inputUrl = "https://" + inputUrl;
    }

    let BASE;

    try {
        BASE = new URL(inputUrl);
    } catch {
        console.log("❌ La URL no es válida.");
        process.exit(1);
    }

    BASE.hash = "";
    BASE.search = "";

    const HOST = BASE.hostname;

    const OUTPUT_NAME =
        HOST
            .replace(/^www\./, "")
            .replace(/[^a-zA-Z0-9.-]/g, "_");

    const OUTPUT =
        path.resolve(`./mirror-${OUTPUT_NAME}`);

    const blockedDomains = [
        ...EDITOR_DOMAINS,
        ...ANALYTICS_DOMAINS,
        ...config.extraBlocked
    ];

    console.log(`
🌐 Sitio: ${BASE.origin}
📁 Salida: ${OUTPUT}
⚙️  Profundidad: ${config.depth < 0 ? "infinita" : config.depth}
⚙️  Máx. páginas: ${config.maxPages}
⚙️  Quitar crédito Framer: ${config.stripFramer ? "sí" : "no"}
🚫 Dominios bloqueados: ${blockedDomains.length} (editor + analytics)
`);

    fs.mkdirSync(OUTPUT, { recursive: true });

    let pageMap = new Map();
    let downloadedAssets = new Map();
    let cssOrigins = new Map();
    let depthMap = new Map();

    const visitedPages = new Set();
    const queuedPages = new Set();
    const failedPages = [];

    const queue = [];

    const ASSET_EXTENSIONS = new Set([
        ".css",
        ".js",
        ".mjs",
        ".json",

        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".gif",
        ".svg",
        ".svgz",
        ".ico",
        ".avif",
        ".bmp",
        ".tiff",

        ".woff",
        ".woff2",
        ".ttf",
        ".otf",
        ".eot",

        ".mp4",
        ".webm",
        ".mov",
        ".m4v",

        ".mp3",
        ".wav",
        ".ogg",

        ".pdf"
    ]);

    const RESOURCE_TYPES = new Set([
        "stylesheet",
        "script",
        "image",
        "font",
        "media"
    ]);

    function normalizeUrl(url) {
        try {
            const u = new URL(url);
            u.hash = "";
            return u.href;
        } catch {
            return null;
        }
    }

    function normalizePageUrl(url) {
        const normalized = normalizeUrl(url);

        if (!normalized) return null;

        try {
            const u = new URL(normalized);
            u.search = "";
            return u.href;
        } catch {
            return null;
        }
    }

    function stripSearch(href) {
        try {
            const u = new URL(href);
            u.search = "";
            return u.href;
        } catch {
            return href;
        }
    }

    function isInternalPage(url) {
        try {
            const u = new URL(url);

            return (
                u.protocol === BASE.protocol &&
                u.hostname === HOST
            );
        } catch {
            return false;
        }
    }

    function isAsset(url, resourceType = "") {
        try {
            const extension =
                path.extname(
                    new URL(url).pathname
                ).toLowerCase();

            return (
                RESOURCE_TYPES.has(resourceType) ||
                ASSET_EXTENSIONS.has(extension)
            );
        } catch {
            return RESOURCE_TYPES.has(resourceType);
        }
    }

    function hashUrl(url) {
        return crypto
            .createHash("sha1")
            .update(url)
            .digest("hex")
            .substring(0, 12);
    }

    function getAssetPath(url, contentType = "") {

        if (downloadedAssets.has(url)) {
            return downloadedAssets.get(url);
        }

        const u = new URL(url);

        let pathname =
            decodeURIComponent(u.pathname);

        pathname =
            pathname.replace(/^\/+/, "");

        if (!pathname) {
            pathname = "resource";
        }

        pathname =
            pathname.replace(
                /[^a-zA-Z0-9._/-]/g,
                "_"
            );

        let filename =
            path.basename(pathname);

        if (!path.extname(filename)) {
            const mime =
                (contentType || "")
                    .split(";")[0]
                    .trim()
                    .toLowerCase();

            filename +=
                "." +
                (EXTENSION_BY_CONTENT_TYPE[mime] || "bin");
        }

        const directory =
            path.dirname(pathname);

        const localPath =
            path.posix.join(
                "assets",
                directory === "."
                    ? ""
                    : directory,
                `${hashUrl(url)}-${filename}`
            );

        downloadedAssets.set(url, localPath);

        return localPath;
    }

    function ensureDirectory(file) {
        fs.mkdirSync(
            path.dirname(file),
            { recursive: true }
        );
    }

    function saveFile(relativePath, data) {
        const fullPath =
            path.join(OUTPUT, relativePath);

        ensureDirectory(fullPath);

        fs.writeFileSync(fullPath, data);
    }

    function blockRouteHandler(domains) {
        return async route => {
            try {
                const u = new URL(route.request().url());

                if (isBlockedHost(u.hostname, domains)) {
                    try {
                        await route.abort();
                    } catch {}
                    return;
                }
            } catch {}

            try {
                await route.continue();
            } catch {}
        };
    }

    function stripBlockedReferences(html, domains) {
        return html
            .replace(
                /<script\b[^>]*\bsrc\s*=\s*(["'])([^"']*)\1[^>]*>[\s\S]*?<\/script>/gi,
                (match, quote, src) => {
                    try {
                        const u = new URL(src);
                        if (isBlockedHost(u.hostname, domains)) return "";
                    } catch {}
                    return match;
                }
            )
            .replace(
                /<link\b[^>]*\bhref\s*=\s*(["'])([^"']*)\1[^>]*>/gi,
                (match, quote, href) => {
                    try {
                        const u = new URL(href);
                        if (isBlockedHost(u.hostname, domains)) return "";
                    } catch {}
                    return match;
                }
            );
    }

    async function saveResponse(response) {

        const url =
            normalizeUrl(response.url());

        if (!url) return;

        if (!response.ok()) return;

        if (!isAsset(
            url,
            response.request().resourceType()
        )) {
            return;
        }

        if (downloadedAssets.has(url)) {
            return;
        }

        let u;

        try {
            u = new URL(url);
        } catch {
            return;
        }

        if (isBlockedHost(u.hostname, blockedDomains)) {
            return;
        }

        try {

            const body =
                await response.body();

            const contentType =
                response.headers()["content-type"] || "";

            const localPath =
                getAssetPath(url, contentType);

            saveFile(localPath, body);

            if (
                contentType.includes("text/css") ||
                localPath.endsWith(".css")
            ) {
                cssOrigins.set(localPath, url);
            }

            console.log(
                `   📦 ${response.request().resourceType().padEnd(10)} ${url}`
            );

        } catch {}
    }

    function pagePath(url) {

        const u = new URL(url);

        let pathname = u.pathname;

        if (
            pathname === "/" ||
            pathname === ""
        ) {
            return "index.html";
        }

        pathname =
            pathname
                .replace(/^\/+/, "")
                .replace(/\/+$/, "");

        return path.posix.join(
            pathname,
            "index.html"
        );
    }

    async function discoverLinks(page) {

        return await page.evaluate(() => {

            return Array.from(
                document.querySelectorAll(
                    "a[href]"
                )
            )
                .map(a => a.href)
                .filter(Boolean);
        });
    }

    async function scrollPage(page) {

        await page.evaluate(async () => {

            const step =
                window.innerHeight * 0.8;

            const max =
                document.body.scrollHeight;

            for (
                let y = 0;
                y < max;
                y += step
            ) {
                window.scrollTo(0, y);

                await new Promise(
                    resolve =>
                        setTimeout(resolve, 120)
                );
            }

            window.scrollTo(0, max);

            await new Promise(
                resolve =>
                    setTimeout(resolve, 1000)
            );

            window.scrollTo(0, 0);
        });
    }

    async function stripFramerCredit(page) {

        await page.evaluate(() => {

            const phrases = [
                "Made in Framer",
                "Made with Framer",
                "Created with Framer"
            ];

            const walker =
                document.createTreeWalker(
                    document.body,
                    NodeFilter.SHOW_TEXT
                );

            const textNodes = [];

            while (walker.nextNode()) {
                textNodes.push(walker.currentNode);
            }

            for (const node of textNodes) {

                const text =
                    node.textContent.trim();

                if (!phrases.some(p => text === p)) {
                    continue;
                }

                const element =
                    node.parentElement;

                if (!element) {
                    node.textContent = "";
                    continue;
                }

                const keptText =
                    element.textContent
                        .replace(text, "")
                        .trim();

                if (keptText.length === 0) {
                    element.remove();
                } else {
                    node.textContent = "";
                }
            }
        });
    }

    async function processPage(context, url, depth) {

        url =
            normalizePageUrl(url);

        if (!url) return;

        if (!isInternalPage(url)) {
            return;
        }

        if (visitedPages.has(url)) {
            return;
        }

        if (visitedPages.size >= config.maxPages) {
            return;
        }

        visitedPages.add(url);
        depthMap.set(url, depth);

        console.log("\n");
        console.log(
            "══════════════════════════════════════"
        );
        console.log(`🌐 ${url}`);
        console.log(
            "══════════════════════════════════════"
        );

        const page =
            await context.newPage();

        await page.route(
            "**/*",
            blockRouteHandler(blockedDomains)
        );

        page.on(
            "response",
            response => {
                saveResponse(response)
                    .catch(() => {});
            }
        );

        try {

            const response =
                await page.goto(
                    url,
                    {
                        waitUntil: "load",
                        timeout: 60000
                    }
                );

            if (
                response &&
                response.status() >= 400
            ) {
                failedPages.push(
                    `${url} :: HTTP ${response.status()}`
                );

                console.log(
                    `   ❌ HTTP ${response.status()} (no se guarda)`
                );

                return;
            }

            await waitMs(2500);

            await scrollPage(page);

            await waitMs(2000);

            if (config.stripFramer) {
                await stripFramerCredit(page);
            }

            const output =
                pagePath(url);

            const html =
                await page.content();

            saveFile(
                output,
                Buffer.from(
                    "<!DOCTYPE html>\n" +
                    stripBlockedReferences(html, blockedDomains),
                    "utf8"
                )
            );

            pageMap.set(url, output);

            console.log(
                `   📄 Guardado → ${output}`
            );

            const links =
                await discoverLinks(page);

            for (const link of links) {

                const normalized =
                    normalizePageUrl(link);

                if (
                    normalized &&
                    isInternalPage(normalized) &&
                    !visitedPages.has(normalized) &&
                    !queuedPages.has(normalized)
                ) {

                    if (
                        config.depth >= 0 &&
                        depth >= config.depth
                    ) {
                        continue;
                    }

                    if (
                        visitedPages.size + queue.length >=
                        config.maxPages
                    ) {
                        continue;
                    }

                    queuedPages.add(normalized);

                    queue.push({
                        url: normalized,
                        depth: depth + 1
                    });
                }
            }

        } catch (error) {

            failedPages.push(
                `${url} :: ${error.message}`
            );

            console.log(
                `   ❌ Error: ${error.message}`
            );

        } finally {

            await page.close();
        }
    }

    async function capture404(context) {

        console.log("\n");
        console.log(
            "══════════════════════════════════════"
        );
        console.log(
            "🚨 Capturando página 404"
        );
        console.log(
            "══════════════════════════════════════"
        );

        const page =
            await context.newPage();

        await page.route(
            "**/*",
            blockRouteHandler(blockedDomains)
        );

        page.on(
            "response",
            response => {
                saveResponse(response)
                    .catch(() => {});
            }
        );

        const randomPath =
            `/__mirror_404_${Date.now()}__`;

        const url =
            new URL(
                randomPath,
                BASE.origin
            ).href;

        try {

            await page.goto(
                url,
                {
                    waitUntil: "load",
                    timeout: 60000
                }
            );

            await waitMs(2500);

            await scrollPage(page);

            await waitMs(1500);

            if (config.stripFramer) {
                await stripFramerCredit(page);
            }

            const html =
                await page.content();

            saveFile(
                "404.html",
                Buffer.from(
                    "<!DOCTYPE html>\n" +
                    stripBlockedReferences(html, blockedDomains),
                    "utf8"
                )
            );

            console.log(
                "   📄 404.html guardado"
            );

        } catch (error) {

            failedPages.push(
                `404 :: ${error.message}`
            );

            console.log(
                `   ❌ Error 404: ${error.message}`
            );

        } finally {

            await page.close();
        }
    }

    async function fetchExtra(context) {

        const paths = [
            { remote: "/robots.txt", local: "robots.txt", label: "🤖 robots.txt" },
            { remote: "/favicon.ico", local: "favicon.ico", label: "🖼  favicon.ico" }
        ];

        for (const item of paths) {

            try {

                const response =
                    await context.request.get(
                        BASE.origin + item.remote
                    );

                if (!response.ok()) continue;

                const body =
                    await response.body();

                if (!body.length) continue;

                saveFile(item.local, body);

                console.log(`   ${item.label} → ${item.local}`);

            } catch {}
        }
    }

    function stateFile() {
        return path.join(OUTPUT, "mirror-state.json");
    }

    function saveState() {
        fs.writeFileSync(
            stateFile(),
            JSON.stringify({
                base: BASE.href,
                pageMap: [...pageMap.entries()],
                downloadedAssets: [...downloadedAssets.entries()],
                cssOrigins: [...cssOrigins.entries()],
                depthMap: [...depthMap.entries()],
                queuedPages: [...queuedPages],
                queue,
                failedPages
            }, null, 2)
        );
    }

    function loadState() {

        if (!fs.existsSync(stateFile())) {
            return;
        }

        const state =
            JSON.parse(
                fs.readFileSync(stateFile(), "utf8")
            );

        if (state.base !== BASE.href) {
            console.log(
                "   ⚠️  Estado guardado de otro sitio, ignorado."
            );
            return;
        }

        pageMap =
            new Map(state.pageMap);

        downloadedAssets =
            new Map(state.downloadedAssets);

        cssOrigins =
            new Map(state.cssOrigins);

        depthMap =
            new Map(state.depthMap);

        failedPages.push(...state.failedPages);

        for (const u of pageMap.keys()) {
            visitedPages.add(u);
        }

        for (const u of state.queuedPages) {
            queuedPages.add(u);
        }

        for (const item of state.queue) {
            if (!visitedPages.has(item.url)) {
                queue.push(item);
            }
        }

        console.log(
            `   ↻ Estado recuperado: ${visitedPages.size} páginas, ${downloadedAssets.size} recursos`
        );
    }

    function relativeFrom(fromFile, toFile) {
        return path.posix.relative(
            path.posix.dirname(fromFile),
            toFile
        );
    }

    function cleanRawUrl(raw) {

        return raw
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&#34;/g, '"')
            .trim()
            .replace(/^["']+|["']+$/g, "");
    }

    function localFor(rawUrl, contextUrl, fromFile) {

        if (!rawUrl) return null;

        rawUrl = cleanRawUrl(rawUrl);

        if (
            /^(#|mailto:|tel:|javascript:|data:|blob:|ws:|wss:|about:)/i.test(rawUrl)
        ) {
            return null;
        }

        let u;

        try {
            u = new URL(rawUrl, contextUrl || BASE.href);
        } catch {
            return null;
        }

        if (!/^https?:$/.test(u.protocol)) {
            return null;
        }

        const hash = u.hash;

        u.hash = "";

        const abs = u.href;

        let target = null;

        if (downloadedAssets.has(abs)) {
            target = downloadedAssets.get(abs);
        } else if (pageMap.has(stripSearch(abs))) {
            target = pageMap.get(stripSearch(abs));
        }

        if (!target) return null;

        return relativeFrom(fromFile, target) + hash;
    }

    function rewriteHtml(html, fileRel) {

        const context = BASE.href;

        let out = html;

        out =
            out.replace(
                /srcset\s*=\s*"([^"]*)"/g,
                (match, list) => {

                    const parts =
                        list
                            .split(",")
                            .map(p => p.trim())
                            .filter(Boolean);

                    const mapped =
                        parts.map(part => {

                            const pieces =
                                part.split(/\s+/);

                            const urlPart =
                                pieces[0];

                            const local =
                                localFor(urlPart, context, fileRel);

                            if (!local) return part;

                            return [
                                local,
                                ...pieces.slice(1)
                            ].join(" ");
                        });

                    return `srcset="${mapped.join(", ")}"`;
                }
            );

        out =
            out.replace(
                /(\s(?:href|src|poster|data-src|data-lazy-src|data-original|content)\s*=\s*)(["'])(.*?)\2/g,
                (match, prefix, quote, value) => {

                    const local =
                        localFor(value, context, fileRel);

                    return local
                        ? prefix + quote + local + quote
                        : match;
                }
            );

        out =
            out.replace(
                /url\(\s*(['"]?)(.*?)\1\s*\)/g,
                (match, quote, value) => {

                    const local =
                        localFor(value, context, fileRel);

                    return local
                        ? `url("${local}")`
                        : match;
                }
            );

        return out;
    }

    function rewriteCss(css, fileRel) {

        const context =
            cssOrigins.get(fileRel) || BASE.href;

        return css
            .replace(
                /url\(\s*(['"]?)(.*?)\1\s*\)/g,
                (match, quote, value) => {

                    const local =
                        localFor(value, context, fileRel);

                    return local
                        ? `url("${local}")`
                        : match;
                }
            )
            .replace(
                /@import\s+(['"])(.*?)\1/g,
                (match, quote, value) => {

                    const local =
                        localFor(value, context, fileRel);

                    return local
                        ? `@import "${local}"`
                        : match;
                }
            );
    }

    function rewriteJs(js, fileRel) {

        return js.replace(
            /https?:\/\/[^\s"'`()<>]+/g,
            match =>
                localFor(match, BASE.href, fileRel) || match
        );
    }

    function rewriteFile(fileRel) {

        const full =
            path.join(OUTPUT, fileRel);

        const raw =
            fs.readFileSync(full, "utf8");

        const ext =
            path.extname(fileRel).toLowerCase();

        let out;

        if (ext === ".html") {
            out = rewriteHtml(raw, fileRel);
        } else if (ext === ".css") {
            out = rewriteCss(raw, fileRel);
        } else if (
            ext === ".js" ||
            ext === ".mjs"
        ) {
            out = rewriteJs(raw, fileRel);
        } else {
            return false;
        }

        if (out !== raw) {
            fs.writeFileSync(full, out);
            return true;
        }

        return false;
    }

    function walkFiles(dir) {

        let files = [];

        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {

            const full =
                path.join(dir, entry.name);

            if (entry.isDirectory()) {
                files =
                    files.concat(walkFiles(full));
            } else {
                files.push(
                    path.relative(OUTPUT, full)
                );
            }
        }

        return files;
    }

    async function fetchReferencedAssets(context) {

        const fetched = new Set();

        for (let pass = 0; pass < 5; pass++) {

            const files = walkFiles(OUTPUT);

            const urls = new Set();

            for (const fileRel of files) {

                const ext =
                    path.extname(fileRel).toLowerCase();

                if (
                    ext !== ".html" &&
                    ext !== ".css" &&
                    ext !== ".js" &&
                    ext !== ".mjs"
                ) {
                    continue;
                }

                const content =
                    fs.readFileSync(
                        path.join(OUTPUT, fileRel),
                        "utf8"
                    );

                const collect = raw => {

                    raw = cleanRawUrl(raw);

                    if (!raw) return;

                    try {

                        const u =
                            new URL(raw, BASE.href);

                        if (!/^https?:$/.test(u.protocol)) return;

                        u.hash = "";

                        urls.add(u.href);

                    } catch {}
                };

                const attributeMatches =
                    content.matchAll(
                        /(?:href|src|poster|data-src|srcset)\s*=\s*"([^"]*)"/g
                    );

                for (const match of attributeMatches) {

                    for (const part of match[1].split(",")) {

                        collect(
                            part.trim().split(/\s+/)[0]
                        );
                    }
                }

                const urlMatches =
                    content.matchAll(
                        /url\(\s*(['"]?)(.*?)\1\s*\)/g
                    );

                for (const match of urlMatches) {
                    collect(match[2]);
                }

                if (
                    ext === ".js" ||
                    ext === ".mjs"
                ) {

                    const absoluteMatches =
                        content.matchAll(
                            /https?:\/\/[^\s"'`()<>]+/g
                        );

                    for (const match of absoluteMatches) {
                        collect(match[0]);
                    }
                }
            }

            let newOnes = 0;

            for (const url of urls) {

                if (fetched.has(url)) continue;

                if (downloadedAssets.has(url)) continue;

                fetched.add(url);

                let hostname;

                try {
                    hostname = new URL(url).hostname;
                } catch {
                    continue;
                }

                if (isBlockedHost(hostname, blockedDomains)) {
                    continue;
                }

                if (!isAsset(url)) {
                    continue;
                }

                try {

                    const response =
                        await context.request.get(url);

                    if (!response.ok()) continue;

                    const body =
                        await response.body();

                    if (!body || !body.length) continue;

                    const contentType =
                        response.headers()["content-type"] || "";

                    const localPath =
                        getAssetPath(url, contentType);

                    saveFile(localPath, body);

                    if (
                        contentType.includes("text/css") ||
                        localPath.endsWith(".css")
                    ) {
                        cssOrigins.set(localPath, url);
                    }

                    newOnes++;

                    console.log(
                        `   📥 ${url}`
                    );

                } catch {}
            }

            console.log(
                `   🔎 Pasada ${pass + 1}: ${newOnes} recursos nuevos referenciados`
            );

            if (newOnes === 0) break;
        }
    }

    const browser =
        await chromium.launch({
            headless: true
        });

    const context =
        await browser.newContext();

    if (config.fresh) {
        fs.rmSync(stateFile(), { force: true });
    }

    loadState();

    await fetchExtra(context);

    queue.push({
        url: BASE.href,
        depth: 0
    });

    queuedPages.add(BASE.href);

    let sinceLastSave = 0;

    while (queue.length > 0) {

        const { url, depth } =
            queue.shift();

        await processPage(context, url, depth);

        sinceLastSave++;

        if (sinceLastSave >= 5) {
            saveState();
            sinceLastSave = 0;
        }
    }

    await capture404(context);

    console.log("\n");
    console.log(
        "╔══════════════════════════════════════════════╗"
    );
    console.log(
        "║      DESCARGANDO RECURSOS REFERENCIADOS      ║"
    );
    console.log(
        "╚══════════════════════════════════════════════╝"
    );

    await fetchReferencedAssets(context);

    await browser.close();

    fs.rmSync(stateFile(), { force: true });

    console.log("\n");
    console.log(
        "╔══════════════════════════════════════════════╗"
    );
    console.log(
        "║        REWRITIENDO URLS A RUTAS LOCALES      ║"
    );
    console.log(
        "╚══════════════════════════════════════════════╝"
    );

    let rewrittenCount = 0;
    let checkedCount = 0;

    const files = walkFiles(OUTPUT);

    for (const fileRel of files) {

        const ext =
            path.extname(fileRel).toLowerCase();

        if (
            ext !== ".html" &&
            ext !== ".css" &&
            ext !== ".js" &&
            ext !== ".mjs"
        ) {
            continue;
        }

        checkedCount++;

        if (rewriteFile(fileRel)) {
            rewrittenCount++;
        }
    }

    console.log(
        `   🔁 Archivos reescritos: ${rewrittenCount}/${checkedCount}`
    );

    fs.writeFileSync(
        path.join(OUTPUT, "mirror-info.json"),
        JSON.stringify({
            sitio: BASE.href,
            generado: new Date().toISOString(),
            paginas: [...pageMap.entries()]
                .map(([url, local]) => ({ url, local })),
            recursos: downloadedAssets.size,
            fallos: failedPages,
            nota: "Abrir con un servidor local (ej: python3 -m http.server 8000 dentro de la carpeta). Abrir con file:// falla por CORS con ES modules."
        }, null, 2)
    );

    console.log("\n");
    console.log(
        "╔══════════════════════════════════════════════╗"
    );
    console.log(
        "║             EXPORTACIÓN LISTA               ║"
    );
    console.log(
        "╚══════════════════════════════════════════════╝"
    );

    console.log(
        `\n📄 Páginas: ${pageMap.size}`
    );

    console.log(
        `📦 Recursos: ${downloadedAssets.size}`
    );

    console.log(
        `🔁 Archivos reescritos: ${rewrittenCount}`
    );

    console.log(
        `❌ Fallos: ${failedPages.length}`
    );

    console.log(
        `📁 Carpeta: ${OUTPUT}`
    );

    console.log(
        `\n💡 Abrir el mirror con un servidor local:\n`
    );

    console.log(
        `   cd "${OUTPUT}" && python3 -m http.server 8000`
    );

    if (failedPages.length > 0) {
        console.log(
            "\nPáginas con error:"
        );
        for (const failure of failedPages) {
            console.log(`   ❌ ${failure}`);
        }
    }
}

main();
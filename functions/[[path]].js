import { localizeEnglishRouteSegment } from '../route-localization.js';

// functions/[[path]].js
export async function onRequestGet(context) {
    const { request, env, params, next } = context;

    // Selvitetään millä domainilla kävijä tuli
    const url = new URL(request.url);
    const hostname = url.hostname.replace('www.', '');
    const pathArray = params.path;

    const legacyEnglishRedirect = getLegacyEnglishRedirect(url);
    if (legacyEnglishRedirect) {
        return Response.redirect(legacyEnglishRedirect, 302);
    }

    const shortenerErrorUrl = 'https://sorola.fi/lyhennin/error';
    const shortenerHomeUrl = 'https://sorola.fi/lyhennin';

    // --- SRLA.FI JA SRL.LA LIIKENNE ---
    if (hostname === 'srla.fi' || hostname === 'srl.la') {
        if (!pathArray || pathArray.length === 0) {
            return Response.redirect(shortenerHomeUrl, 302);
        }

        const shortPath = pathArray.join('/');
        if (shortPath.startsWith('api/')) return next();

        try {
            const table = hostname === 'srl.la' ? 'srl_links' : 'srla_links';
            const result = await env.DB.prepare(`SELECT original_url FROM ${table} WHERE short_path = ?`).bind(shortPath).first();
            
            if (result && result.original_url) {
                // Lisätään klikkaus taustalla (ei hidasta kävijän siirtymistä!)
                context.waitUntil(env.DB.prepare(`UPDATE ${table} SET clicks = clicks + 1 WHERE short_path = ?`).bind(shortPath).run());
                return Response.redirect(result.original_url, 302);
            }
        } catch (e) {}
        return Response.redirect(shortenerErrorUrl, 302);
    }

    // --- PÄÄSIVUSTO JA SORO.LA ---
    if (hostname === 'sorola.fi') return next();

    if (hostname === 'soro.la') {
        if (!pathArray || pathArray.length === 0) {
            return Response.redirect(shortenerHomeUrl, 302);
        }

        const shortPath = pathArray.join('/');
        if (shortPath.startsWith('api/')) return next();

        try {
            const result = await env.DB.prepare("SELECT original_url FROM links WHERE short_path = ?").bind(shortPath).first();
            
            if (result && result.original_url) {
                // Lisätään klikkaus taustalla
                context.waitUntil(env.DB.prepare("UPDATE links SET clicks = clicks + 1 WHERE short_path = ?").bind(shortPath).run());
                return Response.redirect(result.original_url, 302);
            }
        } catch (e) {}
        return Response.redirect(shortenerErrorUrl, 302);
    }

    if (!pathArray || pathArray.length === 0) return next();
    
    const shortPath = pathArray.join('/');
    if (shortPath.startsWith('tyylit/') || shortPath.startsWith('admin/') || shortPath.startsWith('api/')) return next();

    return next();
}

function getLegacyEnglishRedirect(url) {
    if (url.hostname.replace('www.', '') !== 'sorola.fi' || !url.pathname.startsWith('/en/')) {
        return null;
    }

    const hasTrailingSlash = url.pathname.endsWith('/');
    const segments = url.pathname.split('/').filter(Boolean);
    const translated = segments.map((segment, index) => (
        index === 0 ? segment : localizeEnglishRouteSegment(segment)
    ));

    if (translated.join('/') === segments.join('/')) {
        return null;
    }

    let pathname = `/${translated.join('/')}`;
    if (hasTrailingSlash && !pathname.endsWith('/')) {
        pathname += '/';
    }

    return `${url.origin}${pathname}${url.search}`;
}
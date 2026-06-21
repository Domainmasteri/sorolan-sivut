// functions/[[path]].js
export async function onRequestGet(context) {
    const { request, env, params, next } = context;

    // Selvitetään millä domainilla kävijä tuli
    const url = new URL(request.url);
    const hostname = url.hostname.replace('www.', '');
    const pathArray = params.path;

    // --- SRLA.FI LIIKENNE ---
    if (hostname === 'srla.fi') {
        if (!pathArray || pathArray.length === 0) {
            return Response.redirect('https://sorola.fi/lyhennin', 302);
        }

        const shortPath = pathArray.join('/');
        if (shortPath.startsWith('api/')) return next();

        try {
            const result = await env.DB.prepare("SELECT original_url FROM srla_links WHERE short_path = ?").bind(shortPath).first();
            
            if (result && result.original_url) {
                // Lisätään klikkaus taustalla (ei hidasta kävijän siirtymistä!)
                context.waitUntil(env.DB.prepare("UPDATE srla_links SET clicks = clicks + 1 WHERE short_path = ?").bind(shortPath).run());
                return Response.redirect(result.original_url, 302);
            }
        } catch (e) {}
        return Response.redirect('https://sorola.fi/lyhennin/error', 302);
    }

    // --- PÄÄSIVUSTO JA SORO.LA ---
    if (!pathArray || pathArray.length === 0) return next();
    
    const shortPath = pathArray.join('/');
    if (shortPath.startsWith('tyylit/') || shortPath.startsWith('admin/') || shortPath.startsWith('api/')) return next();
    
    if (hostname === 'sorola.fi') return next();

    if (hostname === 'soro.la') {
        try {
            const result = await env.DB.prepare("SELECT original_url FROM links WHERE short_path = ?").bind(shortPath).first();
            
            if (result && result.original_url) {
                // Lisätään klikkaus taustalla
                context.waitUntil(env.DB.prepare("UPDATE links SET clicks = clicks + 1 WHERE short_path = ?").bind(shortPath).run());
                return Response.redirect(result.original_url, 302);
            }
        } catch (e) {}
        return Response.redirect('https://sorola.fi/lyhennin/error', 302);
    }

    return next();
}
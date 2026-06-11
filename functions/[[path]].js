// functions/[[path]].js
export async function onRequestGet(context) {
    const { request, env, params, next } = context;

    // Selvitetään millä domainilla kävijä tuli
    const url = new URL(request.url);
    const hostname = url.hostname.replace('www.', '');
    const pathArray = params.path;

    // --- UUSI: SRLA.FI LIIKENNE ---
    if (hostname === 'srla.fi') {
        // 1. Jos mennään pelkkään juureen (srla.fi/)
        if (!pathArray || pathArray.length === 0) {
            return Response.redirect('https://sorola.fi/lyhennin', 302);
        }

        const shortPath = pathArray.join('/');

        // Estetään API-reittien uudelleenohjaus (jotta laajennus toimii)
        if (shortPath.startsWith('api/')) {
            return next();
        }

        try {
            // Etsitään lyhennettä srla_links -taulusta
            const result = await env.DB.prepare("SELECT original_url FROM srla_links WHERE short_path = ?").bind(shortPath).first();
            
            if (result && result.original_url) {
                // Linkki löytyi!
                return Response.redirect(result.original_url, 302);
            }
        } catch (e) {
            // Tietokantavirheissä jatketaan eteenpäin
        }

        // 2. Jos linkkiä ei löytynyt, ohjataan lyhentimen virhesivulle
        return Response.redirect('https://sorola.fi/lyhennin/error', 302);
    }

    // --- VANHA: PÄÄSIVUSTO JA SORO.LA ---
    
    // Jos kyseessä on juurihakemisto muilla domaineilla, annetaan mennä läpi
    if (!pathArray || pathArray.length === 0) {
        return next();
    }

    const shortPath = pathArray.join('/');

    if (shortPath.startsWith('tyylit/') || shortPath.startsWith('admin/') || shortPath.startsWith('api/')) {
        return next();
    }

    if (hostname === 'sorola.fi') {
        return next();
    }

    if (hostname === 'soro.la') {
        try {
            const result = await env.DB.prepare("SELECT original_url FROM links WHERE short_path = ?").bind(shortPath).first();
            if (result && result.original_url) {
                return Response.redirect(result.original_url, 302);
            }
        } catch (e) {}
        return Response.redirect('https://sorola.fi/lyhennin/error', 302);
    }

    return next();
}
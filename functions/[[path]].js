// functions/[[path]].js
export async function onRequestGet(context) {
    const { request, env, params, next } = context;

    // Selvitetään millä domainilla kävijä tuli (poistetaan mahdollinen www. etuliite)
    const url = new URL(request.url);
    const hostname = url.hostname.replace('www.', '');

    const pathArray = params.path;
    if (!pathArray || pathArray.length === 0) {
        return next(); // Pääsivut saavat latautua normaalisti
    }

    const shortPath = pathArray.join('/');

    // 1. JOS OLLAAN PÄÄSIVUSTOLLA (sorola.fi)
    // Annetaan Cloudflare Pagesin ladata omat oikeat fyysiset sivut ja tiedostot normaalisti
    // (esim. sorola.fi/ohjeet tai sorola.fi/tyylit/pohja.css toimivat suoraan)
    if (hostname === 'sorola.fi') {
        return next();
    }

    // 2. JOS OLLAAN LYHENNYS-DOMAINISSA (soro.la)
    if (hostname === 'soro.la') {
        try {
            // Etsitään lyhennettä tietokannasta
            const result = await env.DB.prepare("SELECT original_url FROM links WHERE short_path = ?").bind(shortPath).first();
            
            if (result && result.original_url) {
                // Linkki löytyi tietokannasta! Tehdään uudelleenohjaus kohdeosoitteeseen
                return Response.redirect(result.original_url, 302);
            }
        } catch (e) {
            // Tietokantavirheen sattuessa jatketaan eteenpäin
        }

        // Jos linkkiä ei löytynyt soro.la tietokannasta, ohjataan kävijä pääsivuston virhesivulle
        return Response.redirect('https://sorola.fi/lyhennin/error', 302);
    }

    // Varajärjestelmä muille domaineille
    return next();
}

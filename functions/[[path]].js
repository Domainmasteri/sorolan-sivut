// functions/[[path]].js
export async function onRequestGet(context) {
    const { request, env, params, next } = context;

    // Haetaan URL-polku (esim. "Tonttu")
    const pathArray = params.path;
    if (!pathArray || pathArray.length === 0) {
        return next(); // Pääsivu sorola.fi/, annetaan olla
    }

    const shortPath = pathArray.join('/');

    // Jätetään sivuston omat oikeat kansiot rauhaan, ettei niitä yritetä lyhentää
    if (shortPath.startsWith('tyylit/') || shortPath.startsWith('admin/') || shortPath.startsWith('api/')) {
        return next();
    }

    try {
        // Etsitään lyhennettä tietokannasta
        const result = await env.DB.prepare("SELECT original_url FROM links WHERE short_path = ?").bind(shortPath).first();
        
        if (result && result.original_url) {
            // Linkki löytyi! Tehdään uudelleenohjaus kohdeosoitteeseen
            return Response.redirect(result.original_url, 302);
        }
    } catch (e) {
        // Jos kanta antaa virheen, sivuutetaan se ja jatketaan
    }

    // Jos lyhennettä ei löytynyt tietokannasta, annetaan Pagesin jatkaa etsintää
    const response = await next();
    
    // Jos Pages toteaa, ettei sivua oikeasti ole olemassa (404),
    // heitetään kävijä nätisti sinun omalle error.html -sivullesi!
    if (response.status === 404) {
        return Response.redirect(new URL('/error.html', request.url), 302);
    }
    
    return response;
}

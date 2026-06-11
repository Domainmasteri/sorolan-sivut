```javascript
// functions/[[path]].js
// Tämä tiedosto nappaa kaikki sivustolle tulevat pyynnöt (esim. soro.la/lyhenne)

export async function onRequestGet(context) {
    const { request, env, params, next } = context;

    const pathArray = params.path;
    if (!pathArray || pathArray.length === 0) {
        return next();
    }

    const shortPath = pathArray.join('/');

    // Jätetään rauhaan oikeat kansiot
    if (shortPath.startsWith('tyylit/') || shortPath.startsWith('admin/') || shortPath.startsWith('api/')) {
        return next();
    }

    try {
        // Etsitään lyhennettä tietokannasta
        const result = await env.DB.prepare("SELECT original_url FROM links WHERE short_path = ?").bind(shortPath).first();
        
        if (result && result.original_url) {
            // Linkki löytyi! Uudelleenohjataan
            return Response.redirect(result.original_url, 302);
        }
    } catch (e) {
        // Jätetään tietokantavirheet huomiotta tässä vaiheessa ja annetaan seuraavan vaiheen jatkaa
    }

    // Jos linkkiä ei löytynyt tietokannasta, annetaan Pagesin tarkistaa löytyykö tiedostoa
    const response = await next();
    
    // Jos tiedostoa ei löydy (404), ohjataan sinun hienolle error.html sivulle!
    if (response.status === 404) {
        return Response.redirect(new URL('/error.html', request.url), 302);
    }
    
    return response;
}


```

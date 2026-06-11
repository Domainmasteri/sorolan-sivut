```javascript
// Tämä tiedosto nappaa kaikki sivustolle tulevat pyynnöt (catch-all).
// Esim. soro.la/esimerkki saapuu tänne, jos staattista /esimerkki kansiota tai tiedostoa ei löydy.

export async function onRequestGet(context) {
    const { request, env, params, next } = context;

    // Haetaan URL-polku (params.path on array)
    const pathArray = params.path;
    if (!pathArray || pathArray.length === 0) {
        // Pääsivu soro.la/ -> annetaan Pagesin näyttää index.html normaalisti
        return next();
    }

    // Yhdistetään taulukko takaisin poluksi, esim. "make"
    const shortPath = pathArray.join('/');

    // Jos yritetään hakea fyysisiä tiedostoja (kuten tyylit/pohja.css), annetaan mennä ohi
    if (shortPath.startsWith('tyylit/') || shortPath.startsWith('admin/') || shortPath.startsWith('api/')) {
        return next();
    }

    try {
        // Etsitään lyhennettä tietokannasta
        const result = await env.DB.prepare("SELECT original_url FROM links WHERE short_path = ?").bind(shortPath).first();
        
        if (result && result.original_url) {
            // Linkki löytyi! Tehdään 302 uudelleenohjaus kohdeosoitteeseen
            return Response.redirect(result.original_url, 302);
        }
    } catch (e) {
        // Tietokantavirheen sattuessa sivuutetaan se hiljaa ja jatketaan
    }

    // Tähän päästään, jos linkkiä ei löytynyt tietokannasta.
    // Annetaan Cloudflare Pagesin jatkaa alkuperäisen reitin etsintää.
    // Cloudflare palauttaa automaattisesti sivuston rakenteen mukaisen vastauksen.
    const response = await next();
    
    // Jos Cloudflare Pages toteaa, että edes tiedostoa ei löydy (404),
    // näytämme kävijälle oman error.html sivusi!
    if (response.status === 404) {
        return Response.redirect(new URL('/error.html', request.url), 302);
    }
    
    return response;
}

```

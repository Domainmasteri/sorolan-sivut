// Aputoiminto salasanan hajauttamiseen
async function luoHash(teksti) {
    const msgBuffer = new TextEncoder().encode(teksti);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Aputoiminto valtuutuksen tarkistamiseen (D1 kanta ja base64 koodattu token)
async function tarkistaValtuutus(request, env) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
    
    try {
        const base64Token = authHeader.split(" ")[1];
        // Dekoodataan base64 (muotoa tunnus:salasana)
        const purettu = atob(base64Token);
        const [username, password] = purettu.split(":");
        
        if (!username || !password) return false;
        
        const passHash = await luoHash(password);
        const result = await env.DB.prepare(
            "SELECT id FROM users WHERE username = ? AND password_hash = ?"
        ).bind(username, passHash).first();
        
        return !!result;
    } catch (e) {
        return false;
    }
}

export async function onRequest(context) {
    const { request, env } = context;
    
    // Tarkista että käyttäjä on kirjautunut sisään
    const onValtuutettu = await tarkistaValtuutus(request, env);
    if (!onValtuutettu) {
        return new Response(JSON.stringify({ error: 'Ei valtuuksia. Kirjaudu uudelleen.' }), { status: 401 });
    }

    // Haetaan avain
    const shortIoKey = env.SHORT_IO_SECRET_KEY;
    
    // MUUTOS: Käytetään eri muuttujaa (ADMIN_SHORT_IO_DOMAIN) ettei mene ristiin srla.fi kanssa.
    // Jos muuttujaa ei ole asetettu Cloudflaren paneelissa, käytetään koodiin kovakoodattua 'soro.la' oletuksena.
    const domainStr = env.ADMIN_SHORT_IO_DOMAIN || 'soro.la';

    if (!shortIoKey) {
        return new Response(JSON.stringify({ error: 'Palvelimen konfiguraatio puuttuu (Short.io avain).' }), { status: 500 });
    }

    // Yhteiset API otsakkeet
    const apiHeaders = {
        'Authorization': shortIoKey,
        'Content-Type': 'application/json'
    };

    try {
        const url = new URL(request.url);

        // GET - Ladataan linkit
        if (request.method === "GET") {
            let domainId = env.SHORT_IO_DOMAIN_ID;
            
            if (!domainId) {
                // Haetaan domainId lennosta Short.iosta
                const domRes = await fetch("https://api.short.io/api/domains", { headers: apiHeaders });
                const domData = await domRes.json();
                const matchedDomain = domData.find(d => d.hostname === domainStr);
                if (matchedDomain) domainId = matchedDomain.id;
            }

            if (!domainId) throw new Error("Domainia ei löytynyt Short.iosta.");

            const res = await fetch(`https://api.short.io/api/links?domain_id=${domainId}&limit=100`, { headers: apiHeaders });
            const data = await res.json();
            return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // POST - Luodaan uusi linkki
        if (request.method === "POST") {
            const body = await request.json();
            const { originalURL, path } = body;
            
            const payload = {
                originalURL: originalURL,
                domain: domainStr // Käytetään ADMIN_SHORT_IO_DOMAIN:n arvoa
            };
            if (path && path.trim() !== "") {
                payload.path = path.trim();
            }

            const res = await fetch("https://api.short.io/links", {
                method: "POST",
                headers: apiHeaders,
                body: JSON.stringify(payload)
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Virhe luotaessa linkkiä APIssa.");
            
            return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // DELETE - Poistetaan linkki
        if (request.method === "DELETE") {
            const idString = url.searchParams.get('id');
            if (!idString) return new Response(JSON.stringify({ error: 'ID puuttuu' }), { status: 400 });

            const res = await fetch(`https://api.short.io/links/${idString}`, {
                method: "DELETE",
                headers: apiHeaders
            });
            
            if (!res.ok) throw new Error("Virhe poistettaessa linkkiä APIssa.");
            
            return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        return new Response("Tuntematon metodi.", { status: 405 });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
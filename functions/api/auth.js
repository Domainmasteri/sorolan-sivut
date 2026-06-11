```javascript
// functions/api/auth.js
async function luoHash(teksti) {
    const msgBuffer = new TextEncoder().encode(teksti);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost(context) {
    const { request, env } = context;
    
    try {
        const body = await request.json();
        
        // 1. KIRJAUTUMINEN
        if (body.action === 'login') {
            const { username, password } = body;
            if (!username || !password) return new Response(JSON.stringify({ error: 'Tunnus ja salasana vaaditaan.' }), { status: 400 });

            const passHash = await luoHash(password);

            const result = await env.DB.prepare(
                "SELECT id FROM users WHERE username = ? AND password_hash = ?"
            ).bind(username, passHash).first();

            if (result) {
                return new Response(JSON.stringify({ success: true }), { status: 200 });
            } else {
                return new Response(JSON.stringify({ error: 'Väärä käyttäjätunnus tai salasana.' }), { status: 401 });
            }
        }
        
        // 2. REKISTERÖINTI
        if (body.action === 'register') {
            const { inviteCode, username, password } = body;
            if (!inviteCode || !username || !password) return new Response(JSON.stringify({ error: 'Kaikki kentät vaaditaan.' }), { status: 400 });

            if (username.length < 3 || password.length < 6) {
                return new Response(JSON.stringify({ error: 'Tunnuksen minimipituus 3, salasanan 6 merkkiä.' }), { status: 400 });
            }

            const inviteHash = await luoHash(inviteCode);

            const inviteResult = await env.DB.prepare(
                "SELECT id FROM invites WHERE code_hash = ? AND is_used = 0"
            ).bind(inviteHash).first();

            if (!inviteResult) {
                return new Response(JSON.stringify({ error: 'Kutsukoodi on virheellinen tai jo käytetty.' }), { status: 400 });
            }

            const userCheck = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
            if (userCheck) {
                return new Response(JSON.stringify({ error: 'Käyttäjätunnus on jo varattu.' }), { status: 400 });
            }

            const passHash = await luoHash(password);
            
            await env.DB.batch([
                env.DB.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").bind(username, passHash),
                env.DB.prepare("UPDATE invites SET is_used = 1 WHERE id = ?").bind(inviteResult.id)
            ]);

            return new Response(JSON.stringify({ success: true, message: 'Käyttäjä luotu.' }), { status: 200 });
        }

        return new Response(JSON.stringify({ error: 'Tuntematon pyyntö.' }), { status: 400 });

    } catch (err) {
        return new Response(JSON.stringify({ error: 'Palvelinvirhe.', details: err.message }), { status: 500 });
    }
}


```
        tulos += merkit.charAt(Math.floor(Math.random() * merkit.length));
    }
    return tulos;
}

export async function onRequest(context) {
    const { request, env } = context;
    
    // Tarkistetaan kirjautuminen (paitsi OPTIONS-pyynnöissä jos käytetään CORSia, mutta sivu on samalla domainilla)
    const onValtuutettu = await tarkistaValtuutus(request, env);
    if (!onValtuutettu) {
        return new Response(JSON.stringify({ error: 'Ei valtuuksia. Kirjaudu uudelleen.' }), { status: 401 });
    }

    try {
        const url = new URL(request.url);

        // GET - Ladataan kaikki linkit tietokannasta uusimmasta vanhimpaan
        if (request.method === "GET") {
            const { results } = await env.DB.prepare("SELECT * FROM links ORDER BY created_at DESC").all();
            return new Response(JSON.stringify({ links: results }), { 
                status: 200, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        // POST - Luodaan uusi linkki omaan tietokantaan
        if (request.method === "POST") {
            const body = await request.json();
            const { originalURL } = body;
            let path = body.path;

            if (!originalURL) return new Response(JSON.stringify({ error: "Kohdeosoite puuttuu." }), { status: 400 });

            // Jos lyhennettä ei ole annettu, luodaan satunnainen
            if (!path || path.trim() === "") {
                path = luoSatunnainenPolku();
            } else {
                // Poistetaan välilyönnit ja erikoismerkit polusta turvallisuussyistä
                path = path.trim().replace(/[^a-zA-Z0-9_-]/g, "");
            }

            try {
                await env.DB.prepare(
                    "INSERT INTO links (short_path, original_url) VALUES (?, ?)"
                ).bind(path, originalURL).run();
                
                return new Response(JSON.stringify({ success: true, path: path }), { status: 200 });
            } catch (dbError) {
                // Virhe 19 SQLite:ssä on usein "UNIQUE constraint failed" eli polku on jo olemassa
                if (dbError.message.includes('UNIQUE')) {
                    return new Response(JSON.stringify({ error: "Tämä lyhenne on jo käytössä!" }), { status: 400 });
                }
                throw dbError;
            }
        }

        // DELETE - Poistetaan linkki
        if (request.method === "DELETE") {
            const pathToRemove = url.searchParams.get('path');
            if (!pathToRemove) return new Response(JSON.stringify({ error: 'Polku puuttuu' }), { status: 400 });

            await env.DB.prepare("DELETE FROM links WHERE short_path = ?").bind(pathToRemove).run();
            
            return new Response(JSON.stringify({ success: true }), { status: 200 });
        }

        return new Response("Tuntematon metodi.", { status: 405 });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}


```

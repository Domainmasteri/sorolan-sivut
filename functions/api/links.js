```javascript
// functions/api/links.js
async function luoHash(teksti) {
    const msgBuffer = new TextEncoder().encode(teksti);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function tarkistaValtuutus(request, env) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
    
    try {
        const base64Token = authHeader.split(" ")[1];
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

function luoSatunnainenPolku(pituus = 5) {
    const merkit = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let tulos = '';
    for (let i = 0; i < pituus; i++) {
        tulos += merkit.charAt(Math.floor(Math.random() * merkit.length));
    }
    return tulos;
}

export async function onRequest(context) {
    const { request, env } = context;
    
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
                path = path.trim().replace(/[^a-zA-Z0-9_-]/g, ""); // Poistaa erikoismerkit
            }

            try {
                await env.DB.prepare(
                    "INSERT INTO links (short_path, original_url) VALUES (?, ?)"
                ).bind(path, originalURL).run();
                
                return new Response(JSON.stringify({ success: true, path: path }), { status: 200 });
            } catch (dbError) {
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

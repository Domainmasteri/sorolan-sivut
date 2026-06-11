```javascript
// Aputoiminto salasanojen tiivisteen (hash) luomiseen SHA-256 avulla.
// Tätä ajetaan Cloudflare Workerissa, ei selaimessa.
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

            // Haetaan D1 tietokannasta
            const result = await env.DB.prepare(
                "SELECT id FROM users WHERE username = ? AND password_hash = ?"
            ).bind(username, passHash).first();

            if (result) {
                return new Response(JSON.stringify({ success: true }), { status: 200 });
            } else {
                return new Response(JSON.stringify({ error: 'Väärä käyttäjätunnus tai salasana.' }), { status: 401 });
            }
        }
        
        // 2. REKISTERÖINTI KUTSUKOODILLA
        if (body.action === 'register') {
            const { inviteCode, username, password } = body;
            if (!inviteCode || !username || !password) return new Response(JSON.stringify({ error: 'Kaikki kentät vaaditaan.' }), { status: 400 });

            // Tarkistetaan, että tunnus on tarpeeksi pitkä
            if (username.length < 3 || password.length < 6) {
                return new Response(JSON.stringify({ error: 'Tunnuksen minimipituus on 3 ja salasanan 6 merkkiä.' }), { status: 400 });
            }

            const inviteHash = await luoHash(inviteCode);

            // Tarkistetaan kutsukoodi (sen on oltava olemassa ja is_used = 0)
            const inviteResult = await env.DB.prepare(
                "SELECT id FROM invites WHERE code_hash = ? AND is_used = 0"
            ).bind(inviteHash).first();

            if (!inviteResult) {
                return new Response(JSON.stringify({ error: 'Kutsukoodi on virheellinen tai se on jo käytetty.' }), { status: 400 });
            }

            // Tarkistetaan onko tunnus jo olemassa
            const userCheck = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
            if (userCheck) {
                return new Response(JSON.stringify({ error: 'Käyttäjätunnus on jo varattu.' }), { status: 400 });
            }

            // Luodaan käyttäjä ja merkitään kutsukoodi käytetyksi
            const passHash = await luoHash(password);
            
            // D1 Batch - suoritetaan molemmat operaatiot turvallisesti peräkkäin
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

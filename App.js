// Apufunktio: Avaimen venytys (PBKDF2) salasanoille
async function hashPassword(password, saltString) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]
    );
    const salt = enc.encode(saltString);
    const key = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
        keyMaterial, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
    );
    const exported = await crypto.subtle.exportKey("raw", key);
    return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

// Apufunktio: Yksinkertainen evästeen luku
function getCookie(request, name) {
    const cookieString = request.headers.get("Cookie");
    if (!cookieString) return null;
    const match = cookieString.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
}

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const method = request.method;

    // 1. AUTENTIKAATIO: Tarkistetaan onko käyttäjä kirjautunut sisään
    const sessionId = getCookie(request, "session_user");
    let user = null;
    if (sessionId) {
        user = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(sessionId).first();
    }

    // --- REITITYKSET ---

    // LOGIN (Käyttäjätunnus ja salasana)
    if (url.pathname.endsWith("/login") && method === "POST") {
        const { username, password } = await request.json();
        const dbUser = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
        
        if (dbUser) {
            const hashedAttempt = await hashPassword(password, dbUser.salt);
            if (hashedAttempt === dbUser.password_hash) {
                if (dbUser.status === 'banned') return new Response("Bännätty", { status: 403 });
                
                return new Response("OK", {
                    status: 200,
                    headers: { "Set-Cookie": `session_user=${username}; HttpOnly; Path=/; Max-Age=86400` }
                });
            }
        }
        return new Response("Väärä tunnus tai salasana", { status: 401 });
    }

    // LOGOUT
    if (url.pathname.endsWith("/logout")) {
        return new Response("OK", {
            status: 200,
            headers: { "Set-Cookie": `session_user=; HttpOnly; Path=/; Max-Age=0` }
        });
    }

    // HAE JULKAISUT & HAKU
    if (url.pathname.endsWith("/posts") && method === "GET") {
        const search = url.searchParams.get("q") || "";
        let query = "SELECT * FROM posts WHERE title LIKE ? OR content LIKE ? ORDER BY created_at DESC";
        let results = await env.DB.prepare(query).bind(`%${search}%`, `%${search}%`).all();
        
        // Suodata yksityiset pois, jos ei ole kirjautunut
        let finalPosts = results.results;
        if (!user) {
            finalPosts = finalPosts.filter(p => p.is_private === 0);
        }
        return Response.json(finalPosts);
    }

    // LISÄÄ JULKAISU
    if (url.pathname.endsWith("/posts") && method === "POST") {
        if (!user || user.role === 'jäsen') return new Response("Ei oikeuksia", { status: 403 });
        const { title, content, image_url, is_private } = await request.json();
        await env.DB.prepare("INSERT INTO posts (title, content, image_url, is_private, user_id) VALUES (?, ?, ?, ?, ?)")
            .bind(title, content, image_url, is_private ? 1 : 0, user.id).run();
        return new Response("Luotu", { status: 201 });
    }

    // ASETUKSET (Yhteystiedot)
    if (url.pathname.endsWith("/settings") && method === "GET") {
        const setting = await env.DB.prepare("SELECT value FROM settings WHERE key = 'contact_info'").first();
        return Response.json({ contact_info: setting ? setting.value : "" });
    }
    
    // PÄIVITÄ YHTEYSTIEDOT (Vain Omistaja/Ylläpitäjä)
    if (url.pathname.endsWith("/settings") && method === "POST") {
        if (!user || (user.role !== 'omistaja' && user.role !== 'ylläpitäjä')) return new Response("Ei oikeuksia", { status: 403 });
        const { contact_info } = await request.json();
        await env.DB.prepare("UPDATE settings SET value = ? WHERE key = 'contact_info'").bind(contact_info).run();
        return new Response("Tallennettu", { status: 200 });
    }

    // LUO KÄYTTÄJÄ (Tave tai Ylläpitäjät)
    if (url.pathname.endsWith("/users") && method === "POST") {
        if (!user || (user.role !== 'omistaja' && user.role !== 'ylläpitäjä')) return new Response("Ei oikeuksia", { status: 403 });
        const { newUsername, newPassword, role } = await request.json();
        const salt = crypto.randomUUID();
        const hash = await hashPassword(newPassword, salt);
        await env.DB.prepare("INSERT INTO users (username, password_hash, salt, role) VALUES (?, ?, ?, ?)")
            .bind(newUsername, hash, salt, role).run();
        return new Response("Käyttäjä luotu", { status: 201 });
    }

    // SALASANAN PALAUTUS (Sähköposti)
    if (url.pathname.endsWith("/reset-password") && method === "POST") {
        // Tähän vaaditaan ulkoinen sähköpostipalvelu (esim. Resend tai Mailgun).
        [span_6](start_span)// Jos tämä ei tutaa käyttäen onnistu, käytän srla.fi-domainia tähän[span_6](end_span).
        return new Response("Sähköpostipalautus vaatii SMTP-palvelimen konfiguroinnin (esim. Resend).", { status: 501 });
    }

    return new Response("API Reittiä ei löydy", { status: 404 });
}

function respond(data, status = 200, origin = '*') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true'
    }
  });
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const pathArray = params.reitti || [];
  const endpoint = pathArray.join('/');
  
  const origin = request.headers.get('Origin');
  const allowedOrigins = ['https://sorola.fi', 'https://srla.fi', 'http://localhost:8788'];
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  if (request.method === 'OPTIONS') {
    return respond({ message: 'OK' }, 200, corsOrigin);
  }

  try {
    if (!env.LYHENNIN_DB) throw new Error("LYHENNIN_DB ei ole yhdistetty");

    // 1. ASETUKSET & ALUSTUS (Ei vaadi kirjautumista)
    if (endpoint === 'check-setup' && request.method === 'GET') {
      try {
        const row = await env.LYHENNIN_DB.prepare("SELECT count(*) as count FROM admins").first();
        return respond({ needsSetup: row.count === 0 }, 200, corsOrigin);
      } catch (e) {
        // Jos taulua ei ole olemassa, laukaistaan setup-näkymä
        return respond({ needsSetup: true }, 200, corsOrigin);
      }
    }

    if (endpoint === 'setup' && request.method === 'POST') {
      const data = await request.json();
      // Luodaan taulut dynaamisesti (ei tuhoa vanhaa dataa, jos linkki-taulu on jo)
      await env.LYHENNIN_DB.exec(`
        CREATE TABLE IF NOT EXISTS admins (username TEXT PRIMARY KEY, hash TEXT);
        CREATE TABLE IF NOT EXISTS links (short_code TEXT PRIMARY KEY, original_url TEXT, clicks INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS secrets (secret_code TEXT PRIMARY KEY, remaining_uses INTEGER);
        CREATE TABLE IF NOT EXISTS admin_invites (code TEXT PRIMARY KEY, created_by TEXT);
      `);
      await env.LYHENNIN_DB.prepare("INSERT INTO admins (username, hash) VALUES (?, ?)").bind(data.username, data.hash).run();
      return respond({ success: true }, 200, corsOrigin);
    }

    if (endpoint === 'register' && request.method === 'POST') {
      const data = await request.json();
      const invite = await env.LYHENNIN_DB.prepare("SELECT * FROM admin_invites WHERE code = ?").bind(data.inviteCode).first();
      if (!invite) return respond({ error: "Väärä tai käytetty kutsukoodi" }, 400, corsOrigin);
      
      await env.LYHENNIN_DB.prepare("INSERT INTO admins (username, hash) VALUES (?, ?)").bind(data.username, data.hash).run();
      await env.LYHENNIN_DB.prepare("DELETE FROM admin_invites WHERE code = ?").bind(data.inviteCode).run();
      return respond({ success: true }, 200, corsOrigin);
    }

    // ==========================================
    // LOPUT REITIT VAATIVAT AUTENTIKOINNIN
    // ==========================================
    const authUser = url.searchParams.get('admin_user');
    const authHash = url.searchParams.get('admin_hash');
    
    if (!authUser || !authHash) return respond({ error: "Kirjaudu sisään!" }, 401, corsOrigin);
    
    const adminCheck = await env.LYHENNIN_DB.prepare("SELECT * FROM admins WHERE username = ? AND hash = ?").bind(authUser, authHash).first();
    if (!adminCheck) return respond({ error: "Istunto vanhentunut tai väärä salasana" }, 403, corsOrigin);

    // 2. KAIKKIEN TIETOJEN LATAUS (list)
    if (endpoint === 'list' && request.method === 'GET') {
      let links = [], secrets = [], adminInvites = [], admins = [];
      
      // Try-catch lohkot estävät kaatumisen, jos jokin taulu on tyhjä
      try { links = (await env.LYHENNIN_DB.prepare("SELECT * FROM links ORDER BY created_at DESC").all()).results; } catch(e){}
      try { secrets = (await env.LYHENNIN_DB.prepare("SELECT * FROM secrets").all()).results; } catch(e){}
      try { adminInvites = (await env.LYHENNIN_DB.prepare("SELECT * FROM admin_invites").all()).results; } catch(e){}
      try { admins = (await env.LYHENNIN_DB.prepare("SELECT username FROM admins").all()).results; } catch(e){}

      return respond({ links, secrets, adminInvites, admins }, 200, corsOrigin);
    }

    // 3. LYHYTLINKKIEN HALLINTA
    if (endpoint === 'links/save' && request.method === 'POST') {
      const data = await request.json();
      if (data.oldCode) {
        await env.LYHENNIN_DB.prepare("UPDATE links SET short_code = ?, original_url = ? WHERE short_code = ?").bind(data.code, data.url, data.oldCode).run();
      } else {
        await env.LYHENNIN_DB.prepare("INSERT INTO links (short_code, original_url) VALUES (?, ?)").bind(data.code, data.url).run();
      }
      return respond({ success: true }, 200, corsOrigin);
    }
    
    if (endpoint === 'links/delete' && request.method === 'POST') {
      const code = url.searchParams.get('code');
      await env.LYHENNIN_DB.prepare("DELETE FROM links WHERE short_code = ?").bind(code).run();
      return respond({ success: true }, 200, corsOrigin);
    }

    // 4. SALASANOJEN HALLINTA
    if (endpoint === 'secrets/save' && request.method === 'POST') {
      const data = await request.json();
      await env.LYHENNIN_DB.prepare("INSERT INTO secrets (secret_code, remaining_uses) VALUES (?, ?) ON CONFLICT(secret_code) DO UPDATE SET remaining_uses = ?").bind(data.secret, data.uses, data.uses).run();
      return respond({ success: true }, 200, corsOrigin);
    }
    
    if (endpoint === 'secrets/delete' && request.method === 'POST') {
      const code = url.searchParams.get('code');
      await env.LYHENNIN_DB.prepare("DELETE FROM secrets WHERE secret_code = ?").bind(code).run();
      return respond({ success: true }, 200, corsOrigin);
    }

    // 5. ADMIN-KUTSUKOODIT
    if (endpoint === 'admin_invites/add' && request.method === 'POST') {
      const data = await request.json();
      await env.LYHENNIN_DB.prepare("INSERT INTO admin_invites (code, created_by) VALUES (?, ?)").bind(data.code, authUser).run();
      return respond({ success: true }, 200, corsOrigin);
    }
    
    if (endpoint === 'admin_invites/delete' && request.method === 'POST') {
      const code = url.searchParams.get('code');
      await env.LYHENNIN_DB.prepare("DELETE FROM admin_invites WHERE code = ?").bind(code).run();
      return respond({ success: true }, 200, corsOrigin);
    }

    // 6. YLLÄPITÄJÄN POISTO
    if (endpoint === 'delete-admin' && request.method === 'POST') {
      const target = url.searchParams.get('code');
      if (target.toLowerCase() === 'make') return respond({ error: 'Pääkäyttäjää ei voi poistaa' }, 403, corsOrigin);
      await env.LYHENNIN_DB.prepare("DELETE FROM admins WHERE username = ?").bind(target).run();
      return respond({ success: true }, 200, corsOrigin);
    }

    return respond({ error: 'Reittiä ei löytynyt', requested: endpoint }, 404, corsOrigin);
    
  } catch (err) {
    return respond({ error: err.message }, 500, corsOrigin);
  }
}

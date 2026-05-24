function respond(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const endpoint = (params.reitti || []).join('/');

  if (!env.LYHENNIN_DB) return respond({ error: "LYHENNIN_DB puuttuu" }, 500);

  try {
    // 1. JULKISET REITIT (Ei vaadi kirjautumista)
    if (endpoint === 'check-setup' && request.method === 'GET') {
      try {
        const row = await env.LYHENNIN_DB.prepare("SELECT count(*) as count FROM admins").first();
        return respond({ needsSetup: row.count === 0 });
      } catch (e) {
        return respond({ needsSetup: true });
      }
    }

    if (endpoint === 'setup' && request.method === 'POST') {
      const data = await request.json();
      const countRow = await env.LYHENNIN_DB.prepare("SELECT count(*) as count FROM admins").first();
      if (countRow && countRow.count > 0) return respond({ error: "Alustus on jo tehty!" }, 403);
      
      await env.LYHENNIN_DB.prepare("INSERT INTO admins (username, password_hash) VALUES (?, ?)").bind(data.username, data.hash).run();
      return respond({ success: true });
    }

    if (endpoint === 'register' && request.method === 'POST') {
      const data = await request.json();
      const invite = await env.LYHENNIN_DB.prepare("SELECT * FROM admin_invites WHERE code = ?").bind(data.inviteCode).first();
      if (!invite) return respond({ error: "Väärä tai käytetty kutsukoodi" }, 400);
      
      await env.LYHENNIN_DB.prepare("INSERT INTO admins (username, password_hash) VALUES (?, ?)").bind(data.username, data.hash).run();
      await env.LYHENNIN_DB.prepare("DELETE FROM admin_invites WHERE code = ?").bind(data.inviteCode).run();
      return respond({ success: true });
    }

    if (endpoint === 'login' && request.method === 'POST') {
      const data = await request.json();
      const user = await env.LYHENNIN_DB.prepare("SELECT * FROM admins WHERE username = ? AND password_hash = ?").bind(data.username, data.hash).first();
      if (user) return respond({ success: true });
      return respond({ error: "Väärä käyttäjätunnus tai salasana" }, 401);
    }

    // 2. SUOJATUT REITIT (Vaatii tietokantatarkistuksen)
    const authUser = url.searchParams.get('admin_user');
    const authHash = url.searchParams.get('admin_hash');
    if (!authUser || !authHash) return respond({ error: "Kirjaudu sisään!" }, 401);
    
    const adminCheck = await env.LYHENNIN_DB.prepare("SELECT * FROM admins WHERE username = ? AND password_hash = ?").bind(authUser, authHash).first();
    if (!adminCheck) return respond({ error: "Istunto vanhentunut tai väärä salasana" }, 403);

    // Listaus
    if (endpoint === 'list' && request.method === 'GET') {
      const links = (await env.LYHENNIN_DB.prepare("SELECT * FROM links ORDER BY created_at DESC").all()).results || [];
      const secrets = (await env.LYHENNIN_DB.prepare("SELECT * FROM api_secrets").all()).results || [];
      const adminInvites = (await env.LYHENNIN_DB.prepare("SELECT * FROM admin_invites").all()).results || [];
      const admins = (await env.LYHENNIN_DB.prepare("SELECT username FROM admins").all()).results || [];
      return respond({ links, secrets, adminInvites, admins });
    }

    // Linkkien hallinta
    if (endpoint === 'links/save' && request.method === 'POST') {
      const data = await request.json();
      if (data.oldCode) {
        await env.LYHENNIN_DB.prepare("UPDATE links SET short_code = ?, original_url = ? WHERE short_code = ?").bind(data.code, data.url, data.oldCode).run();
      } else {
        await env.LYHENNIN_DB.prepare("INSERT INTO links (short_code, original_url) VALUES (?, ?)").bind(data.code, data.url).run();
      }
      return respond({ success: true });
    }
    if (endpoint === 'links/delete' && request.method === 'POST') {
      await env.LYHENNIN_DB.prepare("DELETE FROM links WHERE short_code = ?").bind(url.searchParams.get('code')).run();
      return respond({ success: true });
    }

    // Salasanojen hallinta (api_secrets)
    if (endpoint === 'secrets/save' && request.method === 'POST') {
      const data = await request.json();
      await env.LYHENNIN_DB.prepare("INSERT INTO api_secrets (secret_code, remaining_uses) VALUES (?, ?) ON CONFLICT(secret_code) DO UPDATE SET remaining_uses = ?").bind(data.secret, data.uses, data.uses).run();
      return respond({ success: true });
    }
    if (endpoint === 'secrets/delete' && request.method === 'POST') {
      await env.LYHENNIN_DB.prepare("DELETE FROM api_secrets WHERE secret_code = ?").bind(url.searchParams.get('code')).run();
      return respond({ success: true });
    }

    // Kutsukoodien hallinta
    if (endpoint === 'admin_invites/add' && request.method === 'POST') {
      const data = await request.json();
      await env.LYHENNIN_DB.prepare("INSERT INTO admin_invites (code, created_by) VALUES (?, ?)").bind(data.code, authUser).run();
      return respond({ success: true });
    }
    if (endpoint === 'admin_invites/delete' && request.method === 'POST') {
      await env.LYHENNIN_DB.prepare("DELETE FROM admin_invites WHERE code = ?").bind(url.searchParams.get('code')).run();
      return respond({ success: true });
    }

    // Admin poisto
    if (endpoint === 'delete-admin' && request.method === 'POST') {
      const target = url.searchParams.get('code');
      if (target.toLowerCase() === 'make') return respond({ error: 'Pääkäyttäjää ei voi poistaa' }, 403);
      await env.LYHENNIN_DB.prepare("DELETE FROM admins WHERE username = ?").bind(target).run();
      return respond({ success: true });
    }

    return respond({ error: 'Reittiä ei löytynyt' }, 404);
  } catch (err) {
    return respond({ error: err.message }, 500);
  }
}

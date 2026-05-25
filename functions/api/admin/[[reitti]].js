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
      let shortIoLinks = [];
      try {
        if (env.SHORT_IO_SECRET_KEY && env.SHORT_IO_DOMAIN_ID) {
          const res = await fetch(`https://api.short.io/api/links?domain_id=${env.SHORT_IO_DOMAIN_ID}&limit=150`, {
            headers: { "Authorization": env.SHORT_IO_SECRET_KEY }
          });
          const data = await res.json();
          if (data.links) {
            shortIoLinks = data.links.map(l => ({
              idString: l.idString,
              short_code: l.path,
              original_url: l.originalURL,
              clicks: l.clicks || 0
            }));
          }
        }
      } catch (e) {
        console.error("Short.io -virhe:", e);
      }

      const adminInvites = (await env.LYHENNIN_DB.prepare("SELECT * FROM admin_invites").all()).results || [];
      const admins = (await env.LYHENNIN_DB.prepare("SELECT username FROM admins").all()).results || [];
      // Palautetaan data ilman secrets-osiota
      return respond({ links: shortIoLinks, adminInvites, admins });
    }

    // Linkkien hallinta (Short.io)
    if (endpoint === 'links/save' && request.method === 'POST') {
      const data = await request.json();
      const payload = { originalURL: data.url };
      if (data.code && data.code.trim() !== "") payload.path = data.code;

      try {
        if (data.idString) {
          const upRes = await fetch(`https://api.short.io/links/${data.idString}`, {
            method: 'POST',
            headers: { "Authorization": env.SHORT_IO_SECRET_KEY, "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (!upRes.ok) {
             const errData = await upRes.json();
             return respond({ error: errData.error || "Päivitys epäonnistui Short.io:ssa" }, 400);
          }
        } else {
          payload.domain = env.SHORT_IO_DOMAIN;
          const newRes = await fetch(`https://api.short.io/links`, {
            method: 'POST',
            headers: { "Authorization": env.SHORT_IO_SECRET_KEY, "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (!newRes.ok) {
             const errData = await newRes.json();
             return respond({ error: errData.error || "Luonti epäonnistui Short.io:ssa" }, 400);
          }
        }
        return respond({ success: true });
      } catch (err) {
        return respond({ error: err.message }, 500);
      }
    }

    if (endpoint === 'links/delete' && request.method === 'POST') {
      const idString = url.searchParams.get('code');
      try {
        const delRes = await fetch(`https://api.short.io/links/${idString}`, {
          method: 'DELETE',
          headers: { "Authorization": env.SHORT_IO_SECRET_KEY }
        });
        if (!delRes.ok) return respond({ error: "Poisto epäonnistui Short.io:ssa" }, 400);
        return respond({ success: true });
      } catch (err) {
        return respond({ error: err.message }, 500);
      }
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
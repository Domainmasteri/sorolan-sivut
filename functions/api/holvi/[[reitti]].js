export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method === "OPTIONS") return new Response(null, { status: 200 });

  function respond(data, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  }

  const NYKYHETKI = Math.floor(Date.now() / 1000);

  // --- ADMIN-PANEELIN LIITÄNTÄ ---
  if (url.pathname.includes("/admin")) {
    
    // KORJATTU: Tarkistetaan suoraan LYHENNIN_DB:n admins-taulusta ympäristömuuttujan sijaan!
    const adminUser = url.searchParams.get("admin_user");
    const adminHash = url.searchParams.get("admin_hash");
    
    if (!adminUser || !adminHash || !env.LYHENNIN_DB) {
      return respond({ error: "Evätty: Tunnistautumistiedot tai kanta puuttuu!" }, 403);
    }

    const oikeaAdmin = await env.LYHENNIN_DB.prepare("SELECT * FROM admins WHERE username = ? AND password_hash = ?").bind(adminUser, adminHash).first();
    if (!oikeaAdmin) {
      return respond({ error: "Evätty: Väärä ylläpitäjän salasana!" }, 403);
    }

    // 1. Listaa kaikki Holvin kutsukoodit
    if (url.pathname.endsWith("/admin/invites")) {
      try {
        const rows = await env.HOLVI_DB.prepare("SELECT koodi, kaytetty FROM kutsukoodit").all();
        return respond({ invites: rows.results });
      } catch (e) {
        return respond({ error: "Tietokantavirhe: " + e.message }, 500);
      }
    }

    // 2. Lisää uusi kutsukoodi
    if (url.pathname.endsWith("/admin/invites/add") && request.method === "POST") {
      try {
        const body = await request.json();
        if (!body.code) return respond({ error: "Koodi puuttuu" }, 400);
        await env.HOLVI_DB.prepare("INSERT INTO kutsukoodit (koodi, kaytetty) VALUES (?, 0)").bind(body.code).run();
        return respond({ success: true });
      } catch (e) {
        return respond({ error: "Koodi on jo olemassa tai tapahtui virhe." }, 400);
      }
    }

    // 3. Poista kutsukoodi
    if (url.pathname.endsWith("/admin/invites/delete") && request.method === "POST") {
      try {
        const code = url.searchParams.get("code");
        await env.HOLVI_DB.prepare("DELETE FROM kutsukoodit WHERE koodi = ?").bind(code).run();
        return respond({ success: true });
      } catch (e) {
        return respond({ error: "Poisto epäonnistui." }, 500);
      }
    }
  }

  // --- REKISTERÖINTI JA SALASANAN VAIHTO ---
  if (request.method === "POST" && url.pathname.endsWith("/rekisteroi")) {
    const { tunnus, salasana_hash, kutsukoodi } = await request.json();
    
    if (kutsukoodi !== "PAIVITYS_SALASANALLE") {
      const koodiTarkistus = await env.HOLVI_DB.prepare("SELECT * FROM kutsukoodit WHERE koodi = ? AND kaytetty = 0").bind(kutsukoodi).first();
      if (!koodiTarkistus) return respond({ error: "Väärä tai jo käytetty kutsukoodi!" }, 400);
      await env.HOLVI_DB.prepare("UPDATE kutsukoodit SET kaytetty = 1 WHERE koodi = ?").bind(kutsukoodi).run();
    }

    try {
      await env.HOLVI_DB.prepare("INSERT INTO kayttajat (tunnus, salasana_hash, luotu_at) VALUES (?, ?, ?) ON CONFLICT(tunnus) DO UPDATE SET salasana_hash = ?").bind(tunnus.toLowerCase(), salasana_hash, NYKYHETKI, salasana_hash).run();
      return respond({ success: true });
    } catch (e) {
      return respond({ error: "Rekisteröinti epäonnistui." }, 500);
    }
  }

  // --- KIRJAUTUMINEN ---
  if (request.method === "POST" && url.pathname.endsWith("/kirjaudu")) {
    const { tunnus, salasana_hash } = await request.json();
    const kayttaja = await env.HOLVI_DB.prepare("SELECT * FROM kayttajat WHERE tunnus = ? AND salasana_hash = ?").bind(tunnus.toLowerCase(), salasana_hash).first();
    if (kayttaja) return respond({ success: true });
    return respond({ error: "Väärä käyttäjätunnus tai pääsalasana!" }, 401);
  }

  // --- TALLENTEIDEN HAKU ---
  if (request.method === "POST" && url.pathname.endsWith("/hae")) {
    const { omistaja } = await request.json();
    const tallenteet = await env.HOLVI_DB.prepare("SELECT id, palvelu, kayttaja, salattu_salasana FROM tallenteet WHERE omistaja = ? ORDER BY id DESC").bind(omistaja.toLowerCase()).all();
    return respond(tallenteet.results);
  }

  // --- TALLENTEEN LISÄYS / MUOKKAUS ---
  if (request.method === "POST" && url.pathname.endsWith("/tallenna")) {
    const { id, palvelu, kayttaja, salattu_salasana, omistaja } = await request.json();
    if (id) {
      await env.HOLVI_DB.prepare("UPDATE tallenteet SET palvelu=?, kayttaja=?, salattu_salasana=? WHERE id=? AND omistaja=?").bind(palvelu, kayttaja, salattu_salasana, id, omistaja.toLowerCase()).run();
    } else {
      await env.HOLVI_DB.prepare("INSERT INTO tallenteet (palvelu, kayttaja, salattu_salasana, omistaja) VALUES (?, ?, ?, ?)").bind(palvelu, kayttaja, salattu_salasana, omistaja.toLowerCase()).run();
    }
    return respond({ success: true });
  }

  // --- YKSITTÄISEN SALASANAN POISTO ---
  if (request.method === "DELETE" && url.pathname.endsWith("/poista")) {
    const { id, omistaja } = await request.json();
    await env.HOLVI_DB.prepare("DELETE FROM tallenteet WHERE id = ? AND omistaja = ?").bind(id, omistaja.toLowerCase()).run();
    return respond({ success: true });
  }

  // --- KOKO TILIN POISTAMINEN ---
  if (request.method === "DELETE" && url.pathname.endsWith("/poista-tili")) {
    const { tunnus } = await request.json();
    await env.HOLVI_DB.prepare("DELETE FROM tallenteet WHERE omistaja = ?").bind(tunnus.toLowerCase()).run();
    await env.HOLVI_DB.prepare("DELETE FROM kayttajat WHERE tunnus = ?").bind(tunnus.toLowerCase()).run();
    return respond({ success: true });
  }

  return respond({ error: "Reittiä ei löydy" }, 404);
}

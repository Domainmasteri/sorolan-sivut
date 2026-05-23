export async function onRequest(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(request.url);
  const NYKYHETKI = Math.floor(Date.now() / 1000);
  const adminSecretParam = url.searchParams.get("admin_secret");

  // --- ADMIN-PANEELIN LIITÄNTÄ ---
  // Muutettu includes, jotta toimii kansiorakenteessa
  if (url.pathname.includes("/admin")) {
    
    // Varmistetaan, että pyynnön mukana tullut salake vastaa Workerin asetuksissa olevaa ADMIN_SECRET-hashia
    if (!env.ADMIN_SECRET || adminSecretParam !== env.ADMIN_SECRET) {
      return new Response(JSON.stringify({ error: "Evätty!" }), { status: 403, headers: corsHeaders });
    }

    // 1. Listaa kaikki Holvin kutsukoodit
    if (url.pathname.endsWith("/admin/invites")) {
      try {
        const rows = await env.HOLVI_DB.prepare("SELECT koodi, kaytetty FROM kutsukoodit").all();
        return new Response(JSON.stringify({ invites: rows.results }), { headers: corsHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Tietokantavirhe: " + e.message }), { status: 500, headers: corsHeaders });
      }
    }

    // 2. Lisää uusi kutsukoodi
    if (url.pathname.endsWith("/admin/invites/add") && request.method === "POST") {
      try {
        const body = await request.json();
        if (!body.code) return new Response(JSON.stringify({ error: "Koodi puuttuu" }), { status: 400, headers: corsHeaders });
        await env.HOLVI_DB.prepare("INSERT INTO kutsukoodit (koodi, kaytetty) VALUES (?, 0)").bind(body.code).run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Koodi on jo olemassa tai tapahtui virhe." }), { status: 400, headers: corsHeaders });
      }
    }

    // 3. Poista kutsukoodi
    if (url.pathname.endsWith("/admin/invites/delete") && request.method === "POST") {
      try {
        const code = url.searchParams.get("code");
        await env.HOLVI_DB.prepare("DELETE FROM kutsukoodit WHERE koodi = ?").bind(code).run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Poisto epäonnistui." }), { status: 500, headers: corsHeaders });
      }
    }
  }

  // --- REKISTERÖINTI JA SALASANAN VAIHTO ---
  if (request.method === "POST" && url.pathname.endsWith("/rekisteroi")) {
    const { tunnus, salasana_hash, kutsukoodi } = await request.json();
    
    if (kutsukoodi !== "PAIVITYS_SALASANALLE") {
      const koodiTarkistus = await env.HOLVI_DB.prepare(
        "SELECT * FROM kutsukoodit WHERE koodi = ? AND kaytetty = 0"
      ).bind(kutsukoodi).first();

      if (!koodiTarkistus) {
        return new Response(JSON.stringify({ error: "Väärä tai jo käytetty kutsukoodi!" }), { status: 400, headers: corsHeaders });
      }
      await env.HOLVI_DB.prepare("UPDATE kutsukoodit SET kaytetty = 1 WHERE koodi = ?").bind(kutsukoodi).run();
    }

    try {
      await env.HOLVI_DB.prepare(
        "INSERT INTO kayttajat (tunnus, salasana_hash, luotu_at) VALUES (?, ?, ?) ON CONFLICT(tunnus) DO UPDATE SET salasana_hash = ?"
      ).bind(tunnus.toLowerCase(), salasana_hash, NYKYHETKI, salasana_hash).run();

      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    } catch (e) {
      return new Response(JSON.stringify({ error: "Rekisteröinti epäonnistui tietokantavirheen vuoksi." }), { status: 500, headers: corsHeaders });
    }
  }

  // --- KIRJAUTUMINEN ---
  if (request.method === "POST" && url.pathname.endsWith("/kirjaudu")) {
    const { tunnus, salasana_hash } = await request.json();
    const kayttaja = await env.HOLVI_DB.prepare(
      "SELECT * FROM kayttajat WHERE tunnus = ? AND salasana_hash = ?"
    ).bind(tunnus.toLowerCase(), salasana_hash).first();

    if (kayttaja) {
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    } else {
      return new Response(JSON.stringify({ error: "Väärä käyttäjätunnus tai pääsalasana!" }), { status: 401, headers: corsHeaders });
    }
  }

  // --- TALLENTEIDEN HAKU ---
  if (request.method === "POST" && url.pathname.endsWith("/hae")) {
    const { omistaja } = await request.json();
    const tallenteet = await env.HOLVI_DB.prepare(
      "SELECT id, palvelu, kayttaja, salattu_salasana FROM tallenteet WHERE omistaja = ? ORDER BY id DESC"
    ).bind(omistaja.toLowerCase()).all();

    return new Response(JSON.stringify(tallenteet.results), { headers: corsHeaders });
  }

  // --- TALLENTEEN LISÄYS / MUOKKAUS ---
  if (request.method === "POST" && url.pathname.endsWith("/tallenna")) {
    const { id, palvelu, kayttaja, salattu_salasana, omistaja } = await request.json();

    if (id) {
      await env.HOLVI_DB.prepare("UPDATE tallenteet SET palvelu=?, kayttaja=?, salattu_salasana=? WHERE id=? AND omistaja=?")
        .bind(palvelu, kayttaja, salattu_salasana, id, omistaja.toLowerCase()).run();
    } else {
      await env.HOLVI_DB.prepare("INSERT INTO tallenteet (palvelu, kayttaja, salattu_salasana, omistaja) VALUES (?, ?, ?, ?)")
        .bind(palvelu, kayttaja, salattu_salasana, omistaja.toLowerCase()).run();
    }
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  }

  // --- YKSITTÄISEN SALASANAN POISTO ---
  if (request.method === "DELETE" && url.pathname.endsWith("/poista")) {
    const { id, omistaja } = await request.json();
    await env.HOLVI_DB.prepare("DELETE FROM tallenteet WHERE id = ? AND omistaja = ?")
      .bind(id, omistaja.toLowerCase()).run();
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  }

  // --- KOKO TILIN POISTAMINEN ---
  if (request.method === "DELETE" && url.pathname.endsWith("/poista-tili")) {
    const { tunnus } = await request.json();
    const nimesi = tunnus.toLowerCase();
    await env.HOLVI_DB.prepare("DELETE FROM tallenteet WHERE omistaja = ?").bind(nimesi).run();
    await env.HOLVI_DB.prepare("DELETE FROM kayttajat WHERE tunnus = ?").bind(nimesi).run();
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  }

  return new Response("Reittiä ei löydy", { status: 404, headers: corsHeaders });
}

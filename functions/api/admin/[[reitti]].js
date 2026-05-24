function respond(data, status = 200, origin = '*') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // Turvallinen CORS, joka vaaditaan evästeille/sessioille
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true'
    }
  });
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const pathArray = params.reitti || [];
  const endpoint = pathArray.join('/');
  
  const origin = request.headers.get('Origin');
  // Sallitaan vain omat domainit, ettei rajapintaa huudella muualta
  const allowedOrigins = ['https://sorola.fi', 'https://srla.fi', 'http://localhost:8788'];
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  // Preflight-tarkistus (selaimen tekemä automaattinen varmennus)
  if (request.method === 'OPTIONS') {
    return respond({ message: 'OK' }, 200, corsOrigin);
  }

  try {
    // 1. Asetusten tilan tarkistus (check-setup)
    if (endpoint === 'check-setup' && request.method === 'GET') {
      // Tässä voit tarkistaa onko järjestelmässä yhtään adminia tms.
      // Esimerkissä palautetaan toistaiseksi aina tosi.
      return respond({ setup: true }, 200, corsOrigin);
    }

    // 2. Sisäänkirjautuminen (login)
    if (endpoint === 'login' && request.method === 'POST') {
      const data = await request.json();
      // Oletetaan, että salasana on tallennettu Cloudflaren Environment Variables -asetuksiin nimellä ADMIN_SECRET
      if (data.password === env.ADMIN_SECRET) {
        return respond({ success: true, message: 'Kirjautuminen onnistui' }, 200, corsOrigin);
      }
      return respond({ error: 'Väärä salasana tai tunnus' }, 401, corsOrigin);
    }

    // 3. Esimerkki: Lyhytlinkkien haku (list)
    if (endpoint === 'list' && request.method === 'GET') {
      if (!env.LYHENNIN_DB) throw new Error("LYHENNIN_DB ei ole yhdistetty");
      // Oletuksena haemme 'links' nimisestä taulusta. Vaihda tarvittaessa omasi!
      const { results } = await env.LYHENNIN_DB.prepare("SELECT * FROM links ORDER BY created_at DESC").all();
      return respond({ items: results }, 200, corsOrigin);
    }

    // Jos endpointia ei koodattu tähän tiedostoon
    return respond({ error: 'Reittiä ei löytynyt', requested: endpoint }, 404, corsOrigin);
    
  } catch (err) {
    return respond({ error: err.message }, 500, corsOrigin);
  }
}

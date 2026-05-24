function respond(data, status = 200, origin = '*') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true'
    }
  });
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const endpoint = (params.reitti || []).join('/');
  
  const origin = request.headers.get('Origin');
  const corsOrigin = ['https://sorola.fi', 'https://srla.fi', 'http://localhost:8788'].includes(origin) ? origin : 'https://sorola.fi';

  if (request.method === 'OPTIONS') return respond({ message: 'OK' }, 200, corsOrigin);

  try {
    // 1. KIRJAUTUMISTARKISTUS (Käytetään tietokantaa, ei ympäristömuuttujaa)
    if (endpoint === 'login' && request.method === 'POST') {
      const { username, hash } = await request.json();
      const user = await env.LYHENNIN_DB.prepare("SELECT * FROM admins WHERE username = ? AND password_hash = ?").bind(username, hash).first();
      
      if (user) return respond({ success: true }, 200, corsOrigin);
      return respond({ error: "Väärät tunnukset" }, 401, corsOrigin);
    }

    // 2. LISTAUS (Vaatii kirjautumisen - tässä yksinkertaistettu tarkistus)
    if (endpoint === 'list' && request.method === 'GET') {
      const links = await env.LYHENNIN_DB.prepare("SELECT * FROM links").all();
      const admins = await env.LYHENNIN_DB.prepare("SELECT username FROM admins").all();
      
      return respond({ 
        links: links.results, 
        admins: admins.results 
      }, 200, corsOrigin);
    }

    return respond({ error: 'Reittiä ei löytynyt' }, 404, corsOrigin);
    
  } catch (err) {
    return respond({ error: err.message }, 500, corsOrigin);
  }
}

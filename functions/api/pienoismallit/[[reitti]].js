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
  const pathArray = params.reitti || [];
  const endpoint = pathArray.join('/');

  const origin = request.headers.get('Origin');
  const allowedOrigins = ['https://sorola.fi', 'https://srla.fi', 'http://localhost:8788'];
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  if (request.method === 'OPTIONS') {
    return respond({ message: 'OK' }, 200, corsOrigin);
  }

  try {
    if (!env.MALLI_DB) {
       return respond({ error: 'MALLI_DB -tietokantaa ei ole yhdistetty!' }, 500, corsOrigin);
    }

    // 1. Hae kaikki postaukset
    if (endpoint === 'posts' && request.method === 'GET') {
      // Tarkista vastaako taulun nimi ('posts') sitä mitä loit D1-kantaasi
      const { results } = await env.MALLI_DB.prepare("SELECT * FROM posts ORDER BY id DESC").all();
      return respond({ posts: results }, 200, corsOrigin);
    }

    // 2. Lisää uusi postaus
    if (endpoint === 'posts' && request.method === 'POST') {
      const data = await request.json();
      const info = await env.MALLI_DB.prepare(
        "INSERT INTO posts (title, description) VALUES (?, ?)"
      ).bind(data.title, data.description).run();
      
      return respond({ success: true, id: info.lastRowId }, 200, corsOrigin);
    }

    return respond({ error: 'Reittiä ei löytynyt', requested: endpoint }, 404, corsOrigin);
    
  } catch (err) {
    return respond({ error: err.message }, 500, corsOrigin);
  }
}

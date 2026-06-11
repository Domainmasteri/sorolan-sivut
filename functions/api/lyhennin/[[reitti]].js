// functions/api/[[reitti]].js

function luoSatunnainenPolku(pituus = 5) {
  const merkit = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let tulos = '';
  for (let i = 0; i < pituus; i++) {
    tulos += merkit.charAt(Math.floor(Math.random() * merkit.length));
  }
  return tulos;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Tunnistetaan selainlaajennuksen tekemä kutsu
  if (url.pathname.includes("/create")) {
    const kohdeUrl = url.searchParams.get("url");
    let koodi = url.searchParams.get("code");
    // Selainlaajennuksen lähettämä "secret" (salasana) otetaan vastaan, 
    // mutta sitä ei tällä hetkellä tallenneta tietokantaan, koska uusi 
    // tietokantataulumme ei tue vielä salasanasuojattuja linkkejä.
    
    if (!kohdeUrl) {
      return new Response(JSON.stringify({ error: "URL puuttuu" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Jos koodia ei ole annettu, luodaan satunnainen
    let path = koodi;
    if (!path || path.trim() === "") {
        path = luoSatunnainenPolku();
    } else {
        path = path.trim().replace(/[^a-zA-Z0-9_-]/g, ""); // Poistaa erikoismerkit turvallisuussyistä
    }

    try {
      // Tallennetaan suoraan uuteen srla_links -tauluun
      await env.DB.prepare(
          "INSERT INTO srla_links (short_path, original_url) VALUES (?, ?)"
      ).bind(path, kohdeUrl).run();
      
      // Laajennus odottaa vastausta muodossa: { success: true, shortUrl: "osoite" }
      const shortUrl = `https://srla.fi/${path}`;

      return new Response(JSON.stringify({ success: true, shortUrl: shortUrl }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });

    } catch (dbError) {
      // Jos tietokanta antaa UNIQUE-virheen, koodi on jo varattu
      if (dbError.message.includes('UNIQUE')) {
          return new Response(JSON.stringify({ error: "Tämä lyhenne on jo käytössä!" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "Palvelinvirhe: " + dbError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

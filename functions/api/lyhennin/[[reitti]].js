export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // TÄMÄ vastaa polkua /api/lyhennin/create
  if (url.pathname.endsWith("/create")) {
    const kohdeUrl = url.searchParams.get("url");
    let koodi = url.searchParams.get("code");

    if (!kohdeUrl) return new Response(JSON.stringify({ error: "URL puuttuu" }), { status: 400, headers: corsHeaders });

    if (!koodi || koodi.trim() === "") koodi = Math.random().toString(36).substr(2, 6);

    try {
      // Tarkistetaan onko varattu
      const olemassa = await env.LYHENNIN_DB.prepare("SELECT short_code FROM links WHERE short_code = ?").bind(koodi).first();
      if (olemassa) return new Response(JSON.stringify({ error: "Koodi varattu" }), { status: 400, headers: corsHeaders });

      // TALLENNUS - Sarakkeet short_code ja original_url
      await env.LYHENNIN_DB.prepare("INSERT INTO links (short_code, original_url) VALUES (?, ?)")
        .bind(koodi, kohdeUrl).run();

      return new Response(JSON.stringify({ success: true, shortUrl: `https://srla.fi/${koodi}` }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
    }
  }

  return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: corsHeaders });
}
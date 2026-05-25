export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (url.pathname.includes("/create")) {
    const kohdeUrl = url.searchParams.get("url");
    let koodi = url.searchParams.get("code");
    let salasana = url.searchParams.get("secret");

    if (!kohdeUrl) {
      return new Response(JSON.stringify({ error: "URL puuttuu" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const shortDomain = env.SHORT_IO_DOMAIN;
    const publicKey = env.SHORT_IO_PUBLIC_KEY;

    if (!shortDomain || !publicKey) {
      return new Response(JSON.stringify({ error: "Palvelimen asetukset puuttuvat (Short.io avaimet)" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Peruspaketti Short.iolle
    const payload = {
      domain: shortDomain,
      originalURL: kohdeUrl
    };

    // Jos koodia ei anneta, Short.io tekee automaattisesti random tunnuksen!
    if (koodi && koodi.trim() !== "") payload.path = koodi.trim();
    
    // Suojataan linkki salasanalla, jos sellainen on annettu lomakkeessa
    if (salasana && salasana.trim() !== "") payload.password = salasana.trim();

    try {
      const res = await fetch("https://api.short.io/links/public", {
        method: "POST",
        headers: {
          "Authorization": publicKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
         return new Response(JSON.stringify({ error: data.error || "Linkin luonti epäonnistui Short.io:ssa" }), { status: res.status || 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ success: true, shortUrl: data.shortURL }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
export async function onRequest(context) {
  const url = new URL(context.request.url);

  // 1. Jos ollaan srla.fi -domainissa
  if (url.hostname === "srla.fi" || url.hostname === "www.srla.fi") {
    
    // Jos joku menee juureen (srla.fi/), lähetä hänet pääsivulle
    if (url.pathname === "/") {
      return Response.redirect("https://sorola.fi/", 301);
    }

    // Jos joku menee suoraan koodiin (esim. srla.fi/abc)
    const koodi = url.pathname.substring(1);
    
    // Ohitetaan API-kutsut, jotta ne menevät /api/-kansioon
    if (koodi.startsWith("api/")) return context.next();

    try {
      const dbResult = await context.env.LYHENNIN_DB.prepare(
        "SELECT original_url FROM links WHERE short_code = ?" 
      ).bind(koodi).first();

      if (dbResult && dbResult.original_url) {
        return Response.redirect(dbResult.original_url, 301);
      }
    } catch (e) {
      console.error("Middleware DB error:", e);
    }
  }

  // Jos ollaan sorola.fi -domainissa, ei tehdä mitään, vaan annetaan sivun latautua normaalisti
  return context.next();
}
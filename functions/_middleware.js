export async function onRequest(context) {
  const url = new URL(context.request.url);

  // 1. Käsittele VAIN srla.fi -domainiin tuleva liikenne
  if (url.hostname === "srla.fi" || url.hostname === "www.srla.fi") {
    
    // 2. Jos käyttäjä menee pelkkään juureen (srla.fi/)
    if (url.pathname === "/") {
      return Response.redirect("https://sorola.fi/lyhennin", 301); // 301 = Pysyvä ohjaus
    }

    // 3. Otetaan lyhytkoodi talteen (esim. srla.fi/abc -> "abc")
    const koodi = url.pathname.substring(1);

    try {
      // 4. Etsitään koodia LYHENNIN_DB -tietokannasta
      // HUOM! Tarkista että "linkit" ja "kohde_url" vastaavat sinun taulusi ja sarakkeesi nimiä!
      const dbResult = await context.env.LYHENNIN_DB.prepare(
        "SELECT kohde_url FROM linkit WHERE koodi = ?" 
      ).bind(koodi).first();

      if (dbResult && dbResult.kohde_url) {
        // Koodi löytyi -> Ohjataan oikeaan osoitteeseen
        return Response.redirect(dbResult.kohde_url, 301);
      } else {
        // Koodia ei löytynyt -> Ohjataan virhesivulle
        return Response.redirect("https://sorola.fi/lyhennin/error.html", 302);
      }
    } catch (e) {
      // Jos tietokantahaussa tapahtuu virhe, mennään myös virhesivulle
      return Response.redirect("https://sorola.fi/lyhennin/error.html", 302);
    }
  }

  // 5. Kaikki muu liikenne (esim. sorola.fi ja sen API-kutsut) jatkaa matkaansa normaalisti!
  return context.next();
}


export async function onRequestGet(context) {
    const url = new URL(context.request.url);
    // Haetaan tiedoston nimi ?file= muuttujasta
    const fileId = url.searchParams.get('file');
    
    if (!fileId) {
        return redirectToShareError(context.request);
    }

    if (!context.env.SHARE_BUCKET) {
        return new Response('R2-bucket sidos puuttuu.', { status: 500 });
    }
    
    const object = await context.env.SHARE_BUCKET.get(fileId);

    if (object === null) {
        return redirectToShareError(context.request);
    }

    const metadata = object.customMetadata || {};
    
    // 1. TARKISTETAAN AIKARAJA (Aikarajapoisto)
    const expiresAt = parseInt(metadata.expiresAt || '0');
    if (expiresAt && Date.now() > expiresAt) {
        await context.env.SHARE_BUCKET.delete(fileId); // Poistetaan R2:sta tilaa viemästä
        return redirectToShareError(context.request);
    }

    // 2. TARKISTETAAN LATAUSRAJOITUS
    const maxDownloads = parseInt(metadata.maxDownloads || '0');
    if (maxDownloads > 0) {
        const currentDownloads = parseInt(metadata.downloads || '0') + 1;

        if (currentDownloads >= maxDownloads) {
            // Tämä on viimeinen sallittu latauskerta -> tuhotaan tiedosto R2:sta samantien taustalla!
            await context.env.SHARE_BUCKET.delete(fileId);
        } else {
            // Päivitetään latausmäärä kopioimalla tiedoston metadata R2:ssa
            await context.env.SHARE_BUCKET.copy(fileId, fileId, {
                customMetadata: {
                    ...metadata,
                    downloads: currentDownloads.toString()
                }
            });
        }
    }

    // Valmistellaan tiedosto lataukseen
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    
    const originalName = metadata.originalName || fileId;
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(originalName)}"`);

    return new Response(object.body, { headers });
}

function redirectToShareError(request) {
    const acceptLanguage = request.headers.get('accept-language') || '';
    const errorPath = acceptLanguage.toLowerCase().includes('en') ? '/en/share/error' : '/jako/error';
    return Response.redirect(errorPath, 302);
}

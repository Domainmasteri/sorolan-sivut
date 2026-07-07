export async function onRequestPost(context) {
    try {
        const request = context.request;
        const url = new URL(request.url);
        
        // Luetaan multipart form data
        const formData = await request.formData();
        const file = formData.get('file');

        if (!file) {
            return new Response('Ei tiedostoa', { status: 400 });
        }

        // Luodaan tiedostolle uniikki ID (esim. a7b8c9d0.jpg)
        const id = crypto.randomUUID().split('-')[0]; // Lyhyt ID
        const extension = file.name.split('.').pop();
        const fileName = `${id}.${extension}`;

        // Tallennetaan R2-buckettiin. 
        // HUOM: Varmista että olet luonut Cloudflaressa R2-muuttujan nimellä "SHARE_BUCKET"
        await context.env.SHARE_BUCKET.put(fileName, file.stream(), {
            httpMetadata: { 
                contentType: file.type 
            },
            customMetadata: { 
                originalName: file.name 
            }
        });

        // Generoidaan julkinen latauslinkki (ohjautuu download-funktioon)
        const downloadUrl = `${url.origin}/api/download/${fileName}`;

        // Palautetaan linkki frontendille
        return new Response(JSON.stringify({ 
            url: downloadUrl, 
            id: fileName 
        }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(`Palvelinvirhe: ${error.message}`, { status: 500 });
    }
}

```

function generatePDF() {
    // Kohdistetaan takaisin yksittäiseen sivulokeroon
    const element = document.getElementById('cv');
    
    // Piilotetaan painike tulostuksen ajaksi
    const btn = document.querySelector('.btn-download');
    btn.style.display = 'none';

    // PDF-asetukset
    const opt = {
        margin:       0,
        filename:     'Markus_Sorola_CV.pdf',
        image:        { type: 'jpeg', quality: 1.0 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // Luodaan PDF
    html2pdf().set(opt).from(element).save().then(() => {
        // Palautetaan nappi
        btn.style.display = 'block';
    });
}

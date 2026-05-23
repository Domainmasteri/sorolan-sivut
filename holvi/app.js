// Automaattinen lukitusaika (5 minuuttia)
const LUKITUS_AIKA = 5 * 60 * 1000; 
let lukitusAjastin;

function nollaaAjastin() {
    clearTimeout(lukitusAjastin);
    lukitusAjastin = setTimeout(() => {
        // Jos avain on yhä muistissa, tyhjennetään se
        if (window.nykyinenAvain) {
            window.nykyinenAvain = null;
            document.getElementById('kirjautumis-nakyma')?.classList.remove('piilotettu');
            document.getElementById('holvi-nakyma')?.classList.add('piilotettu');
            document.getElementById('paasalasana').value = '';
            alert("Holvi lukittiin automaattisesti turvallisuuden vuoksi.");
        }
    }, LUKITUS_AIKA);
}

// Kuunnellaan toimintaa
document.addEventListener('mousemove', nollaaAjastin);
document.addEventListener('keydown', nollaaAjastin);
document.addEventListener('click', nollaaAjastin);
nollaaAjastin();

document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('click', (e) => {
        if (e.target && e.target.classList.contains('tayta-btn')) {
            const salasana = e.target.getAttribute('data-salasana');
            const alkuperainenTeksti = e.target.innerText;
            navigator.clipboard.writeText(salasana).then(() => {
                e.target.innerText = "Kopioitu!";
                setTimeout(() => { e.target.innerText = alkuperainenTeksti; }, 2000);
            });
        }
    });
});

// HUOM! Vaihda tähän uuden Workerisi osoite (esim. https://api.bannivasara.workers.dev)
const API_BASE = 'https://pienoismallit.bannivasara.workers.dev';

document.addEventListener('DOMContentLoaded', () => {
    fetchPosts();
    fetchSettings();
});

async function fetchPosts(query = "") {
    const gallery = document.getElementById('gallery');
    try {
        const response = await fetch(`${API_BASE}/api/posts?q=${encodeURIComponent(query)}`, {
            method: 'GET',
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('Yhteysvirhe');
        
        const posts = await response.json();
        gallery.innerHTML = '';

        if (posts.length === 0) {
            gallery.innerHTML = '<p>Ei julkaisuja tai hakusi ei tuottanut tulosta.</p>';
            return;
        }

        posts.forEach(post => {
            const card = document.createElement('div');
            card.className = 'card';
            
            card.innerHTML = `
                ${post.image_url ? `<img src="${post.image_url}" alt="${post.title}">` : ''}
                <div class="card-content">
                    <h2>${post.title} ${post.is_private ? '🔒 (Vain jäsenille)' : ''}</h2>
                    <p class="post-text">${post.content}</p>
                    <small class="post-date">Julkaistu: ${new Date(post.created_at).toLocaleDateString('fi-FI')}</small>
                </div>
            `;
            gallery.appendChild(card);
        });
    } catch (err) {
        console.error(err);
        gallery.innerHTML = '<p style="color: red;">Virhe ladattaessa julkaisuja. Tarkista yhteys.</p>';
    }
}

function searchPosts() {
    const query = document.getElementById('searchInput').value;
    fetchPosts(query);
}

async function fetchSettings() {
    try {
        const response = await fetch(`${API_BASE}/api/settings`, {
            method: 'GET',
            credentials: 'include'
        });
        const data = await response.json();
        document.getElementById('contactText').innerText = data.contact_info || 'Ei yhteystietoja määritetty.';
    } catch (err) {
        console.error("Yhteystietoja ei voitu ladata");
    }
}

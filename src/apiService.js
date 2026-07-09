/**
 * Vodaeduc PNSA – apiService.js
 * Gestionnaire centralisé des requêtes HTTP (CRUD)
 */

const API_URL = 'http://localhost:8000/vodaeduc_pnsa_api.php';

/**
 * Récupère toutes les structures (GET)
 */
export async function fetchStructures(lat = null, lng = null) {
    let url = API_URL;

    // Si la géo-localisation est fournie, on construit la Query String
    if (lat !== null && lng !== null) {
        url += `?user_lat=${lat}&user_lng=${lng}`;
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Erreur lors de la récupération (HTTP ${response.status})`);
    return await response.json();
}

/**
 * Ajoute une nouvelle structure (POST)
 */
export async function createStructure(formData) {
    const response = await fetch(API_URL, {
        method: 'POST',
        body: formData // Contient les champs textuels, les booléens et le fichier image
    });
    if (!response.ok) throw new Error(`Erreur lors de la création (HTTP ${response.status})`);
    return await response.json();
}

/**
 * Modifie une structure existante (PUT simulé par POST + _method)
 */
export async function updateStructure(id, formData) {
    const response = await fetch(`${API_URL}?id=${id}&_method=PUT`, {
        method: 'POST',
        body: formData
    });
    if (!response.ok) throw new Error(`Erreur lors de la modification (HTTP ${response.status})`);
    return await response.json();
}

/**
 * Supprime une structure (DELETE)
 */
export async function deleteStructure(id) {
    const response = await fetch(`${API_URL}?id=${id}`, {
        method: 'DELETE'
    });
    if (!response.ok) throw new Error(`Erreur lors de la suppression (HTTP ${response.status})`);
    return true;
}
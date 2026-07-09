
const API_URL = 'http://localhost:8000/vodaeduc_pnsa_api.php';

export async function fetchStructures(lat = null, lng = null) {
    let url = API_URL;

    if (lat !== null && lng !== null) {
        url += `?user_lat=${lat}&user_lng=${lng}`;
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Erreur lors de la récupération (HTTP ${response.status})`);
    return await response.json();
}

export async function createStructure(formData) {
    const response = await fetch(API_URL, {
        method: 'POST',
        body: formData
    });
    if (!response.ok) throw new Error(`Erreur lors de la création (HTTP ${response.status})`);
    return await response.json();
}

export async function updateStructure(id, formData) {
    const response = await fetch(`${API_URL}?id=${id}&_method=PUT`, {
        method: 'POST',
        body: formData
    });
    if (!response.ok) throw new Error(`Erreur lors de la modification (HTTP ${response.status})`);
    return await response.json();
}

export async function deleteStructure(id) {
    const response = await fetch(`${API_URL}?id=${id}`, {
        method: 'DELETE'
    });
    if (!response.ok) throw new Error(`Erreur lors de la suppression (HTTP ${response.status})`);
    return true;
}
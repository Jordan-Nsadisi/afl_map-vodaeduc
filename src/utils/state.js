
export const states = {

    allStructures: [],
    filteredStructures: [],
    map: null,
    markersLayer: null,
    userMarker: null,
    userCoords: null,
    pendingDeleteId: null,
    editingId: null,
    isAdminAuthenticated: false,
    isSelectingGps: false,

    STRUCTURE_TYPES: [
        { label: 'Pharmacie', key: 'Pharmacie', icon: '💊', markerClass: 'marker-icon--pharmacie' },
        { label: 'Établissement de soin', key: 'Établissement de soin', icon: '🏥', markerClass: 'marker-icon--soins' },
        { label: "Centre d'Écoute et Conseil", key: "Centre d'Écoute et de Conseil", icon: '🫂', markerClass: 'marker-icon--ecoute' },
        { label: 'Centre de jeunes', key: 'Centre de jeunes', icon: '👥', markerClass: 'marker-icon--jeunes' },
    ],

    CONTRACEPTIVE_SLUGS: [
        { slug: 'presartif_masc', name: 'Préservatifs masculins' },
        { slug: 'presartif_fem', name: 'Préservatifs féminins' },
        { slug: 'coc', name: 'Pilules Orales Combinées' },
        { slug: 'injectable', name: 'Contraceptif injectable' },
        { slug: 'implant', name: 'Implant' },
        { slug: 'diu', name: 'DIU (Stérilet)' },
        { slug: 'patch', name: 'Patch contraceptif' },
        { slug: 'coc_urgence', name: 'Pilule du lendemain' },
    ],

    HEALTHCARE_DETAIL_LABELS: {
        cs: 'Centre de Santé',
        hgr: 'Hôpital Général de Référence'
    }
}
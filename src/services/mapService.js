

export function initMap() {
    map = L.map('map', { zoomControl: true }).setView([-4.322, 15.322], 12)

    const osm = L.tileLayer(
        import.meta.env.VITE_MAP_TILE_URL,
        {
            attribution: import.meta.env.VITE_MAP_ATTRIBUTION,
            maxZoom: Number(import.meta.env.VITE_MAP_MAX_ZOOM),
        }
    );

    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri',
        maxZoom: 19,
    })

    osm.addTo(map)

    baseMaps = {
        "Plan (OSM)": osm,
        "Satellite": satellite
    }

    L.control.layers(baseMaps).addTo(map)

    // Utilisation de MarkerClusterGroup
    markersLayer = L.markerClusterGroup({
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        maxClusterRadius: 50
    }).addTo(map)

    // Contrôle custom Géolocalisation
    const locateControl = L.control({ position: 'topleft' })
    locateControl.onAdd = function () {
        const btn = L.DomUtil.create('button', 'leaflet-bar leaflet-control leaflet-control-custom map-locate-btn')
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>'
        btn.title = 'Me localiser'
        btn.onclick = function (e) {
            e.stopPropagation()
            locateUser()
        }
        return btn
    }
    locateControl.addTo(map)
}

function locateUser() {
    if (!navigator.geolocation) {
        showToast("La géolocalisation n'est pas supportée par votre navigateur.", "error")
        return
    }

    showToast("Recherche de votre position...", "success")

    navigator.geolocation.getCurrentPosition(position => {
        // On met à jour l'état global en cas de clic manuel sur la cible
        userCoords = { lat: position.coords.latitude, lng: position.coords.longitude }
        drawUserMarker(userCoords.lat, userCoords.lng)
    }, () => {
        showToast("Impossible de récupérer votre position.", "error")
    })
}

function renderMarkers() {
    markersLayer.clearLayers()

    filteredStructures.forEach(s => {
        if (!s.latitude || !s.longitude) return

        const typeConf = states?.STRUCTURE_TYPES?.find(t => t.key === s.structure_type) || { icon: '📍', markerClass: 'marker-icon--default' }

        const icon = L.divIcon({
            className: '',
            html: `<div class="marker-icon ${typeConf.markerClass}">${typeConf.icon}</div>`,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
            popupAnchor: [0, -18],
        })

        const marker = L.marker([s.latitude, s.longitude], { icon })

        marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e)
            openPlaceDrawer(s)
        })

        marker.addTo(markersLayer)
    })
}

function drawUserMarker(lat, lng) {
    if (userMarker) {
        userMarker.setLatLng([lat, lng])
    } else {
        userMarker = L.circleMarker([lat, lng], {
            radius: 8,
            fillColor: "#E60000",
            color: "#fff",
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(map).bindPopup("Votre position")
    }
    map.flyTo([lat, lng], 14)
}

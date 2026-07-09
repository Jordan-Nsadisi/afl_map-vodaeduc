
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import '../style.css'
import L from 'leaflet'
import 'leaflet.markercluster'
import { fetchStructures, createStructure, updateStructure, deleteStructure } from '../services/apiService.js'

const API_URL = 'http://localhost:8000/vodaeduc_pnsa_api.php'

// Monitoring basique des erreurs globales
window.onerror = function (message, source, lineno, colno, error) {
  console.error('[PNSA Error Monitoring]', { message, source, lineno, colno, error });
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    if (typeof showToast === 'function') {
      showToast('Une erreur inattendue est survenue.', 'error');
    }
  }
};
window.addEventListener('unhandledrejection', function (event) {
  console.error('[PNSA Unhandled Rejection]', event.reason);
});

const STRUCTURE_TYPES = [
  { label: 'Pharmacie', key: 'Pharmacie', icon: '💊', markerClass: 'marker-icon--pharmacie' },
  { label: 'Établissement de soin', key: 'Établissement de soin', icon: '🏥', markerClass: 'marker-icon--soins' },
  { label: "Centre d'Écoute et Conseil", key: "Centre d'Écoute et de Conseil", icon: '🫂', markerClass: 'marker-icon--ecoute' },
  { label: 'Centre de jeunes', key: 'Centre de jeunes', icon: '👥', markerClass: 'marker-icon--jeunes' },
]

const CONTRACEPTIVE_SLUGS = [
  { slug: 'presartif_masc', name: 'Préservatifs masculins' },
  { slug: 'presartif_fem', name: 'Préservatifs féminins' },
  { slug: 'coc', name: 'Pilules Orales Combinées' },
  { slug: 'injectable', name: 'Contraceptif injectable' },
  { slug: 'implant', name: 'Implant' },
  { slug: 'diu', name: 'DIU (Stérilet)' },
  { slug: 'patch', name: 'Patch contraceptif' },
  { slug: 'coc_urgence', name: 'Pilule du lendemain' },
]

const HEALTHCARE_DETAIL_LABELS = { cs: 'Centre de Santé', hgr: 'Hôpital Général de Référence' }

// ── STATE ────────────────────────────────────────────────────────
let allStructures = []
let filteredStructures = []
let markersLayer = null
let map = null
let pendingDeleteId = null
let editingId = null
let isAdminAuthenticated = false
let isSelectingGps = false
let userCoords = null

// ── INIT ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initMap()
  buildFilterCheckboxes()
  bindUIEvents()

  const proximityCheckbox = document.getElementById('filter-proximity')

  if (proximityCheckbox && proximityCheckbox.checked) {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          userCoords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }
          drawUserMarker(userCoords.lat, userCoords.lng)
          await loadStructures(userCoords.lat, userCoords.lng)
        },
        async () => {
          showToast("Position introuvable ou refusée. Chargement général.", "warn")
          proximityCheckbox.checked = false
          await loadStructures()
        }
      )
    } else {
      proximityCheckbox.checked = false
      await loadStructures()
    }
  } else {
    await loadStructures()
  }
})

// ── MAP INIT ─────────────────────────────────────────────────────
let baseMaps = {}
let userMarker = null

function initMap() {
  map = L.map('map', { zoomControl: true }).setView([-4.322, 15.322], 12)

  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
    maxZoom: 19,
  })

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

// Helper pour dessiner le point bleu de l'étudiant
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

// ── LOAD DATA ────────────────────────────────────────────────────
async function loadStructures(lat = null, lng = null) {
  showLoader(true)
  try {
    allStructures = await fetchStructures(lat, lng)
    populateSelectFilters()
    restoreFilters()
    applyFilters()
  } catch (err) {
    console.error('Erreur API:', err)
    showToast('Impossible de charger les données dynamiques.', 'error')
    allStructures = getDemoData()
    populateSelectFilters()
    restoreFilters()
    applyFilters()
  } finally {
    showLoader(false)
  }
}

// ── BUILD FILTER UI ───────────────────────────────────────────────
function buildFilterCheckboxes() {
  const typeList = document.getElementById('filter-type-list')
  typeList.innerHTML = STRUCTURE_TYPES.map(t => {
    let extra = '';
    if (t.key === 'Établissement de soin') {
      extra = `
        <div id="subfilter-healthcare" class="subfilter-container" style="display: none; padding-left: 28px; margin-top: 6px;">
          <label class="checkbox-label" style="font-size: 11px;">
            <input type="checkbox" class="hc-detail-filter" value="cs" />
            <span class="checkmark" style="width:14px; height:14px;"></span>
            Centre de Santé (CS)
          </label>
          <label class="checkbox-label" style="font-size: 11px; margin-top: 4px;">
            <input type="checkbox" class="hc-detail-filter" value="hgr" />
            <span class="checkmark" style="width:14px; height:14px;"></span>
            Hôpital Général (HGR)
          </label>
        </div>`;
    }
    return `
      <li class="checkbox-item">
        <label class="checkbox-label">
          <input type="checkbox" class="type-filter" value="${escHtml(t.key)}" />
          <span class="checkmark"></span>
          ${t.icon} ${escHtml(t.label)}
        </label>
        ${extra}
      </li>`;
  }).join('')

  // Méthodes contraceptives
  const stockList = document.getElementById('filter-stock-list')
  stockList.innerHTML = CONTRACEPTIVE_SLUGS.map(s => `
    <li class="checkbox-item">
      <label class="checkbox-label">
        <input type="checkbox" class="stock-filter" value="${escHtml(s.slug)}" />
        <span class="checkmark"></span>
        ${escHtml(s.name)}
      </label>
    </li>`).join('')

  // Stocks admin form
  const stocksContainer = document.getElementById('stocks-container')
  if (stocksContainer) {
    stocksContainer.innerHTML = CONTRACEPTIVE_SLUGS.map(s => `
      <label class="stock-check-item">
        <input type="checkbox" class="form-stock-check" data-slug="${s.slug}" data-name="${escHtml(s.name)}" />
        <span class="stock-check-label">${escHtml(s.name)}</span>
        <select class="stock-type-select" data-slug="${s.slug}" disabled>
          <option value="communautaire">Communautaire</option>
          <option value="clinique">Clinique</option>
        </select>
      </label>`).join('')

    // Activer/désactiver le select selon la checkbox
    stocksContainer.querySelectorAll('.form-stock-check').forEach(cb => {
      cb.addEventListener('change', () => {
        const sel = stocksContainer.querySelector(`.stock-type-select[data-slug="${cb.dataset.slug}"]`)
        if (sel) sel.disabled = !cb.checked
      })
    })
  }
}

function populateSelectFilters() {
  const citySelect = document.getElementById('filter-city')
  const zoneSelect = document.getElementById('filter-zone')
  const selectedCity = citySelect.value.toLowerCase()

  if (citySelect.options.length <= 1) {
    const cities = [...new Set(allStructures.map(s => s.city).filter(Boolean).map(c => c.toLowerCase()))]
    cities.sort().forEach(c => {
      const opt = document.createElement('option')
      opt.value = c; opt.textContent = capitalize(c)
      citySelect.appendChild(opt)
    })
  }

  const currentZone = zoneSelect.value
  zoneSelect.innerHTML = '<option value="">Toutes les zones</option>'

  let validStructures = allStructures
  if (selectedCity) {
    validStructures = allStructures.filter(s => (s.city || '').toLowerCase() === selectedCity)
  }

  const zones = [...new Set(validStructures.map(s => s.health_zone).filter(z => z && z.trim() !== ''))]
  zones.sort().forEach(z => {
    const opt = document.createElement('option')
    opt.value = z; opt.textContent = capitalize(z.replace(/_/g, ' '))
    zoneSelect.appendChild(opt)
  })

  if (zones.includes(currentZone)) {
    zoneSelect.value = currentZone
  } else if (selectedCity) {
    zoneSelect.value = ""
  }
}

// ── FILTERS ───────────────────────────────────────────────────────
function applyFilters() {
  const city = document.getElementById('filter-city').value.toLowerCase()
  const zone = document.getElementById('filter-zone').value
  const checkedTypes = [...document.querySelectorAll('.type-filter:checked')].map(el => el.value)
  const checkedHc = [...document.querySelectorAll('.hc-detail-filter:checked')].map(el => el.value)
  const checkedStocks = [...document.querySelectorAll('.stock-filter:checked')].map(el => el.value)
  const checkedFeats = [...document.querySelectorAll('.feature-filter:checked')].map(el => el.value)

  filteredStructures = allStructures.filter(s => {
    if (city && (s.city || '').toLowerCase() !== city) return false
    if (zone && (s.health_zone || '').trim() !== zone) return false
    if (checkedTypes.length && !checkedTypes.includes(s.structure_type)) return false
    if (checkedTypes.includes('Établissement de soin') && s.structure_type === 'Établissement de soin' && checkedHc.length) {
      if (!checkedHc.includes(s.healthcare_detail)) return false
    }
    if (checkedStocks.length && !checkedStocks.every(slug => (s.stocks || []).some(st => st.slug === slug))) return false
    if (checkedFeats.length && !checkedFeats.every(f => !!s[f])) return false
    return true
  })

  renderMarkers()
  updateResultCount()
  toggleNoResults()
  updateActiveFiltersBadge()
  saveFilters()

  // Ajustement automatique de la vue (Fit Bounds)
  if (filteredStructures.length > 0) {
    const bounds = markersLayer.getBounds()
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 })
    }
  }
}

// ── MARKERS ───────────────────────────────────────────────────────
function renderMarkers() {
  markersLayer.clearLayers()

  filteredStructures.forEach(s => {
    if (!s.latitude || !s.longitude) return

    const typeConf = STRUCTURE_TYPES.find(t => t.key === s.structure_type) || { icon: '📍', markerClass: 'marker-icon--default' }

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

function buildPopupHtml(s) {
  const typeConf = STRUCTURE_TYPES.find(t => t.key === s.structure_type)
  const typeIcon = typeConf ? typeConf.icon : '📍'
  const detailLabel = s.healthcare_detail ? ` – ${HEALTHCARE_DETAIL_LABELS[s.healthcare_detail] || s.healthcare_detail}` : ''
  const zoneLabel = s.health_zone ? capitalize(s.health_zone.replace(/_/g, ' ')) : ''
  const cityLabel = s.city ? capitalize(s.city) : ''

  const stocksHtml = s.stocks && s.stocks.length
    ? `<div class="popup-stocks">
        <p class="popup-stocks-title">Contraceptifs disponibles</p>
        ${s.stocks.map(st => `<div class="popup-stock-item ${st.type === 'clinique' ? 'popup-stock-item--clinical' : ''}">${escHtml(st.name)}</div>`).join('')}
       </div>`
    : (s.offre_contraception ?
      `<div class="popup-stocks"><span class="popup-tag popup-tag--warning">Stock non renseigné</span></div>`
      : '')

  const orientationHtml = s.orientation_rupture_stocks && s.orientation_rupture_stocks.toLowerCase() !== 'aucune' && s.orientation_rupture_stocks.toLowerCase() !== 'non'
    ? `<div class="popup-orientation">
         <strong>En cas de rupture :</strong> ${escHtml(s.orientation_rupture_stocks)}
         ${s.adresse_struct_orientation ? `<br><small>${escHtml(s.adresse_struct_orientation)}</small>` : ''}
       </div>`
    : ''

  const indicators = [
    s.integration_ssaaj && 'SSAAJ',
    s.espace_jeune_fonctionnel && 'Espace Jeune',
    s.offre_contraception && 'Contraception',
  ].filter(Boolean)

  const coverHtml = s.cover_url
    ? `<div class="popup-cover" style="background-image: url('${escHtml(s.cover_url)}')"></div>`
    : `<div class="popup-cover popup-cover--fallback" data-type="${typeConf ? typeConf.markerClass : 'marker-icon--default'}"></div>`

  const routeUrl = `https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longitude}`
  const geoUrl = `geo:${s.latitude},${s.longitude}?q=${s.latitude},${s.longitude}(${encodeURIComponent(s.name)})`;

  return `
    <div class="popup-card">
      ${coverHtml}
      <div class="popup-header">
        <span class="popup-type-badge">${typeIcon} ${escHtml(s.structure_type)}${detailLabel}</span>
        <p class="popup-name">${escHtml(s.name)}</p>
        ${zoneLabel ? `<p class="popup-zone">Zone : ${zoneLabel}</p>` : ''}
      </div>
      <div class="popup-body">
        ${cityLabel ? `<div class="popup-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg><span>${cityLabel}${s.adresse_structure ? ' – ' + escHtml(s.adresse_structure) : ''}</span></div>` : ''}
        ${s.contact_tel_structure ? `<div class="popup-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.61 19a19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg><span><a href="tel:${escHtml(s.contact_tel_structure)}">${escHtml(s.contact_tel_structure)}</a></span></div>` : ''}
        ${indicators.length ? `<div class="popup-indicators">${indicators.map(i => `<span class="popup-indicator">${i}</span>`).join('')}</div>` : ''}
      </div>
      ${stocksHtml}
      ${orientationHtml}
      <div class="popup-actions">
        ${s.contact_tel_structure ? `<a href="tel:${escHtml(s.contact_tel_structure)}" class="btn-secondary btn-sm"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.61 19a19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg> Appeler</a>` : ''}
      </div>
    </div>`
}

// ── UI HELPERS ────────────────────────────────────────────────────
function updateResultCount() {
  document.getElementById('count-number').textContent = filteredStructures.length
}

function toggleNoResults() {
  const overlay = document.getElementById('no-results-overlay')
  overlay.hidden = filteredStructures.length > 0
}

function showLoader(visible) {
  const loader = document.getElementById('map-loader')
  loader.classList.toggle('hidden', !visible)
}

function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container')
  const toast = document.createElement('div')
  toast.className = `toast toast--${type}`
  toast.textContent = msg
  container.appendChild(toast)
  setTimeout(() => toast.remove(), 3500)
}

function updateActiveFiltersBadge() {
  const city = document.getElementById('filter-city').value
  const zone = document.getElementById('filter-zone').value
  const checkedInputs = document.querySelectorAll('.type-filter:checked, .stock-filter:checked, .feature-filter:checked, .hc-detail-filter:checked')

  let count = checkedInputs.length
  if (city) count++
  if (zone) count++

  const badge = document.getElementById('active-filters-badge')
  if (badge) {
    badge.textContent = count
    badge.hidden = count === 0
  }
}

function saveFilters() {
  const filters = {
    city: document.getElementById('filter-city').value,
    zone: document.getElementById('filter-zone').value,
    types: [...document.querySelectorAll('.type-filter:checked')].map(el => el.value),
    hc: [...document.querySelectorAll('.hc-detail-filter:checked')].map(el => el.value),
    stocks: [...document.querySelectorAll('.stock-filter:checked')].map(el => el.value),
    features: [...document.querySelectorAll('.feature-filter:checked')].map(el => el.value),
  }
  sessionStorage.setItem('pnsa_filters', JSON.stringify(filters))
}

function restoreFilters() {
  const stored = sessionStorage.getItem('pnsa_filters')
  if (!stored) return

  try {
    const filters = JSON.parse(stored)

    document.getElementById('filter-city').value = filters.city || ''
    populateSelectFilters()
    document.getElementById('filter-zone').value = filters.zone || ''

    filters.types.forEach(val => {
      const cb = document.querySelector(`.type-filter[value="${val}"]`)
      if (cb) cb.checked = true
    })

    const hcCheckbox = document.querySelector('.type-filter[value="Établissement de soin"]')
    if (hcCheckbox && hcCheckbox.checked) {
      const sub = document.getElementById('subfilter-healthcare')
      if (sub) sub.style.display = 'block'
    }

    filters.hc.forEach(val => {
      const cb = document.querySelector(`.hc-detail-filter[value="${val}"]`)
      if (cb) cb.checked = true
    })

    filters.stocks.forEach(val => {
      const cb = document.querySelector(`.stock-filter[value="${val}"]`)
      if (cb) cb.checked = true
    })

    filters.features.forEach(val => {
      const cb = document.querySelector(`.feature-filter[value="${val}"]`)
      if (cb) cb.checked = true
    })
  } catch (e) {
    console.error('Erreur restauration filtres', e)
  }
}

function resetFilters() {
  document.getElementById('filter-city').value = ''
  populateSelectFilters()
  document.getElementById('filter-zone').value = ''

  const proximity = document.getElementById('filter-proximity')
  if (proximity) proximity.checked = false

  document.querySelectorAll('.type-filter, .stock-filter, .feature-filter, .hc-detail-filter').forEach(el => { el.checked = false })

  const sub = document.getElementById('subfilter-healthcare')
  if (sub) sub.style.display = 'none'

  loadStructures()
  applyFilters()
}

function escHtml(str) {
  if (!str) return ''
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function capitalize(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}

// ── BIND UI EVENTS ────────────────────────────────────────────────
function bindUIEvents() {
  // Filtres
  document.getElementById('filter-city').addEventListener('change', () => {
    populateSelectFilters()
    applyFilters()
  })
  document.getElementById('filter-zone').addEventListener('change', applyFilters)

  // Filtres d'origine
  document.getElementById('filter-city').addEventListener('change', () => {
    populateSelectFilters()
    applyFilters()
  })
  document.getElementById('filter-zone').addEventListener('change', applyFilters)

  // interrupteur "Autour de moi (1 km)"
  document.getElementById('filter-proximity')?.addEventListener('change', async (e) => {
    if (e.target.checked) {
      if (userCoords) {
        drawUserMarker(userCoords.lat, userCoords.lng)
        await loadStructures(userCoords.lat, userCoords.lng)
      } else {
        // Si les coordonnées n'existent pas encore, on appelle le GPS
        if (navigator.geolocation) {
          showToast("Recherche de votre position...", "success")
          navigator.geolocation.getCurrentPosition(
            async (position) => {
              userCoords = { lat: position.coords.latitude, lng: position.coords.longitude }
              drawUserMarker(userCoords.lat, userCoords.lng)
              await loadStructures(userCoords.lat, userCoords.lng)
            },
            async () => {
              showToast("Impossible d'accéder à votre position. Filtre annulé.", "error")
              e.target.checked = false // Décoche la case en cas d'échec
              await loadStructures()
            }
          )
        } else {
          e.target.checked = false
          await loadStructures()
        }
      }
    } else {
      await loadStructures()
    }
  })

  document.addEventListener('change', e => {
    if (e.target.matches('.type-filter[value="Établissement de soin"]')) {
      const sub = document.getElementById('subfilter-healthcare')
      if (sub) {
        sub.style.display = e.target.checked ? 'block' : 'none'
        if (!e.target.checked) sub.querySelectorAll('input').forEach(i => i.checked = false)
      }
    }
    if (e.target.matches('.type-filter, .stock-filter, .feature-filter, .hc-detail-filter')) applyFilters()
  })

  // Reset
  document.getElementById('btn-reset-filters').addEventListener('click', resetFilters)
  document.getElementById('btn-reset-filters-overlay')?.addEventListener('click', resetFilters)

  // Mobile sidebar
  const sidebar = document.getElementById('sidebar')
  document.getElementById('btn-open-sidebar')?.addEventListener('click', () => {
    sidebar.classList.add('is-open')
    document.getElementById('sidebar-overlay').classList.add('visible')
  })
  document.getElementById('btn-close-sidebar')?.addEventListener('click', closeSidebar)
  document.getElementById('sidebar-overlay')?.addEventListener('click', closeSidebar)

  document.getElementById('btn-close-drawer')?.addEventListener('click', closePlaceDrawer)

  map.on('click', closePlaceDrawer)
  document.getElementById('btn-reset-filters').addEventListener('click', () => {
    resetFilters()
    closePlaceDrawer()
  })

  function closeSidebar() {
    sidebar.classList.remove('is-open')
    document.getElementById('sidebar-overlay').classList.remove('visible')
  }

  document.getElementById('btn-open-admin')?.addEventListener('click', openAdminModal)
  document.getElementById('btn-open-admin-pc')?.addEventListener('click', openAdminModal)
  document.getElementById('btn-close-admin')?.addEventListener('click', closeAdminModal)

  document.getElementById('pin-form')?.addEventListener('submit', e => {
    e.preventDefault()
    const pin = document.getElementById('admin-pin').value
    const correctPin = import.meta.env.VITE_ADMIN_PIN || '1234'
    if (pin === correctPin) {
      isAdminAuthenticated = true
      document.getElementById('pin-modal').hidden = true
      document.getElementById('admin-pin').value = ''
      document.getElementById('pin-error').hidden = true
      openAdminModal()
    } else {
      document.getElementById('pin-error').hidden = false
    }
  })

  document.getElementById('btn-close-pin')?.addEventListener('click', () => {
    document.getElementById('pin-modal').hidden = true
    document.getElementById('admin-pin').value = ''
    document.getElementById('pin-error').hidden = true
  })

  // Export CSV
  document.getElementById('btn-export-csv')?.addEventListener('click', exportCSV)

  // Sélection GPS
  document.getElementById('btn-gps-select')?.addEventListener('click', startGpsSelection)

  // Admin tabs
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab, .tab-panel').forEach(el => el.classList.remove('active'))
      tab.classList.add('active')
      document.getElementById(`tab-panel-${tab.dataset.tab.replace('tab-', '')}`).classList.add('active')
    })
  })

  // Admin form
  document.getElementById('admin-form')?.addEventListener('submit', handleFormSubmit)
  document.getElementById('btn-cancel-form')?.addEventListener('click', resetForm)

  // Show/hide healthcare_detail
  document.getElementById('form-type')?.addEventListener('change', e => {
    const field = document.getElementById('field-healthcare-detail')
    field.hidden = e.target.value !== 'Établissement de soin'
  })

  let searchTimeout;
  document.getElementById('admin-search')?.addEventListener('input', e => {
    clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => {
      const q = e.target.value.toLowerCase()
      document.querySelectorAll('.admin-list-item').forEach(item => {
        item.hidden = !item.dataset.name.toLowerCase().includes(q)
      })
    }, 300)
  })

  // Confirm modal
  document.getElementById('btn-confirm-cancel')?.addEventListener('click', () => {
    document.getElementById('confirm-modal').hidden = true
    pendingDeleteId = null
  })
  document.getElementById('btn-confirm-delete')?.addEventListener('click', confirmDelete)
}

// ── ADMIN MODAL ───────────────────────────────────────────────────
function openAdminModal() {
  if (!isAdminAuthenticated) {
    const pinModal = document.getElementById('pin-modal')
    pinModal.hidden = false
    document.getElementById('admin-pin').focus()
  } else {
    const adminModal = document.getElementById('admin-modal')
    adminModal.hidden = false
    renderAdminList()
    adminModal.querySelector('button, input').focus()
  }
}
function closeAdminModal() {
  document.getElementById('admin-modal').hidden = true
  resetForm()
  document.getElementById('btn-open-admin')?.focus()
}

function renderAdminList() {
  const list = document.getElementById('admin-list')
  if (!allStructures.length) { list.innerHTML = '<p class="admin-empty">Aucune structure.</p>'; return }

  list.innerHTML = allStructures.map(s => {
    const typeConf = STRUCTURE_TYPES.find(t => t.key === s.structure_type)
    return `
      <div class="admin-list-item" data-id="${s.id}" data-name="${escHtml(s.name)}">
        <span class="admin-item-icon">${typeConf ? typeConf.icon : '📍'}</span>
        <div class="admin-item-info">
          <p class="admin-item-name">${escHtml(s.name)}</p>
          <p class="admin-item-meta">${escHtml(capitalize(s.city))} ${s.health_zone ? '– ' + capitalize(s.health_zone.replace(/_/g, ' ')) : ''}</p>
        </div>
        <div class="admin-item-actions">
          <button class="btn-icon-sm btn-icon-sm--edit" data-action="edit" data-id="${s.id}" title="Modifier" aria-label="Modifier la structure">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon-sm btn-icon-sm--del" data-action="delete" data-id="${s.id}" title="Supprimer" aria-label="Supprimer la structure">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </div>`
  }).join('')

  list.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.action === 'edit') openEditForm(parseInt(btn.dataset.id))
      if (btn.dataset.action === 'delete') openConfirmDelete(parseInt(btn.dataset.id))
    })
  })
}

// ── FORM CRUD ─────────────────────────────────────────────────────
function openEditForm(id) {
  const s = allStructures.find(x => x.id === id)
  if (!s) return
  editingId = id
  document.getElementById('admin-form-title').textContent = 'Modifier la structure'
  document.getElementById('btn-submit-label').textContent = 'Mettre à jour'

  // Remplissage des champs
  document.getElementById('form-id').value = s.id
  document.getElementById('form-name').value = s.name || ''
  document.getElementById('form-type').value = s.structure_type || ''
  document.getElementById('form-city').value = s.city || ''
  document.getElementById('form-zone').value = s.health_zone || ''
  document.getElementById('form-adresse').value = s.adresse_structure || ''
  document.getElementById('form-contact').value = s.contact_tel_structure || ''
  document.getElementById('form-lat').value = s.latitude || ''
  document.getElementById('form-lng').value = s.longitude || ''
  document.getElementById('form-gps-precision').value = s.gps_precision || ''
  document.getElementById('form-orientation').value = s.orientation_rupture_stocks || ''
  document.getElementById('form-adresse-orientation').value = s.adresse_struct_orientation || ''
  document.getElementById('form-ssaaj').checked = !!s.integration_ssaaj
  document.getElementById('form-espace-jeune').checked = !!s.espace_jeune_fonctionnel
  document.getElementById('form-offre-contraception').checked = !!s.offre_contraception
  document.getElementById('form-integration-pf').checked = !!s.integration_pf_pharmacie
  document.getElementById('form-precision-adresse').checked = !!s.precision_adresse_structure

  const hdField = document.getElementById('field-healthcare-detail')
  hdField.hidden = s.structure_type !== 'Établissement de soin'
  document.getElementById('form-healthcare-detail').value = s.healthcare_detail || ''

  // Stocks
  document.querySelectorAll('.form-stock-check').forEach(cb => {
    const match = (s.stocks || []).find(st => st.slug === cb.dataset.slug)
    cb.checked = !!match
    const sel = document.querySelector(`.stock-type-select[data-slug="${cb.dataset.slug}"]`)
    if (sel) { sel.disabled = !match; if (match) sel.value = match.type }
  })

  // Basculer vers l'onglet formulaire
  document.querySelectorAll('.admin-tab, .tab-panel').forEach(el => el.classList.remove('active'))
  document.querySelector('[data-tab="tab-add"]').classList.add('active')
  document.getElementById('tab-panel-add').classList.add('active')
}

function resetForm() {
  editingId = null
  document.getElementById('admin-form').reset()
  document.getElementById('admin-form-title').textContent = 'Nouvelle structure'
  document.getElementById('btn-submit-label').textContent = 'Enregistrer'
  document.getElementById('field-healthcare-detail').hidden = true
  document.querySelectorAll('.stock-type-select').forEach(sel => sel.disabled = true)
}

async function handleFormSubmit(e) {
  e.preventDefault()
  const form = e.target

  let isValid = true
  form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'))
  form.querySelectorAll('.field-error').forEach(el => el.textContent = '')

  const name = document.getElementById('form-name').value
  if (!name.trim()) { isValid = false; document.getElementById('form-name').classList.add('is-invalid') }

  const type = document.getElementById('form-type').value
  if (!type) { isValid = false; document.getElementById('form-type').classList.add('is-invalid') }

  const latStr = document.getElementById('form-lat').value
  const lngStr = document.getElementById('form-lng').value
  const lat = parseFloat(latStr)
  const lng = parseFloat(lngStr)

  if (isNaN(lat) || lat < -15 || lat > 6) {
    isValid = false;
    document.getElementById('form-lat').classList.add('is-invalid')
    document.getElementById('form-lat').nextElementSibling.textContent = "Lat invalide (RDC)"
  }
  if (isNaN(lng) || lng < 12 || lng > 32) {
    isValid = false;
    document.getElementById('form-lng').classList.add('is-invalid')
    document.getElementById('form-lng').nextElementSibling.textContent = "Lng invalide (RDC)"
  }

  if (!isValid) {
    showToast("Veuillez corriger les erreurs du formulaire.", "error")
    return
  }

  const fd = new FormData(form)

  // Construire stocks depuis checkboxes
  const stocks = CONTRACEPTIVE_SLUGS
    .filter(s => form.querySelector(`.form-stock-check[data-slug="${s.slug}"]`)?.checked)
    .map(s => ({
      slug: s.slug, name: s.name,
      type: form.querySelector(`.stock-type-select[data-slug="${s.slug}"]`)?.value || 'communautaire'
    }))

  fd.append('stocks', JSON.stringify(stocks))

    ;['integration_ssaaj', 'espace_jeune_fonctionnel', 'offre_contraception', 'integration_pf_pharmacie', 'precision_adresse_structure']
      .forEach(k => {
        if (form.querySelector(`[name="${k}"]`)?.checked) {
          fd.set(k, '1')
        } else {
          fd.append(k, '0')
        }
      })

  try {
    if (editingId) {
      await updateStructure(editingId, fd);
    } else {
      await createStructure(fd);
    }
    showToast(editingId ? 'Structure mise à jour ✓' : 'Structure ajoutée ✓', 'success')
    await loadStructures()
    if (editingId) renderAdminList()
    resetForm()
  } catch (err) {
    showToast('Erreur lors de l\'enregistrement.', 'error')
    console.error(err)
  }
}

// ── EXPORT CSV ────────────────────────────────────────────────────
function exportCSV() {
  if (!allStructures.length) {
    showToast("Aucune donnée à exporter.", "warn")
    return
  }

  const headers = ['id', 'name', 'structure_type', 'city', 'health_zone', 'latitude', 'longitude', 'contact_tel_structure', 'adresse_structure']
  let csvContent = headers.join(',') + '\n'

  allStructures.forEach(s => {
    const row = headers.map(h => {
      let val = s[h] || ''
      if (typeof val === 'string') val = `"${val.replace(/"/g, '""')}"`
      return val
    })
    csvContent += row.join(',') + '\n'
  })

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.setAttribute("href", url)
  link.setAttribute("download", "structures_pnsa.csv")
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// ── SELECTION GPS ─────────────────────────────────────────────────
function startGpsSelection() {
  isSelectingGps = true
  document.getElementById('admin-modal').hidden = true
  document.querySelector('.leaflet-container').classList.add('crosshair-cursor-enabled')
  showToast("Cliquez sur la carte pour définir l'emplacement", "warn")

  map.once('click', e => {
    isSelectingGps = false
    document.querySelector('.leaflet-container').classList.remove('crosshair-cursor-enabled')
    document.getElementById('form-lat').value = e.latlng.lat.toFixed(6)
    document.getElementById('form-lng').value = e.latlng.lng.toFixed(6)
    document.getElementById('admin-modal').hidden = false

    // Supprimer les classes d'erreur s'il y en a
    document.getElementById('form-lat').classList.remove('is-invalid')
    document.getElementById('form-lng').classList.remove('is-invalid')
    document.getElementById('form-lat').nextElementSibling.textContent = ""
    document.getElementById('form-lng').nextElementSibling.textContent = ""
  })
}

function openConfirmDelete(id) {
  pendingDeleteId = id
  const s = allStructures.find(x => x.id === id)
  document.getElementById('confirm-message').textContent =
    `Voulez-vous vraiment supprimer "${s?.name || 'cette structure'}" ? Cette action est irréversible.`
  document.getElementById('confirm-modal').hidden = false
}

async function confirmDelete() {
  if (!pendingDeleteId) return
  try {
    await deleteStructure(pendingDeleteId);
    showToast('Structure supprimée.', 'warn')
    await loadStructures()
    renderAdminList()
  } catch (err) {
    showToast('Erreur lors de la suppression.', 'error')
    console.error(err)
  } finally {
    document.getElementById('confirm-modal').hidden = true
    pendingDeleteId = null
  }
}

// fallback demodata 
function getDemoData() {
  return [
    { id: 4, name: 'CEICA', precision_adresse_structure: false, contact_tel_structure: '813542456', latitude: -4.3359148, longitude: 15.2698697, gps_precision: 5, cover_url: null, adresse_structure: 'Nzanza', integration_ssaaj: true, espace_jeune_fonctionnel: false, offre_contraception: true, integration_pf_pharmacie: false, orientation_rupture_stocks: 'Centre des jeunes', adresse_struct_orientation: '', structure_type: "Centre d'Écoute et de Conseil", health_zone: '', city: 'boma', healthcare_detail: null, stocks: [{ slug: 'presartif_masc', name: 'Préservatifs masculins', type: 'communautaire' }, { slug: 'presartif_fem', name: 'Préservatifs féminins', type: 'communautaire' }] },
    { id: 3, name: 'Hosto', precision_adresse_structure: true, contact_tel_structure: '82555', latitude: -4.3359797, longitude: 15.2699612, gps_precision: 4, cover_url: null, adresse_structure: 'Limete 16e', integration_ssaaj: true, espace_jeune_fonctionnel: true, offre_contraception: true, integration_pf_pharmacie: false, orientation_rupture_stocks: 'Aucune', adresse_struct_orientation: 'Mmmmm', structure_type: 'Établissement de soin', health_zone: 'limete', city: 'kinshasa', healthcare_detail: 'cs', stocks: [{ slug: 'coc', name: 'Pilules Orales Combinées (Pilule classique)', type: 'communautaire' }, { slug: 'injectable', name: 'Contraceptif injectable classique', type: 'clinique' }] },
    { id: 5, name: 'TEST', precision_adresse_structure: false, contact_tel_structure: '840546250', latitude: -4.3357678, longitude: 15.2699245, gps_precision: 3, cover_url: null, adresse_structure: 'OK', integration_ssaaj: false, espace_jeune_fonctionnel: false, offre_contraception: false, integration_pf_pharmacie: false, orientation_rupture_stocks: 'Non', adresse_struct_orientation: '', structure_type: 'Centre de jeunes', health_zone: 'binza_meteo', city: 'kinshasa', healthcare_detail: null, stocks: [] },
  ]
}

// ── GESTIONNAIRE DYNAMIQUE DU DRAWER ──────────────────────────────
function openPlaceDrawer(s) {
  const contentContainer = document.getElementById('drawer-content')
  const drawer = document.getElementById('place-drawer')

  if (contentContainer && drawer) {
    contentContainer.innerHTML = buildPopupHtml(s)

    drawer.classList.add('is-open')
  }
}

function closePlaceDrawer() {
  const drawer = document.getElementById('place-drawer')
  if (drawer) {
    drawer.classList.remove('is-open')
  }
}

// ── UTILS / A11Y ──────────────────────────────────────────────────
function trapFocus(modal) {
  const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]

  modal.addEventListener('keydown', e => {
    if (e.key === 'Tab' && !modal.hidden) {
      if (e.shiftKey) { // shift + tab
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else { // tab
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    if (e.key === 'Escape' && !modal.hidden) {
      const closeBtn = modal.querySelector('.icon-btn--light')
      if (closeBtn) closeBtn.click()
    }
  })
}

// Appliquer trapFocus sur les modales existantes
trapFocus(document.getElementById('pin-modal'))
trapFocus(document.getElementById('admin-modal'))
trapFocus(document.getElementById('confirm-modal'))

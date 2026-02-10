(() => {
    const GLOBE_CONTAINER_ID = 'scenery-globe';
    const LIST_CONTAINER_ID = 'scenery-list';
    const DEFAULT_DATA_URL = '/assets/data/scenery.json';

    const GLOBE_RETRY_DELAY_MS = 250;
    const GLOBE_MAX_RETRIES = 20;

    const globeOptions = {
        globeImageUrl: 'https://unpkg.com/three-globe/example/img/earth-night.jpg',
        bumpImageUrl: 'https://unpkg.com/three-globe/example/img/earth-topology.png',
        backgroundColor: 'rgba(0, 0, 0, 0)',
    };

    function createMarkerElement(point) {
        const el = document.createElement('div');
        el.className = 'globe-marker';
        el.innerHTML = `
            <button class="globe-marker-dot" type="button" aria-label="${point.name}"></button>
            <div class="globe-marker-tooltip" role="dialog" aria-label="${point.name} scenery link">
                <div class="globe-marker-title">${point.name}</div>
                ${point.description ? `<div class="globe-marker-desc">${point.description}</div>` : ''}
                <a class="globe-marker-link" href="${point.link}" target="_blank" rel="noopener">Open scenery</a>
            </div>
        `;

        const button = el.querySelector('.globe-marker-dot');
        if (button) {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                document.querySelectorAll('.globe-marker.active').forEach((marker) => {
                    if (marker !== el) marker.classList.remove('active');
                });
                el.classList.toggle('active');
            });
        }

        return el;
    }

    function renderSceneryList(points) {
        const list = document.getElementById(LIST_CONTAINER_ID);
        if (!list) return;

        if (!points.length) {
            list.innerHTML = '<div class="scenery-empty">No scenery pins yet.</div>';
            return;
        }

        list.innerHTML = points
            .map((point) => {
                const description = point.description ? `<div class="scenery-item-desc">${point.description}</div>` : '';
                return `
                    <div class="scenery-item">
                        <div class="scenery-item-title">${point.name}</div>
                        ${description}
                        <a class="scenery-item-link" href="${point.link}" target="_blank" rel="noopener">Open scenery</a>
                    </div>
                `;
            })
            .join('');
    }

    function getDataUrl() {
        const attr = document.documentElement.getAttribute('data-scenery-url');
        return attr ? attr.trim() : DEFAULT_DATA_URL;
    }

    async function loadSceneryData() {
        const resp = await fetch(getDataUrl(), { cache: 'no-store' });
        if (!resp.ok) throw new Error('Failed to load scenery data');
        const json = await resp.json();
        if (!Array.isArray(json)) return [];
        return json
            .map((point) => ({
                name: String(point.name || '').trim(),
                description: String(point.description || '').trim(),
                link: String(point.link || '').trim(),
                lat: Number(point.lat),
                lng: Number(point.lng),
            }))
            .filter((point) => point.name && point.link && Number.isFinite(point.lat) && Number.isFinite(point.lng));
    }

    function initGlobe(points) {
        const container = document.getElementById(GLOBE_CONTAINER_ID);
        if (!container) return;

        const globe = Globe()(container)
            .globeImageUrl(globeOptions.globeImageUrl)
            .bumpImageUrl(globeOptions.bumpImageUrl)
            .backgroundColor(globeOptions.backgroundColor)
            .htmlElements(points)
            .htmlLat((d) => d.lat)
            .htmlLng((d) => d.lng)
            .htmlElement(createMarkerElement);

        globe.controls().autoRotate = true;
        globe.controls().autoRotateSpeed = 0.6;
        globe.controls().enableZoom = true;
        globe.controls().enablePan = false;
        globe.pointOfView({ lat: 12, lng: 0, altitude: 2.3 });

        const resizeGlobe = () => {
            const width = container.clientWidth || 0;
            const height = container.clientHeight || 0;
            if (width > 0 && height > 0) {
                globe.width(width);
                globe.height(height);
            }
        };

        resizeGlobe();
        window.addEventListener('resize', resizeGlobe);

        container.addEventListener('click', () => {
            document.querySelectorAll('.globe-marker.active').forEach((marker) => {
                marker.classList.remove('active');
            });
        });
    }

    function waitForGlobeLibrary(triesLeft, callback) {
        if (typeof window.Globe === 'function') {
            callback();
            return;
        }
        if (triesLeft <= 0) return;
        setTimeout(() => waitForGlobeLibrary(triesLeft - 1, callback), GLOBE_RETRY_DELAY_MS);
    }

    async function bootstrapSceneryGlobe() {
        let points = [];
        try {
            points = await loadSceneryData();
            renderSceneryList(points);
        } catch {
            const list = document.getElementById(LIST_CONTAINER_ID);
            if (list) {
                list.innerHTML = '<div class="scenery-empty">Unable to load scenery pins right now.</div>';
            }
        } finally {
            waitForGlobeLibrary(GLOBE_MAX_RETRIES, () => initGlobe(points));
        }
    }

    document.addEventListener('DOMContentLoaded', bootstrapSceneryGlobe);
})();

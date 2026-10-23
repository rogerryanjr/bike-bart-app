// Coordinates roughly in the center of Bay Area, between SF and Oakland ([lng, lat] for MapLibre)
const bayAreaCenter = [-122.35, 37.78];

const map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/liberty", // free, open source, no key
    center: bayAreaCenter,
    zoom: 10
});
map.addControl(new maplibregl.NavigationControl(), "bottom-right");

// Resolves once the map style has loaded and our sources/layers exist
const mapReady = new Promise(function (resolve) {
    map.on("load", function () {
        addCyclosmLayers();
        addRouteLayers();
        map.addControl(new MapStyleControl(), "top-right");
        resolve();
    });
});

const EMPTY_GEOJSON = { type: "FeatureCollection", features: [] };

function cyclosmTiles(style) {
    return ["a", "b", "c"].map(function (s) {
        return "https://" + s + ".tile-cyclosm.openstreetmap.fr/" + style + "/{z}/{x}/{y}.png";
    });
}

function addCyclosmLayers() {
    const attribution = '<a href="https://www.cyclosm.org">CyclOSM</a> hosted by <a href="https://openstreetmap.fr">OSM France</a>';

    // Bike lanes only, on a transparent background: sits under the map labels as an overlay
    map.addSource("cyclosm-lite", {
        type: "raster", tiles: cyclosmTiles("cyclosm-lite"), tileSize: 256, maxzoom: 20, attribution: attribution
    });
    const firstLabelLayer = map.getStyle().layers.find(function (layer) {
        return layer.type === "symbol";
    });
    map.addLayer({
        id: "cyclosm-lite", type: "raster", source: "cyclosm-lite",
        layout: { visibility: "none" }, paint: { "raster-opacity": 0.85 }
    }, firstLabelLayer && firstLabelLayer.id);

    // Full CyclOSM map: covers the base map completely (it has its own labels)
    map.addSource("cyclosm", {
        type: "raster", tiles: cyclosmTiles("cyclosm"), tileSize: 256, maxzoom: 20, attribution: attribution
    });
    map.addLayer({ id: "cyclosm", type: "raster", source: "cyclosm", layout: { visibility: "none" } });
}

// Route lines go on top of everything; their data gets filled in by setRouteData()
function addRouteLayers() {
    ["bike-only", "bike-legs", "train", "train-stops", "accuracy"].forEach(function (id) {
        map.addSource(id, { type: "geojson", data: EMPTY_GEOJSON });
    });

    map.addLayer({
        id: "accuracy", type: "fill", source: "accuracy",
        paint: { "fill-color": "#2563eb", "fill-opacity": 0.12 }
    });
    map.addLayer({
        id: "bike-only", type: "line", source: "bike-only",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#6b7280", "line-width": 4, "line-opacity": 0.7, "line-dasharray": [1, 2] }
    });
    map.addLayer({
        id: "train-casing", type: "line", source: "train",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#1f2937", "line-width": 9 }
    });
    map.addLayer({
        id: "train", type: "line", source: "train",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 5 }
    });
    map.addLayer({
        id: "bike-legs", type: "line", source: "bike-legs",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#7c3aed", "line-width": 5 }
    });
    map.addLayer({
        id: "train-stops", type: "circle", source: "train-stops",
        paint: { "circle-radius": 6, "circle-color": "#ffffff", "circle-stroke-color": "#1f2937", "circle-stroke-width": 3 }
    });
}

function setRouteData(sourceId, features) {
    map.getSource(sourceId).setData({ type: "FeatureCollection", features: features || [] });
}

function lineFeature(coords, properties) {
    return { type: "Feature", properties: properties || {}, geometry: { type: "LineString", coordinates: coords } };
}

// Map style switcher: OpenFreeMap or CyclOSM, plus an optional bike-lane overlay
class MapStyleControl {
    onAdd() {
        this.container = document.createElement("div");
        this.container.className = "maplibregl-ctrl maplibregl-ctrl-group map-style-control";
        this.container.innerHTML =
            '<label><input type="radio" name="base-map" value="standard" checked> Standard</label>' +
            '<label><input type="radio" name="base-map" value="cycling"> Cycling map</label>' +
            '<label><input type="checkbox" id="bike-overlay"> Bike lane overlay</label>';

        const overlay = this.container.querySelector("#bike-overlay");
        const update = function () {
            const cycling = this.container.querySelector('input[name="base-map"]:checked').value === "cycling";
            map.setLayoutProperty("cyclosm", "visibility", cycling ? "visible" : "none");
            // The full cycling map already shows bike lanes, so the overlay only applies to Standard
            overlay.disabled = cycling;
            map.setLayoutProperty("cyclosm-lite", "visibility", !cycling && overlay.checked ? "visible" : "none");
        }.bind(this);

        this.container.addEventListener("change", update);
        return this.container;
    }

    onRemove() {
        this.container.remove();
    }
}

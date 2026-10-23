// Tracks the user's location: live GPS on phones, with fallbacks when it's missing or inaccurate
const ACCURATE_ENOUGH_METERS = 100; // worse than this and we tell the user their dot may be off

let myLat = null;
let myLng = null;
let locationSource = null; // "device", "manual" (typed or dragged), or "ip"
let userMarker = null;
let hasCenteredOnUser = false;

function isMobileDevice() {
    if (navigator.userAgentData) {
        return navigator.userAgentData.mobile;
    }
    // iPads report themselves as Macs, but Macs don't have touch screens
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

// Only some browsers (mostly Chrome on Android) say whether they're on Wi-Fi
function isOnWifi() {
    return Boolean(navigator.connection && navigator.connection.type === "wifi");
}

function setUserLocation(lat, lng, accuracyMeters, source) {
    myLat = lat;
    myLng = lng;
    locationSource = source;

    mapReady.then(function () {
        if (!userMarker) {
            const dot = document.createElement("div");
            dot.className = "user-dot";
            userMarker = new maplibregl.Marker({ element: dot, draggable: true })
                .setLngLat([lng, lat])
                .addTo(map);
            // Dragging the dot lets people fix a bad location by hand
            userMarker.on("dragend", function () {
                const position = userMarker.getLngLat();
                setUserLocation(position.lat, position.lng, null, "manual");
                showLocationNotice("Using the spot you picked. <button type=\"button\" id=\"use-device-location\">Use my device location</button>");
            });
        } else {
            userMarker.setLngLat([lng, lat]);
        }

        setRouteData("accuracy", accuracyMeters ? [circleFeature(lat, lng, accuracyMeters)] : []);

        if (!hasCenteredOnUser) {
            hasCenteredOnUser = true;
            map.flyTo({ center: [lng, lat], zoom: 14 });
        }
    });
}

function onDevicePosition(position) {
    // Don't let live updates override a location the user set themselves
    if (locationSource === "manual") {
        return;
    }
    const accuracy = Math.round(position.coords.accuracy);
    setUserLocation(position.coords.latitude, position.coords.longitude, accuracy, "device");

    const fix = " Type a starting address above or drag the blue dot to the right spot.";
    if (!isMobileDevice()) {
        showLocationNotice("Computers don't have GPS, so your location comes from nearby Wi-Fi networks (accurate to about " +
            formatAccuracy(accuracy) + ")." + (accuracy > ACCURATE_ENOUGH_METERS ? fix : ""));
    } else if (accuracy > ACCURATE_ENOUGH_METERS) {
        showLocationNotice("Your location may be off by about " + formatAccuracy(accuracy) +
            (isOnWifi() ? " because it's coming from Wi-Fi instead of GPS." : ".") +
            " It should improve if you're outdoors with location services on." + fix);
    } else {
        hideLocationNotice();
    }
}

function onDevicePositionError(error) {
    console.log("Can't get location :(", error.message);
    // A later timeout doesn't matter if we already have a location
    if (locationSource !== null) {
        return;
    }
    const reason = error.code === error.PERMISSION_DENIED
        ? "Location access is turned off for this site."
        : "We couldn't find your location.";
    showLocationNotice(reason + " Type a starting address above, or " +
        "<button type=\"button\" id=\"use-ip-location\">use an approximate location</button> " +
        "from your internet connection (accurate to your city or neighborhood).");
}

// Very rough location from the user's IP address (asks a free service, get.geojs.io)
function useIpLocation() {
    showLocationNotice("Finding your approximate location...");
    fetchJson("https://get.geojs.io/v1/ip/geo.json")
        .then(function (data) {
            setUserLocation(parseFloat(data.latitude), parseFloat(data.longitude), null, "ip");
            showLocationNotice("Using an approximate location near " + escapeHtml(data.city || "you") +
                ". It can be miles off, so drag the blue dot or type a starting address for an accurate route.");
        })
        .catch(function (error) {
            console.log("IP location error:", error);
            showLocationNotice("Couldn't get an approximate location. Please type a starting address above.");
        });
}

function startLocationTracking() {
    if (!navigator.geolocation) {
        onDevicePositionError({ code: 0, message: "Geolocation not supported" });
        return;
    }
    // watchPosition keeps updating as the user moves, and uses GPS when the device has it
    navigator.geolocation.watchPosition(onDevicePosition, onDevicePositionError, {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 20000
    });
}

function useDeviceLocation() {
    if (!navigator.geolocation) {
        return;
    }
    locationSource = null;
    document.getElementById("start-input").value = "";
    hideLocationNotice();
    navigator.geolocation.getCurrentPosition(onDevicePosition, onDevicePositionError, { enableHighAccuracy: true });
}

function showLocationNotice(html) {
    const notice = document.getElementById("location-notice");
    notice.innerHTML = html;
    notice.hidden = false;
}

function hideLocationNotice() {
    document.getElementById("location-notice").hidden = true;
}

function formatAccuracy(meters) {
    const feet = meters * 3.28084;
    return feet < 1000 ? Math.round(feet / 10) * 10 + " ft" : (meters / 1609.34).toFixed(1) + " mi";
}

// A circle polygon showing how uncertain the location is
function circleFeature(lat, lng, radiusMeters) {
    const points = [];
    for (let i = 0; i <= 64; i++) {
        const angle = (i / 64) * 2 * Math.PI;
        points.push([
            lng + (radiusMeters / (111320 * Math.cos(lat * Math.PI / 180))) * Math.cos(angle),
            lat + (radiusMeters / 111320) * Math.sin(angle)
        ]);
    }
    return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [points] } };
}

// Buttons inside the notice get replaced often, so listen on the notice itself
document.getElementById("location-notice").addEventListener("click", function (event) {
    if (event.target.id === "use-ip-location") {
        useIpLocation();
    } else if (event.target.id === "use-device-location") {
        useDeviceLocation();
    }
});
document.getElementById("locate-button").addEventListener("click", useDeviceLocation);

startLocationTracking();

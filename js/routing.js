// Routing for bike
const BIKE_SPEED_MPH = 10; // assumed cyclist speed

// Get a bike route between two points: its line, distance and time at BIKE_SPEED_MPH
function getBikeLeg(startLat, startLng, endLat, endLng) {
    const url =
    API_URLS.bikeRouting +
    startLng + "," + startLat + ";" +
    endLng + "," + endLat +
    "?overview=full&geometries=geojson";

    return fetchJson(url).then(function (data) {
        if (!data.routes || data.routes.length === 0) {
            throw new Error("No bike route found.");
        }

        const route = data.routes[0];

        // OSRM's duration doesn't reflect our assumed speed, so calculate it from distance
        const miles = route.distance / 1609.34;
        return {
            coords: route.geometry.coordinates, // [lng, lat] pairs
            miles: miles,
            minutes: (miles / BIKE_SPEED_MPH) * 60
        };
    });
}

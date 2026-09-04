// Routing for bike 
let routeLine = null; 

function getBikeRoute(startLat, startLng, endLat, endLng) {

    const url = 
    "https://router.project-osrm.org/route/v1/cycling/" + 
    startLng + "," + startLat + ";" +
    endLng + "," + endLat +
    "?overview=full&geometries=geojson";

    fetch(url)
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            if (!data.routes || data.routes.length === 0) {
                alert("No bike route found.");
                return;
        }

        const route = data.routes[0];
        const coordinates = route.geometry.coordinates;

        const latLngs = route.geometry.coordinates.map(function (point) {
            return [point[1], point[0]];
        });

        if (routeLine) {
            map.removeLayer(routeLine);
        }
        routeLine = L.polyline(latLngs, { color: "blue", weight: 4 }).addTo(map);
        map.fitBounds(routeLine.getBounds());
        
        const distanceMiles = (route.distance / 1609.34).toFixed(1);
        const durationMin = Math.round(route.duration / 60);
        console.log("ROute: " + distanceMiles + " miles, about " + durationMin + " minutes by bike, no bus");

        })
        .catch(function (error) {
            console.log("Routing error:", error);
        });
       
}
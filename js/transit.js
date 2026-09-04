let allStops = [];

function distanceInMiles(lat1, lng1, lat2, lng2) {
    const R = 3958.8;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLng = (lng2 - lng1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function loadAllStops(lat, lng) {
    const url =
        "https://api.511.org/transit/stops?api_key=" + API_KEYS.transit511 + 
        "&operator_id=BA&format=json";

    fetch(url)
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            allStops = data.Contents.dataObjects.ScheduledStopPoint;
            console.log("Loaded " + allStops.length + " transit stops");
            showNearbyStops(lat, lng, 7);
        })
        .catch(function (error) { 
            console.log("Error loading transit: " + error);
        });
}

function showNearbyStops(lat, lng, maxResults) {
    if (allStops.length === 0) {
        console.log("Stops loading...");
        return;
    }

    const withDistance = allStops.map(function (stop) {
        return {
            name: stop.Name,
            lat: parseFloat(stop.Location.Latitude),
            lng: parseFloat(stop.Location.Longitude),
            distance: distanceInMiles(lat, lng, parseFloat(stop.Location.Latitude), parseFloat(stop.Location.Longitude))
        };
    });

    withDistance.sort(function (a, b) {
        return a.distance - b.distance;
    });

    const closest = withDistance.slice(0, maxResults);

    closest.forEach(function (stop) {
        L.marker([stop.lat, stop.lng], {
            icon: L.divIcon({ className: "transit-marker", html: "🚌" })
        })
            .addTo(map)
            .bindPopup(stop.name + " (" + stop.distance.toFixed(2) + " miles)");
    });  
}

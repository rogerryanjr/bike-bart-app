let destinationMarker = null; // replace later!!

document.getElementById("search-button").addEventListener("click", function() {
    const query = document.getElementById("destination-input").value;
    
    if (!query) {
        return; // add option in future to show random location within 25 mile radius
    }
    const url = "https://nominatim.openstreetmap.org/search?format=json&q=" + encodeURIComponent(query);

    fetch(url)
        .then(function (response) {
            return response.json();

        })
        .then(function (results) {
            if (results.length === 0 ) {
                alert("No results found for " + query + ". Please re-enter your destination.");
                return;
            }
            const place = results[0];
            const lat = parseFloat(place.lat);
            const lng = parseFloat(place.lon);

            if (destinationMarker) {
                map.removeLayer(destinationMarker);
            }

            destinationMarker = L.marker([lat, lng])
                .addTo(map)
                .bindPopup(place.display_name)
                .openPopup();

            map.setView([lat, lng], 14);

            if (myLat !== null && myLng !== null) {
                getBikeRoute(myLat, myLng, lat, lng);
            } else {
                console.log("Don't have your location yet - cant draw a route... ")
            }
        })
        .catch(function (error) {
            console.log("Error getting your destination", error);
        });
});


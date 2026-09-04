// Coordinates roughly in the center of Bay Area, between SF and Oakland
const bayAreaCenter = [37.78, -122.35];

// intialze the map

const map = L.map('map').setView(bayAreaCenter, 11);

// Add OpenStreetMap tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let myLat = null;
let myLng = null; 
// Find users location and drop a marker at their location
if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
        function (position) {
            const userLat = position.coords.latitude;
            const userLng = position.coords.longitude;

            // Move the map so user in center
            map.setView([userLat, userLng], 14);

            // Place marker at the user's location
            L.marker([userLat, userLng])
                .addTo(map)
                .bindPopup("You are here!")
                .openPopup();
        },
        function (error) {
            console.log("Can't get location :(", error.message);
        }
    );
} else {
    console.log("Your browser doesn't support location services :((");
}
// Destination search functionality
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
})
    .catch(function (error) {
        console.log("Error getting your destination", error);
    });
});


let myLat = null;
let myLng = null; 
// Find users location and drop a marker at their location
if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
        function (position) {
            const userLat = position.coords.latitude;
            const userLng = position.coords.longitude;

            // Move the map so user in center
            myLat = userLat;
            myLng = userLng;

            map.setView([userLat, userLng], 14);

            // Place marker at the user's location
            L.marker([userLat, userLng])
                .addTo(map)
                .bindPopup("You are here!")
                .openPopup();

            loadAllStops(userLat, userLng); // Load transit stops after getting user location
            showNearbyStops(userLat, userLng, 7);
        },
        function (error) {
            console.log("Can't get location :(", error.message);
        }
    );
} else {
   console.log("Your browser or device doesn't suppoty location services."); 
}
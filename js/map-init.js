// Coordinates roughly in the center of Bay Area, between SF and Oakland
const bayAreaCenter = [37.78, -122.35];

// intialze the map

const map = L.map('map').setView(bayAreaCenter, 11);

// Add OpenStreetMap tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

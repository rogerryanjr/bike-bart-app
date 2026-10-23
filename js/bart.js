// Bike + BART trip planning
const PLATFORM_BUFFER_MIN = 2; // time from reaching the station to the train leaving
const STATION_EXIT_MIN = 1; // time to get out of the destination station

let bartStations = [];

function loadBartStations() {
    const url = API_URLS.bart + "stn.aspx?cmd=stns&key=" + API_KEYS.bart + "&json=y";

    return fetchJson(url)
        .then(function (data) {
            bartStations = data.root.stations.station.map(function (station) {
                return {
                    name: station.name,
                    abbr: station.abbr,
                    lat: parseFloat(station.gtfs_latitude),
                    lng: parseFloat(station.gtfs_longitude)
                };
            });
            console.log("Loaded " + bartStations.length + " BART stations");
        })
        .catch(function (error) {
            console.log("Error loading BART stations: " + error);
        });
}

function nearestBartStation(lat, lng) {
    let nearest = null;
    let nearestDistance = Infinity;
    bartStations.forEach(function (station) {
        const distance = distanceInMiles(lat, lng, station.lat, station.lng);
        if (distance < nearestDistance) {
            nearest = station;
            nearestDistance = distance;
        }
    });
    return nearest;
}

// The BART API returns a single object instead of an array when there's only one result
function toArray(value) {
    return Array.isArray(value) ? value : [value];
}

// Turn BART's "10/23/2026" + "05:40 PM" into a Date (BART times are Bay Area local time)
function parseBartTime(dateStr, timeStr) {
    const dateParts = dateStr.split("/");
    const timeParts = timeStr.match(/(\d+):(\d+) (AM|PM)/);
    let hours = parseInt(timeParts[1], 10) % 12;
    if (timeParts[3] === "PM") {
        hours += 12;
    }
    return new Date(
        parseInt(dateParts[2], 10),
        parseInt(dateParts[0], 10) - 1,
        parseInt(dateParts[1], 10),
        hours,
        parseInt(timeParts[2], 10)
    );
}

// Format a Date the way the BART API wants it: "10/23/2026" and "5:40pm"
function bartDateParam(date) {
    return (date.getMonth() + 1) + "/" + date.getDate() + "/" + date.getFullYear();
}
function bartTimeParam(date) {
    const hours = date.getHours() % 12 || 12;
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return hours + ":" + minutes + (date.getHours() < 12 ? "am" : "pm");
}

// Find the first train from orig to dest that leaves at or after readyTime
function getNextBartTrip(origAbbr, destAbbr, readyTime) {
    const url =
        API_URLS.bart + "sched.aspx?cmd=depart" +
        "&orig=" + origAbbr + "&dest=" + destAbbr +
        "&date=" + bartDateParam(readyTime) +
        "&time=" + encodeURIComponent(bartTimeParam(readyTime)) +
        "&b=0&a=4&key=" + API_KEYS.bart + "&json=y";

    return fetchJson(url).then(function (data) {
        if (data.root.message && data.root.message.error) {
            throw new Error("BART: " + data.root.message.error.details);
        }

        const trips = toArray(data.root.schedule.request.trip).map(function (trip) {
            return {
                depart: parseBartTime(trip["@origTimeDate"], trip["@origTimeMin"]),
                arrive: parseBartTime(trip["@destTimeDate"], trip["@destTimeMin"]),
                legs: toArray(trip.leg).map(function (leg) {
                    return {
                        origin: leg["@origin"],
                        destination: leg["@destination"],
                        route: leg["@line"].replace("ROUTE ", ""),
                        headStation: leg["@trainHeadStation"]
                    };
                })
            };
        });

        // readyTime has seconds, BART times don't, so a train in the same minute is too tight
        const trip = trips.find(function (t) {
            return t.depart >= readyTime;
        });
        if (!trip) {
            throw new Error("No upcoming BART trains found.");
        }
        return trip;
    });
}

const MAX_STATION_SNAP_METERS = 300; // how far a station can be from a track and still count as on it

function findStation(abbr) {
    return bartStations.find(function (station) {
        return station.abbr === abbr;
    });
}

// Closest point on a track to a station: which segment it's on, how far along it, and how far away
function snapToTrack(coords, lat, lng) {
    const scale = Math.cos(lat * Math.PI / 180); // makes longitude degrees comparable to latitude degrees
    let best = null;
    for (let i = 0; i < coords.length - 1; i++) {
        const ax = coords[i][0] * scale, ay = coords[i][1];
        const bx = coords[i + 1][0] * scale, by = coords[i + 1][1];
        const px = lng * scale, py = lat;
        const dx = bx - ax, dy = by - ay;
        const lengthSq = dx * dx + dy * dy;
        const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
        const meters = Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * 111320;
        if (!best || meters < best.meters) {
            best = {
                segment: i,
                t: t,
                meters: meters,
                point: [coords[i][0] + t * (coords[i + 1][0] - coords[i][0]), coords[i][1] + t * (coords[i + 1][1] - coords[i][1])]
            };
        }
    }
    return best;
}

// The piece of BART track between two stations, following the actual rails
function trackBetween(origAbbr, destAbbr, routeId) {
    const orig = findStation(origAbbr);
    const dest = findStation(destAbbr);
    if (!orig || !dest) {
        return null;
    }

    // Prefer the leg's own line, but fall back to any line that runs between the two stations
    const sameRoute = BART_SHAPES.filter(function (shape) { return shape.route === routeId; });
    const candidates = sameRoute.concat(BART_SHAPES);

    for (let i = 0; i < candidates.length; i++) {
        const shape = candidates[i];
        const start = snapToTrack(shape.coords, orig.lat, orig.lng);
        const end = snapToTrack(shape.coords, dest.lat, dest.lng);
        const onTrack = start.meters < MAX_STATION_SNAP_METERS && end.meters < MAX_STATION_SNAP_METERS;
        // Shapes run in one direction, so the origin has to come before the destination
        const rightDirection = start.segment < end.segment || (start.segment === end.segment && start.t < end.t);
        if (onTrack && rightDirection) {
            return {
                color: shape.color,
                coords: [start.point].concat(shape.coords.slice(start.segment + 1, end.segment + 1), [end.point])
            };
        }
    }
    return null;
}

function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60000);
}

function formatClock(date) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Like formatClock, but adds the day when it isn't today ("Sat, Oct 24, 5:30 PM")
function formatDayAndClock(date) {
    if (date.toDateString() === new Date().toDateString()) {
        return formatClock(date);
    }
    return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) + ", " + formatClock(date);
}

// Bike to the nearest station, ride BART, exit, then bike to the destination
function planBikeBartTrip(startLat, startLng, endLat, endLng, startTime) {
    const origStation = nearestBartStation(startLat, startLng);
    const destStation = nearestBartStation(endLat, endLng);

    if (!origStation || !destStation) {
        return Promise.reject(new Error("BART stations haven't loaded yet."));
    }
    if (origStation.abbr === destStation.abbr) {
        return Promise.reject(new Error("Both ends are closest to " + origStation.name + ", so BART won't help."));
    }

    return Promise.all([
        getBikeLeg(startLat, startLng, origStation.lat, origStation.lng),
        getBikeLeg(destStation.lat, destStation.lng, endLat, endLng)
    ]).then(function (bikeLegs) {
        const firstLeg = bikeLegs[0];
        const lastLeg = bikeLegs[1];

        const atStation = addMinutes(startTime, firstLeg.minutes);
        const readyTime = addMinutes(atStation, PLATFORM_BUFFER_MIN);

        return getNextBartTrip(origStation.abbr, destStation.abbr, readyTime).then(function (train) {
            const exited = addMinutes(train.arrive, STATION_EXIT_MIN);
            const arrival = addMinutes(exited, lastLeg.minutes);

            return {
                origStation: origStation,
                destStation: destStation,
                firstLeg: firstLeg,
                lastLeg: lastLeg,
                train: train,
                startTime: startTime,
                atStation: atStation,
                arrival: arrival,
                waitMinutes: (train.depart - atStation) / 60000,
                trainMinutes: (train.arrive - train.depart) / 60000,
                totalMinutes: (arrival - startTime) / 60000
            };
        });
    });
}

// Generic train-station icon (not BART's logo, which is trademarked)
const STATION_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">' +
    '<rect x="2" y="2" width="44" height="44" rx="12" fill="#0f4c81" stroke="#ffffff" stroke-width="4"/>' +
    '<rect x="15" y="11" width="18" height="21" rx="5" fill="#ffffff"/>' +
    '<rect x="18" y="15" width="12" height="7" rx="1.5" fill="#0f4c81"/>' +
    '<circle cx="19.5" cy="27" r="2" fill="#0f4c81"/><circle cx="28.5" cy="27" r="2" fill="#0f4c81"/>' +
    '<path d="M18 33 L15 38 M30 33 L33 38" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>' +
    "</svg>";

// A marker and name label for every BART station
function showBartStations() {
    const icon = new Image(48, 48);
    icon.onload = function () {
        map.addImage("bart-station", icon, { pixelRatio: 2 });
        map.addSource("bart-stations", {
            type: "geojson",
            data: {
                type: "FeatureCollection",
                features: bartStations.map(function (station) {
                    return {
                        type: "Feature",
                        properties: { name: station.name },
                        geometry: { type: "Point", coordinates: [station.lng, station.lat] }
                    };
                })
            }
        });
        // Under the trip's start/end station dots so those stay visible
        map.addLayer({
            id: "bart-stations", type: "symbol", source: "bart-stations",
            layout: {
                "icon-image": "bart-station",
                "icon-size": ["interpolate", ["linear"], ["zoom"], 9, 0.7, 14, 1.1],
                "icon-allow-overlap": true,
                // Names only once zoomed in enough that they don't pile up
                "text-field": ["step", ["zoom"], "", 12, ["get", "name"]],
                "text-font": ["Noto Sans Bold"],
                "text-size": 12,
                "text-offset": [0, 1.4],
                "text-anchor": "top",
                "text-optional": true
            },
            paint: { "text-color": "#0f4c81", "text-halo-color": "#ffffff", "text-halo-width": 1.5 }
        }, "train-stops");
    };
    icon.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(STATION_ICON_SVG);

    map.on("click", "bart-stations", function (event) {
        const feature = event.features[0];
        new maplibregl.Popup({ offset: 14 })
            .setLngLat(feature.geometry.coordinates)
            .setText(feature.properties.name + " BART")
            .addTo(map);
    });
    map.on("mouseenter", "bart-stations", function () { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "bart-stations", function () { map.getCanvas().style.cursor = ""; });
}

Promise.all([loadBartStations(), mapReady]).then(function () {
    if (bartStations.length > 0) {
        showBartStations();
    }
});

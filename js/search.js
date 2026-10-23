let destinationMarker = null;

function geocode(query) {
    const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(query);
    return fetchJson(url).then(function (results) {
        if (results.length === 0) {
            throw new Error("No results found for \"" + query + "\". Please try a different address.");
        }
        return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon), name: results[0].display_name };
    });
}

// Departure time picker: scroll wheels for day, hour, minute and AM/PM
const WHEEL_ITEM_HEIGHT = 36; // keep in sync with .wheel-item height in style.css
const WHEEL_DAYS = 7; // how far ahead you can plan

let chosenTime = null; // the wheels' current value, set when they're first shown

function startOfDay(date) {
    const day = new Date(date);
    day.setHours(0, 0, 0, 0);
    return day;
}

// Each wheel's options, as { value, label }
function wheelOptions(part) {
    const options = [];
    if (part === "day") {
        for (let i = 0; i < WHEEL_DAYS; i++) {
            const day = startOfDay(new Date());
            day.setDate(day.getDate() + i);
            const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" :
                day.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
            options.push({ value: i, label: label });
        }
    } else if (part === "hour") {
        for (let h = 1; h <= 12; h++) {
            options.push({ value: h % 12, label: String(h) });
        }
    } else if (part === "minute") {
        for (let m = 0; m < 60; m += 5) {
            options.push({ value: m, label: String(m).padStart(2, "0") });
        }
    } else {
        options.push({ value: 0, label: "AM" }, { value: 12, label: "PM" });
    }
    return options;
}

// Which option a wheel should show for a given time
function wheelValueFor(part, time) {
    if (part === "day") {
        return Math.round((startOfDay(time) - startOfDay(new Date())) / 86400000);
    }
    if (part === "hour") {
        return time.getHours() % 12;
    }
    if (part === "minute") {
        return time.getMinutes();
    }
    return time.getHours() < 12 ? 0 : 12;
}

function wheelIndex(wheel) {
    const index = Math.round(wheel.scrollTop / WHEEL_ITEM_HEIGHT);
    return Math.max(0, Math.min(wheel.children.length - 1, index));
}

// Rebuild the wheels (so "Today" stays correct) and scroll each one to chosenTime
function showTimeWheels() {
    document.querySelectorAll(".wheel").forEach(function (wheel) {
        const options = wheelOptions(wheel.dataset.part);
        const target = wheelValueFor(wheel.dataset.part, chosenTime);
        wheel.innerHTML = options.map(function (option) {
            return '<div class="wheel-item" data-value="' + option.value + '">' + option.label + "</div>";
        }).join("");
        const index = Math.max(0, options.findIndex(function (option) { return option.value === target; }));
        wheel.scrollTop = index * WHEEL_ITEM_HEIGHT;
        markSelected(wheel);
    });
}

function markSelected(wheel) {
    const index = wheelIndex(wheel);
    Array.prototype.forEach.call(wheel.children, function (item, i) {
        item.classList.toggle("selected", i === index);
    });
}

// Read the time the wheels are pointing at
function readTimeWheels() {
    const values = {};
    document.querySelectorAll(".wheel").forEach(function (wheel) {
        values[wheel.dataset.part] = parseInt(wheel.children[wheelIndex(wheel)].dataset.value, 10);
    });
    const time = startOfDay(new Date());
    time.setDate(time.getDate() + values.day);
    time.setHours(values.hour + values.ampm, values.minute);
    return time;
}

document.querySelectorAll(".wheel").forEach(function (wheel) {
    wheel.addEventListener("scroll", function () {
        markSelected(wheel);
        chosenTime = readTimeWheels();
    });
    // Tap an option to jump to it
    wheel.addEventListener("click", function (event) {
        const item = event.target.closest(".wheel-item");
        if (item) {
            const index = Array.prototype.indexOf.call(wheel.children, item);
            wheel.scrollTo({ top: index * WHEEL_ITEM_HEIGHT, behavior: "smooth" });
        }
    });
    // Arrow keys for keyboard users
    wheel.addEventListener("keydown", function (event) {
        const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
        if (step) {
            event.preventDefault();
            wheel.scrollTo({ top: (wheelIndex(wheel) + step) * WHEEL_ITEM_HEIGHT, behavior: "smooth" });
        }
    });
});

// Show the wheels for "At a set time", starting at the next 5-minute mark
document.getElementById("leave-select").addEventListener("change", function () {
    const wheels = document.getElementById("leave-time");
    wheels.hidden = this.value === "now";
    if (!wheels.hidden) {
        if (!chosenTime) {
            chosenTime = new Date(Math.ceil(Date.now() / 300000) * 300000);
        }
        showTimeWheels(); // after unhiding, since hidden elements can't be scrolled
    }
});

// null means "leave now"
function getChosenDepartureTime() {
    if (document.getElementById("leave-select").value === "now" || !chosenTime) {
        return null;
    }
    return readTimeWheels();
}

document.getElementById("search-form").addEventListener("submit", function (event) {
    event.preventDefault();
    const startQuery = document.getElementById("start-input").value.trim();
    const query = document.getElementById("destination-input").value.trim();

    if (!query) {
        return; // add option in future to show random location within 25 mile radius
    }
    // An empty "From" box means use the device location
    if (!startQuery && (myLat === null || myLng === null)) {
        showPanel("Still finding your location. Type a starting address or try again in a moment.");
        return;
    }

    showPanel("Looking up addresses...");
    const startLookup = startQuery
        ? geocode(startQuery).then(function (place) {
            setUserLocation(place.lat, place.lng, null, "manual");
            hideLocationNotice();
            return place;
        })
        : Promise.resolve({ lat: myLat, lng: myLng });

    Promise.all([startLookup, geocode(query)])
        .then(function (places) {
            const start = places[0];
            const place = places[1];

            if (destinationMarker) {
                destinationMarker.remove();
            }
            destinationMarker = new maplibregl.Marker({ color: "#dc2626" })
                .setLngLat([place.lng, place.lat])
                .setPopup(new maplibregl.Popup({ offset: 25 }).setText(place.name))
                .addTo(map);

            planTrip(start.lat, start.lng, place.lat, place.lng, getChosenDepartureTime());
        })
        .catch(function (error) {
            console.log("Error looking up addresses", error);
            showPanel(escapeHtml(error.message.indexOf("No results") === 0 ? error.message : "Couldn't look up that address. Please try again."));
        });
});

// Work out the bike-only and bike + BART trips, then draw and describe them
function planTrip(startLat, startLng, endLat, endLng, departureTime) {
    showPanel("Planning your trip...");
    const leaveNow = !departureTime;
    const startTime = departureTime || new Date();

    // Promise.allSettled so one option failing doesn't hide the other
    Promise.allSettled([
        getBikeLeg(startLat, startLng, endLat, endLng),
        planBikeBartTrip(startLat, startLng, endLat, endLng, startTime),
        mapReady
    ]).then(function (results) {
        const bikeOnly = results[0];
        const bikeBart = results[1];
        const allCoords = [[startLng, startLat], [endLng, endLat]];
        let html = "";

        if (bikeBart.status === "fulfilled") {
            const plan = bikeBart.value;
            const trainFeatures = [];
            const stopFeatures = [];

            plan.train.legs.forEach(function (leg) {
                const track = trackBetween(leg.origin, leg.destination, leg.route);
                const from = findStation(leg.origin);
                const to = findStation(leg.destination);
                // Fall back to a straight line if the track data doesn't cover this trip
                const coords = track ? track.coords : [[from.lng, from.lat], [to.lng, to.lat]];
                trainFeatures.push(lineFeature(coords, { color: track ? track.color : "#6b7280" }));
                stopFeatures.push(pointFeature(from), pointFeature(to));
                allCoords.push.apply(allCoords, coords);
            });

            setRouteData("bike-legs", [lineFeature(plan.firstLeg.coords), lineFeature(plan.lastLeg.coords)]);
            setRouteData("train", trainFeatures);
            setRouteData("train-stops", stopFeatures);
            allCoords.push.apply(allCoords, plan.firstLeg.coords.concat(plan.lastLeg.coords));
            html += bikeBartHtml(plan, leaveNow);
        } else {
            console.log("Bike + BART error:", bikeBart.reason);
            ["bike-legs", "train", "train-stops"].forEach(function (id) { setRouteData(id, []); });
            html += '<div class="option"><h2>Bike + BART</h2><p class="muted">' + escapeHtml(bikeBart.reason.message) + "</p></div>";
        }

        if (bikeOnly.status === "fulfilled") {
            const leg = bikeOnly.value;
            setRouteData("bike-only", [lineFeature(leg.coords)]);
            allCoords.push.apply(allCoords, leg.coords);
            html += '<div class="option"><h2><span class="swatch swatch-bike-only"></span>Bike only ' +
                '<span class="total">' + Math.round(leg.minutes) + " min</span></h2>" +
                '<p class="muted">' + leg.miles.toFixed(1) + " mi, " + leaveText(startTime, leaveNow) +
                ", arrive " + formatClock(addMinutes(startTime, leg.minutes)) + "</p></div>";
        } else {
            console.log("Routing error:", bikeOnly.reason);
            setRouteData("bike-only", []);
            html += '<div class="option"><h2>Bike only</h2><p class="muted">' + escapeHtml(bikeOnly.reason.message) + "</p></div>";
        }

        fitToCoords(allCoords);
        showPanel(html);
    });
}

function pointFeature(station) {
    return { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [station.lng, station.lat] } };
}

function fitToCoords(coords) {
    const bounds = coords.reduce(function (b, c) {
        return b.extend(c);
    }, new maplibregl.LngLatBounds(coords[0], coords[0]));
    // Leave room for the panel: on the left for desktop, at the top for phones
    const padding = window.innerWidth > 700
        ? { top: 60, bottom: 60, left: 400, right: 60 }
        : { top: 260, bottom: 40, left: 30, right: 30 };
    map.fitBounds(bounds, { padding: padding, maxZoom: 15 });
}

function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function leaveText(startTime, leaveNow) {
    return leaveNow ? "leave now" : "leave " + formatDayAndClock(startTime);
}

function bikeBartHtml(plan, leaveNow) {
    const lines = plan.train.legs.map(function (leg) {
        return escapeHtml(leg.headStation);
    }).join(", then ");
    const transfers = plan.train.legs.length - 1;

    const step = function (kind, minutes, text) {
        return '<li class="step step-' + kind + '"><span class="step-time">' + minutes + " min</span>" + text + "</li>";
    };

    return '<div class="option"><h2><span class="swatch swatch-bike-bart"></span>Bike + BART ' +
        '<span class="total">' + Math.round(plan.totalMinutes) + " min</span></h2>" +
        '<p class="muted">' + capitalize(leaveText(plan.startTime, leaveNow)) + ", arrive " + formatClock(plan.arrival) + "</p>" +
        '<ol class="timeline">' +
        step("bike", Math.round(plan.firstLeg.minutes), "Bike to <strong>" + escapeHtml(plan.origStation.name) + "</strong> (" +
            plan.firstLeg.miles.toFixed(1) + " mi)") +
        step("wait", Math.round(plan.waitMinutes), "Get to the platform (" + PLATFORM_BUFFER_MIN +
            " min) and wait. Train leaves <strong>" + formatClock(plan.train.depart) + "</strong> toward " + lines) +
        step("train", Math.round(plan.trainMinutes), "Ride to <strong>" + escapeHtml(plan.destStation.name) + "</strong>, arriving " +
            formatClock(plan.train.arrive) + (transfers > 0 ? " (" + transfers + " transfer" + (transfers > 1 ? "s" : "") + ")" : "")) +
        step("exit", STATION_EXIT_MIN, "Exit the station") +
        step("bike", Math.round(plan.lastLeg.minutes), "Bike to your destination (" + plan.lastLeg.miles.toFixed(1) + " mi)") +
        "</ol></div>";
}

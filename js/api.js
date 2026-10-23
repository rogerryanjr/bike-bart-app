// Shared fetch helper that fails loudly on HTTP errors (bad key, rate limit, server down)
function fetchJson(url) {
    return fetch(url).then(function (response) {
        if (!response.ok) {
            throw new Error("Request failed: " + response.status + " " + response.statusText);
        }
        return response.json();
    });
}

// Show a message (or trip details) in the results area of the panel
function showPanel(html) {
    const results = document.getElementById("trip-results");
    results.innerHTML = html;
    results.hidden = false;
}

// For putting user-typed or API text inside HTML safely
function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

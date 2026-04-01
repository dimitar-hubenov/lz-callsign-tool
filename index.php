<?php ?>
<!DOCTYPE html>
<html lang="bg" data-bs-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LZ Callsign Tool</title>

<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css" rel="stylesheet">

<style>
.table th {
    text-align: center;
}

.table td {
    text-align: center;
    vertical-align: middle;
}

.free {
    --bs-table-bg: rgba(25, 135, 84, 0.35);
    color: #fff;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
}

.free:hover {
    filter: brightness(1.15);
}

.taken {
    --bs-table-bg: rgba(220, 53, 69, 0.15);
}

/* Optional subtle hover (non-clickable, just visual) */
.table tbody tr:hover td {
    filter: brightness(1.1);
}

input {
    text-transform: uppercase;
}
</style>
</head>

<body class="container py-4">

<h4 class="mb-4">LZ Callsign Tool</h4>

<!-- Controls -->
<div class="row g-2 align-items-center mb-3">

    <div class="col-12 col-md-auto">
        <select id="region" class="form-select">
            <option value="south">Южна България</option>
            <option value="north">Северна България</option>
        </select>
    </div>

    <div class="col-12 col-md-auto">
        <select id="length" class="form-select">
            <option value="1">1 знак (временен)</option>
            <option value="2" selected>2 знака</option>
            <option value="3">3 знака</option>
        </select>
    </div>

    <div class="col-12 col-md">
    <div class="input-group">
        <input id="suffix" class="form-control" placeholder="A, AB или ABC" maxlength="2">
        <button class="btn btn-outline-secondary" type="button" onclick="runSearch()">
            <i class="bi bi-search"></i>
        </button>
    </div>
</div>

</div>

<div id="status" class="mb-3 text-secondary"></div>
<div id="table"></div>

<script>
let debounceTimer = null;
let lastQuery = "";

function getDigits() {
    let region = document.getElementById("region").value;
    return (region === "south")
        ? ["1","3","5","7","9"]
        : ["2","4","6","8"];
}

function triggerSearch() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runSearch, 300);
}

async function runSearch() {
    let suffix = document.getElementById("suffix").value.toUpperCase().trim();
    let length = document.getElementById("length").value;
    let digits = getDigits();

    suffix = suffix.replace(/[^A-Z]/g, '');

    let queryKey = suffix + "|" + length + "|" + digits.join(",");
    if (queryKey === lastQuery) return;
    lastQuery = queryKey;

    document.getElementById("status").innerText = "⏳ Зареждане...";
    document.getElementById("table").innerHTML = "";

    try {
        let url = `search.php?suffix=${suffix}&length=${length}&digits=${digits.join(",")}`;
        let res = await fetch(url);
        let data = await res.json();

        renderTable(data);
        document.getElementById("status").innerText = "";

    } catch (e) {
        document.getElementById("status").innerText = "⚠️ Грешка";
    }
}

function renderTable(data) {
    let div = document.getElementById("table");

    if (!data.rows.length) {
        div.innerHTML = "<div class='text-muted'>Няма свободни варианти</div>";
        return;
    }

    let html = `<div class="table-responsive"><table class="table table-bordered table-sm align-middle">`;

    html += "<thead><tr><th>Суфикс</th>";

    data.digits.forEach(d => {
        html += `<th>LZ${d}</th>`;
    });

    html += "</tr></thead><tbody>";

    data.rows.forEach(row => {
        html += `<tr><td>${row.suffix}</td>`;

        data.digits.forEach(d => {
            let cs = "LZ" + d + row.suffix;

            if (row.free.includes(d)) {
                html += `<td class="free" onclick="copyCallsign('${cs}', this)"><span>${cs}</span></td>`;
            } else {
                html += `<td class="taken"></td>`;
            }
        });

        html += "</tr>";
    });

    html += "</tbody></table></div>";

    div.innerHTML = html;
}

async function copyCallsign(cs, el) {
    try {
        await navigator.clipboard.writeText(cs);

        const span = el.querySelector("span");

        const original = span.innerText;

        // show clipboard icon
        span.innerHTML = '<i class="bi bi-clipboard2-check"></i>';

        setTimeout(() => {
            span.innerText = original;
        }, 800);

    } catch (err) {
        console.error("Copy failed", err);
    }
}

function updateSuffixInput() {
    const input = document.getElementById("suffix");
    const length = parseInt(document.getElementById("length").value);

    // Set maxlength
    input.maxLength = length;

    // Set placeholder
    const placeholders = {
        1: "A",
        2: "A, AB",
        3: "A, AB, ABC"
    };

    input.placeholder = placeholders[length] || "";

    // Trim value if too long
    if (input.value.length > length) {
        input.value = input.value.substring(0, length);
    }
}

// events
document.getElementById("suffix").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
        e.preventDefault();
        runSearch();
    }
})
document.getElementById("suffix").addEventListener("input", function (e) {
    let value = e.target.value.toUpperCase();

    // Keep only A-Z
    value = value.replace(/[^A-Z]/g, '');

    // Enforce max length
    const maxLen = parseInt(document.getElementById("length").value);
    value = value.substring(0, maxLen);

    e.target.value = value;

    triggerSearch();
});
document.getElementById("length").addEventListener("change", () => {
    updateSuffixInput();
    triggerSearch();
});
document.getElementById("region").addEventListener("change", triggerSearch);

updateSuffixInput();
</script>

</body>
</html>
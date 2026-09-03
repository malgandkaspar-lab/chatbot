const vestlus = document.getElementById("vestlus");
const vorm = document.getElementById("vorm");
const sisend = document.getElementById("sisend");
const saadaNupp = document.getElementById("saada");
const tervisDiv = document.getElementById("tervis");
const naitedDiv = document.getElementById("naited");

// Seansi ID hoiame sessionStorage'is, et mälu püsiks lehe uuendamisel,
// aga eri kaardid oleksid eraldi vestlused.
const SEANSS =
  sessionStorage.getItem("metsabot-seanss") ??
  (() => {
    const id = crypto.randomUUID();
    sessionStorage.setItem("metsabot-seanss", id);
    return id;
  })();

const NAITED = [
  "Kas metsa raiutakse rohkem kui juurde kasvab?",
  "Kui suur osa Eestist on metsa all?",
  "Kui palju raiuti Võrumaal?",
  "Kui palju raiuti Eestis kokku metsa 2025. aastal?",
  "Kas kinnistul 46801:003:0053 on raieluba?",
  "Mis metsa kasvab katastriüksusel 46801:003:0053?",
  "Kas kevadel tohib metsa raiuda?",
  "Kui hull on kooreüraskiolukord?",
];

for (const n of NAITED) {
  const b = document.createElement("button");
  b.textContent = n;
  b.onclick = () => {
    sisend.value = n;
    vorm.requestSubmit();
  };
  naitedDiv.append(b);
}

// --- Väga väike markdown-renderdaja -------------------------------------
// Vajame ainult seda, mida šabloonid tegelikult kasutavad: pealkirjad,
// paksus, tabelid, loendid, koodijupid. Väline teek oleks liigne.

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}

function inline(s) {
  return escapeHtml(s)
    .replace(/&amp;nbsp;/g, "&nbsp;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(
      /\[(.+?)\]\((https?:\/\/[^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>',
    );
}

function markdown(tekst) {
  const read = tekst.split("\n");
  const out = [];
  let i = 0;

  while (i < read.length) {
    const rida = read[i];

    if (!rida.trim()) {
      i++;
      continue;
    }

    // Tabel: rida | ... | ja järgmine on eraldaja
    if (rida.includes("|") && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(read[i + 1] ?? "")) {
      const lahutaRida = (r) =>
        r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
      const pais = lahutaRida(rida);
      i += 2;
      const kehad = [];
      while (i < read.length && read[i].includes("|")) {
        kehad.push(lahutaRida(read[i]));
        i++;
      }
      out.push(
        "<table><thead><tr>" +
          pais.map((c) => `<th>${inline(c)}</th>`).join("") +
          "</tr></thead><tbody>" +
          kehad
            .map((r) => "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>")
            .join("") +
          "</tbody></table>",
      );
      continue;
    }

    // Pealkiri
    const h = /^(#{1,4})\s+(.*)$/.exec(rida);
    if (h) {
      const tase = Math.min(h[1].length + 2, 6);
      out.push(`<h${tase}>${inline(h[2])}</h${tase}>`);
      i++;
      continue;
    }

    // Loend
    if (/^\s*[-*]\s+/.test(rida)) {
      const punktid = [];
      while (i < read.length && /^\s*[-*]\s+/.test(read[i])) {
        punktid.push(read[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      out.push("<ul>" + punktid.map((p) => `<li>${inline(p)}</li>`).join("") + "</ul>");
      continue;
    }

    // Lõik (kuni tühja reani)
    const loik = [];
    while (
      i < read.length &&
      read[i].trim() &&
      !/^\s*[-*]\s+/.test(read[i]) &&
      !/^#{1,4}\s/.test(read[i]) &&
      !read[i].includes("|")
    ) {
      loik.push(read[i]);
      i++;
    }
    if (loik.length) out.push(`<p>${inline(loik.join(" "))}</p>`);
    else i++;
  }

  return out.join("");
}

// --- Graafikud -----------------------------------------------------------
// Lihtsad SVG-diagrammid ilma teekideta: tulpdiagramm ja joondiagramm.
// Andmed tulevad serverist ("lopp" sündmuse graafik-väljas).

function joonistaGraafik(g) {
  const wrapp = document.createElement("div");
  wrapp.className = "graafik";
  const pealkiri = document.createElement("p");
  pealkiri.className = "pealkiri";
  pealkiri.textContent = g.uhik ? `Ühik: ${g.uhik}` : "";
  wrapp.append(pealkiri);

  const L = 380;
  const K = 150;
  const pa = 6;
  const po = 22;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${L} ${K}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  if (g.tyyp === "tulp") {
    const n = g.vaartused.length;
    const max = Math.max(...g.vaartused, 1e-9);
    const rida = (K - po - pa * 2) / max;
    const laius = Math.min(34, ((L - pa * 2 - (n - 1) * 4) / n) | 0);
    const kogu = pa * 2 + n * laius + (n - 1) * 4;
    let x = pa + Math.max(0, (L - kogu) / 2);
    g.vaartused.forEach((v, i) => {
      const h = Math.max(v * rida, 2);
      const y = K - po - h;
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", x);
      rect.setAttribute("y", y);
      rect.setAttribute("width", laius);
      rect.setAttribute("height", h);
      rect.setAttribute("rx", 3);
      rect.setAttribute("fill", "#2d6a4f");
      const t = document.createElementNS("http://www.w3.org/2000/svg", "title");
      t.textContent = `${g.sildid[i]}: ${fmtArv(v)} ${g.uhik}`;
      rect.append(t);
      svg.append(rect);
      const silt = document.createElementNS("http://www.w3.org/2000/svg", "text");
      silt.setAttribute("x", x + laius / 2);
      silt.setAttribute("y", K - po + 10);
      silt.setAttribute("text-anchor", "middle");
      silt.setAttribute("font-size", "9");
      silt.setAttribute("fill", "#6b7280");
      silt.textContent = luhikeSilt(g.sildid[i]);
      svg.append(silt);
      x += laius + 4;
    });
  } else {
    // rida
    const n = g.vaartused.length;
    const min = Math.min(...g.vaartused, 0);
    const max = Math.max(...g.vaartused, min + 1e-9);
    const ulatus = max - min || 1;
    const ka = (K - po - pa * 2) / (ulatus * 1.08);
    const kx = (L - pa * 2) / Math.max(n - 1, 1);
    const punktid = g.vaartused.map((v, i) => {
      const x = pa + i * kx;
      const y = K - po - (v - min + ulatus * 0.04) * ka;
      return [x, y];
    });
    const joon = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    joon.setAttribute("points", punktid.map((p) => p.join(",")).join(" "));
    joon.setAttribute("fill", "none");
    joon.setAttribute("stroke", "#2d6a4f");
    joon.setAttribute("stroke-width", "2.4");
    joon.setAttribute("stroke-linejoin", "round");
    svg.append(joon);
    punktid.forEach(([x, y], i) => {
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", x);
      c.setAttribute("cy", y);
      c.setAttribute("r", "3");
      c.setAttribute("fill", "#1e4d39");
      const t = document.createElementNS("http://www.w3.org/2000/svg", "title");
      t.textContent = `${g.sildid[i]}: ${fmtArv(g.vaartused[i])} ${g.uhik}`;
      c.append(t);
      svg.append(c);
      if (i % 2 === 0 || i === n - 1) {
        const silt = document.createElementNS("http://www.w3.org/2000/svg", "text");
        silt.setAttribute("x", x);
        silt.setAttribute("y", K - 4);
        silt.setAttribute("text-anchor", "middle");
        silt.setAttribute("font-size", "9");
        silt.setAttribute("fill", "#6b7280");
        silt.textContent = g.sildid[i];
        svg.append(silt);
      }
    });
  }

  wrapp.append(svg);
  return wrapp;
}

function luhikeSilt(s) {
  const osad = s.replace(/\(.+\)/, "").trim().split(/\s+/);
  return osad[0]?.length > 9 ? osad[0].slice(0, 8) + "…" : osad[0];
}

function fmtArv(v) {
  return Math.round(v).toLocaleString("et-EE");
}

// --- Vestluse UI ---------------------------------------------------------

function lisaSonum(klass) {
  const el = document.createElement("div");
  el.className = `sonum ${klass}`;
  const sisu = document.createElement("div");
  sisu.className = "sisu";
  el.append(sisu);
  vestlus.append(el);
  kerimineAlla();
  return { el, sisu };
}

function kerimineAlla() {
  const main = document.querySelector("main");
  main.scrollTop = main.scrollHeight;
}

async function kysi(kysimus) {
  lisaSonum("kasutaja").sisu.textContent = kysimus;

  const { el, sisu } = lisaSonum("bot");
  const staatus = document.createElement("div");
  staatus.className = "staatus";
  staatus.innerHTML =
    'Ühendan…<span class="tipikd"><i></i><i></i><i></i></span>';
  sisu.append(staatus);

  saadaNupp.disabled = true;
  sisend.disabled = true;

  let voogTekst = "";
  let voogEl = null;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kysimus, seanss: SEANSS }),
    });

    const lugeja = res.body.getReader();
    const dekooder = new TextDecoder();
    let puhver = "";

    for (;;) {
      const { done, value } = await lugeja.read();
      if (done) break;
      puhver += dekooder.decode(value, { stream: true });

      const plokid = puhver.split("\n\n");
      puhver = plokid.pop() ?? "";

      for (const plokk of plokid) {
        const syndmus = /^event:\s*(.+)$/m.exec(plokk)?.[1]?.trim();
        const andmedRida = /^data:\s*(.+)$/m.exec(plokk)?.[1];
        if (!syndmus || !andmedRida) continue;

        let d;
        try {
          d = JSON.parse(andmedRida);
        } catch {
          continue;
        }

        if (syndmus === "staatus") {
          staatus.textContent = d.sonum + "…";
          staatus.append(
            Object.assign(document.createElement("span"), {
              className: "tipikd",
              innerHTML: "<i></i><i></i><i></i>",
            }),
          );
        } else if (syndmus === "kontekst") {
          // Ütleme selgelt välja, kui vastus tugineb varasemale vestlusele
          const c = document.createElement("div");
          c.className = "kontekst";
          c.textContent = d.sonum;
          sisu.insertBefore(c, staatus);
        } else if (syndmus === "vastus") {
          staatus.remove();
          const div = document.createElement("div");
          div.innerHTML = markdown(d.tekst);
          sisu.append(div);
        } else if (syndmus === "tykk") {
          if (!voogEl) {
            staatus.remove();
            voogEl = document.createElement("div");
            sisu.append(voogEl);
          }
          voogTekst += d.tekst;
          voogEl.innerHTML = markdown(voogTekst);
        } else if (syndmus === "lopp") {
          staatus.remove();
          if (d.allikad?.length) {
            const a = document.createElement("div");
            a.className = "allikas";
            a.textContent = `Allikas: ${d.allikad.join("; ")}`;
            sisu.append(a);
          }
          if (d.graafik) {
            sisu.append(joonistaGraafik(d.graafik));
          }
          for (const h of d.hoiatused ?? []) {
            const w = document.createElement("div");
            w.className = "hoiatus";
            w.textContent = h;
            sisu.append(w);
          }
          const m = document.createElement("div");
          m.className = "meta";
          const maluOsa = d.malu?.asukoht ? ` · mälus: ${d.malu.asukoht}` : "";
          m.textContent = `${d.intent} · ruuter: ${d.ruuter} · ${d.kestusMs} ms${maluOsa}`;
          sisu.append(m);
          uuendaMaluRiba(d.malu);
        } else if (syndmus === "viga") {
          staatus.remove();
          el.classList.add("viga");
          sisu.append(
            Object.assign(document.createElement("p"), {
              textContent: `Viga: ${d.sonum}`,
            }),
          );
        }
        kerimineAlla();
      }
    }
  } catch (err) {
    staatus.remove();
    el.classList.add("viga");
    sisu.append(
      Object.assign(document.createElement("p"), {
        textContent: `Ühenduse viga: ${err.message}`,
      }),
    );
  } finally {
    saadaNupp.disabled = false;
    sisend.disabled = false;
    sisend.focus();
    kerimineAlla();
  }
}

function uuendaMaluRiba(malu) {
  const riba = document.getElementById("maluriba");
  if (!riba) return;
  const osad = [];
  if (malu?.asukoht) osad.push(`asukoht: ${malu.asukoht}`);
  if (malu?.maakond) osad.push(`maakond: ${malu.maakond}`);
  if (osad.length === 0) {
    riba.hidden = true;
    return;
  }
  riba.hidden = false;
  riba.querySelector("span").textContent = `Mäletan — ${osad.join(", ")}`;
}

document.getElementById("uus").addEventListener("click", async () => {
  await fetch("/api/uus", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seanss: SEANSS }),
  }).catch(() => {});
  vestlus.querySelectorAll(".sonum:not(:first-child)").forEach((el) => el.remove());
  uuendaMaluRiba(null);
  sisend.focus();
});

vorm.addEventListener("submit", (e) => {
  e.preventDefault();
  const v = sisend.value.trim();
  if (!v) return;
  sisend.value = "";
  kysi(v);
});

// Tervisekontroll
fetch("/api/tervis")
  .then((r) => r.json())
  .then((d) => {
    tervisDiv.textContent = d.llm?.saadaval
      ? `Töötab šabloonvastustega. Keelemudel ${d.llm.mudel} on varuvariandiks olemas.`
      : `Töötab šabloonvastustega. Keelemudel pole kasutusel (${d.llm?.pohjus ?? "-"}).`;
  })
  .catch(() => {
    tervisDiv.textContent = "";
  });

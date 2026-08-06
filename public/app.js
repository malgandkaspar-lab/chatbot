const vestlus = document.getElementById("vestlus");
const vorm = document.getElementById("vorm");
const sisend = document.getElementById("sisend");
const saadaNupp = document.getElementById("saada");
const tervisDiv = document.getElementById("tervis");
const naitedDiv = document.getElementById("naited");

const NAITED = [
  "Kas metsa raiutakse rohkem kui juurde kasvab?",
  "Kui suur osa Eestist on metsa all?",
  "Kui palju raiuti Võrumaal?",
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
  staatus.textContent = "Ühendan…";
  sisu.append(staatus);

  saadaNupp.disabled = true;
  sisend.disabled = true;

  let voogTekst = "";
  let voogEl = null;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kysimus }),
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
          staatus.textContent = d.sonum;
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
          for (const h of d.hoiatused ?? []) {
            const w = document.createElement("div");
            w.className = "hoiatus";
            w.textContent = h;
            sisu.append(w);
          }
          const m = document.createElement("div");
          m.className = "meta";
          m.textContent = `${d.intent} · ruuter: ${d.ruuter} · ${d.kestusMs} ms`;
          sisu.append(m);
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

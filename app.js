/* =======================
   Haptic Experience Study
   app.js (production-ready)
   ======================= */

let sessionId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
let language = "en";
let translations = {};

// Prevent multiple submissions
let isSubmitting = false;
let hasSubmitted = false;

const physicalDimensions = ["roughness", "hardness", "friction", "weight", "thermal", "sharpness"];
const emotionalDimensions = ["valence", "arousal"];

const objects = [
  { key: "obj1", nameKey: "objects.obj1", img: "assets/images/1_smartphone_screen.jpg" },
  { key: "obj2", nameKey: "objects.obj2", img: "assets/images/2_metal_key.jpg" },
  { key: "obj3", nameKey: "objects.obj3", img: "assets/images/3_running_shoe_sole.jpg" },
  { key: "obj4", nameKey: "objects.obj4", img: "assets/images/4_ceramic_tiles.jpg" },
  { key: "obj5", nameKey: "objects.obj5", img: "assets/images/5_tea_mug.jpg" },
  { key: "obj6", nameKey: "objects.obj6", img: "assets/images/6_wool_sweater.jpg" },
  { key: "obj7", nameKey: "objects.obj7", img: "assets/images/7_tree_bark.jpg" },
  { key: "obj8", nameKey: "objects.obj8", img: "assets/images/8_leather_jacket.jpg" },
  { key: "obj9", nameKey: "objects.obj9", img: "assets/images/9_dumbell.jpg" },
  { key: "obj10", nameKey: "objects.obj10", img: "assets/images/10_rubber_eraser.jpg" }
];

// Randomize object order per session
objects.sort(() => Math.random() - 0.5);

// Stages: 0 welcome, 1 background, 2 definitions, 3..12 cases, 13 final
const TOTAL_STAGES = 14;
let stageIndex = 0;
let caseIndex = 0;

// Production: NO test mode bypass
const TEST_MODE = false;

// ==== SUBMISSION ENDPOINT (Google Apps Script Web App /exec) ====
const SUBMIT_URL =
  "https://script.google.com/macros/s/AKfycbwQKUJRGxe_nGZCXp99DDSFEJWnVCPHfX9wReThoEBNCNyz6oZ7rhsFDvBSvgrG_C8H/exec";

const response = {
  meta: { sessionId, startedAt: new Date().toISOString(), language },
  consent: { age18: false, consent: false },
  background: {
    age: "",
    gender: "",
    country: "",
    education: "",
    materialsFamiliarity: "",
    relatedBackground: ""
  },
  cases: {},
  completedAt: null
};

function $(id){ return document.getElementById(id); }

/* ---------- i18n ---------- */

async function loadLanguage(lang){
  const res = await fetch(`i18n/${lang}.json`, { cache: "no-store" });
  translations = await res.json();
  language = lang;
  response.meta.language = lang;

  // If already submitted, keep submitted screen even when changing language
  if (hasSubmitted){
    renderSubmitted();
    return;
  }

  renderStage();
}

function t(path, fallback=""){
  const parts = path.split(".");
  let cur = translations;
  for(const p of parts){
    if(cur && Object.prototype.hasOwnProperty.call(cur, p)) cur = cur[p];
    else return fallback;
  }
  return (typeof cur === "string") ? cur : fallback;
}

/* ---------- UI helpers ---------- */

function setProgress(){
  const pct = Math.round(((stageIndex) / (TOTAL_STAGES - 1)) * 100);
  $("progressFill").style.width = `${pct}%`;
  $("progressText").innerText = `${pct}%`;
}

function scrollToTop(){
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function openDefModal(dimKey){
  const dimName = t(`dimensions.${dimKey}.label`, dimKey);
  const def = t(`dimensions.${dimKey}.definition`, "");
  const exTitle = t("definitions.exampleTitle", "Examples");
  const ex = t(`dimensions.${dimKey}.example`, "");

  $("defModalTitle").innerText = dimName;
  $("defModalDef").innerText = def;
  $("defModalExampleTitle").innerText = exTitle;
  $("defModalExampleText").innerText = ex;

  const modal = $("defModal");
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
}
function closeDefModal(){
  const modal = $("defModal");
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
}

/* ---------- Data ---------- */

function ensureCaseState(objKey){
  if(!response.cases[objKey]){
    const sliders = {};
    [...physicalDimensions, ...emotionalDimensions].forEach(dim => {
      sliders[dim] = { value: 0.5, touched: false };
    });
    response.cases[objKey] = { sliders };
  }
}

/* ---------- Navigation / rendering ---------- */

function renderStage(){
  setProgress();
  updateNavButtons();

  const card = $("stageCard");
  card.innerHTML = "";

  requestAnimationFrame(() => scrollToTop());

  if(stageIndex === 0) renderWelcome(card);
  else if(stageIndex === 1) renderBackground(card);
  else if(stageIndex === 2) renderDefinitions(card);
  else if(stageIndex >= 3 && stageIndex <= 12) renderCase(card);
  else renderFinal(card);

  updateNavButtons();
}

function showBottomNav(show){
  const nav = document.querySelector(".bottom-nav");
  if(!nav) return;
  nav.classList.toggle("hidden", !show);
}

function updateNavButtons(){
  if (hasSubmitted){
    showBottomNav(false);
    return;
  }

  if(stageIndex === 0){
    showBottomNav(false);
    return;
  }
  showBottomNav(true);

  const backBtn = $("backBtn");
  const nextBtn = $("nextBtn");

  backBtn.disabled = (stageIndex === 0) || isSubmitting;
  nextBtn.disabled = !canGoNext() || isSubmitting;

  backBtn.innerText = t("nav.back", "Back");
  nextBtn.innerText = (stageIndex === TOTAL_STAGES - 1)
    ? (isSubmitting ? t("nav.sending", "Sending...") : t("nav.finish", "Finish"))
    : t("nav.next", "Next");
}

function showRequiredHint(show){
  const el = document.querySelector(".required-hint");
  if(el) el.style.display = show ? "block" : "none";
}

function canGoNext(){
  if(TEST_MODE) return true;

  if(stageIndex === 0){
    return response.consent.age18 && response.consent.consent;
  }
  if(stageIndex === 1){
    const b = response.background;
    const ageOk = String(b.age).trim() !== "" && Number(b.age) >= 18;
    const genderOk = b.gender !== "";
    const countryOk = b.country.trim() !== "";
    const eduOk = b.education !== "";
    const famOk = b.materialsFamiliarity !== "";
    const relOk = b.relatedBackground !== "";
    return ageOk && genderOk && countryOk && eduOk && famOk && relOk;
  }
  if(stageIndex === 2) return true;

  if(stageIndex >= 3 && stageIndex <= 12){
    const obj = objects[caseIndex];
    ensureCaseState(obj.key);
    const sliders = response.cases[obj.key].sliders;
    return [...physicalDimensions, ...emotionalDimensions].every(dim => sliders[dim].touched);
  }

  return true;
}

async function goNext(){
  if (hasSubmitted) return;

  if(!canGoNext()){
    showRequiredHint(true);
    return;
  }
  showRequiredHint(false);

  if(stageIndex >= 3 && stageIndex <= 12){
    if(stageIndex < 12) caseIndex += 1;
  }

  if(stageIndex < TOTAL_STAGES - 1){
    stageIndex += 1;
    renderStage();
  }else{
    // Finish => submit responses (ONLY ONCE)
    if (isSubmitting || hasSubmitted) return;

    isSubmitting = true;
    response.completedAt = new Date().toISOString();
    updateNavButtons();

    const ok = await submitToEndpoint();

    isSubmitting = false;

    if(ok){
      hasSubmitted = true;
      renderSubmitted();
    }else{
      updateNavButtons();
      alert(t("final.sentFail", "Submission failed. Please try again or check your connection."));
      return;
    }
  }
}

function goBack(){
  if (hasSubmitted || isSubmitting) return;

  showRequiredHint(false);
  if(stageIndex === 0) return;

  if(stageIndex >= 4 && stageIndex <= 12){
    caseIndex -= 1;
  }else if(stageIndex === 3){
    caseIndex = 0;
  }

  stageIndex -= 1;
  renderStage();
}

/* ---------- Submission ---------- */

async function submitToEndpoint(){
  if(!SUBMIT_URL){
    console.warn("SUBMIT_URL is empty. No submission performed.");
    return false;
  }

  try{
    const params = new URLSearchParams();
    params.set("payload", JSON.stringify(response));

    const res = await fetch(SUBMIT_URL, {
      method: "POST",
      body: params
    });

    return res.ok;
  }catch(err){
    console.error(err);
    return false;
  }
}

/* ---------- Submitted screen ---------- */

function renderSubmitted(){
  const card = $("stageCard");
  card.innerHTML = `
    <h1 class="big-thanks">${t("final.submittedTitle", "Responses sent — thank you!")}</h1>
    <p class="muted">${t("final.submittedText", "Your responses have been successfully recorded. You may now close this tab.")}</p>
  `;
  showBottomNav(false);
  requestAnimationFrame(() => scrollToTop());
}

/* ---------- Stage renderers ---------- */

function renderWelcome(card){
  const title = t("welcome.title", "Welcome");
  const intro = t("welcome.intro", "");
  const what = t("welcome.what", "");
  const privacy = t("welcome.privacy", "");
  const ageLabel = t("welcome.ageCheck", "I confirm that I am at least 18 years old.");
  const consentLabel = t("welcome.consentCheck", "I consent to participate in this study.");
  const startLabel = t("welcome.start", "Start");

  card.innerHTML = `
    <h1>${title}</h1>
    <p class="muted">${intro}</p>

    <div class="notice">
      <p class="muted">${what}</p>
    </div>

    <div class="consent-box">
      <label class="check-row">
        <input type="checkbox" id="ageCheck" />
        <span>${ageLabel}</span>
      </label>

      <label class="check-row">
        <input type="checkbox" id="consentCheck" />
        <span>${consentLabel}</span>
      </label>

      <p class="muted small">${privacy}</p>

      <div class="required-hint">${t("validation.required", "Please complete all required fields.")}</div>

      <div class="start-wrap">
        <button id="startBtn" class="start-btn" disabled>${startLabel}</button>
      </div>
    </div>
  `;

  const ageCheck = $("ageCheck");
  const consentCheck = $("consentCheck");
  const startBtn = $("startBtn");

  ageCheck.checked = response.consent.age18;
  consentCheck.checked = response.consent.consent;

  function sync(){
    response.consent.age18 = ageCheck.checked;
    response.consent.consent = consentCheck.checked;
    startBtn.disabled = !canGoNext();
  }

  ageCheck.addEventListener("change", sync);
  consentCheck.addEventListener("change", sync);

  startBtn.addEventListener("click", async () => {
    if(!canGoNext()){
      showRequiredHint(true);
      return;
    }
    showRequiredHint(false);
    await goNext();
  });

  sync();
}

function renderBackground(card){
  card.innerHTML = `
    <h1>${t("background.title", "Background information")}</h1>
    <p class="muted">${t("background.intro", "")}</p>

    <div class="form">
      <div class="field">
        <label>${t("background.age", "Age")} *</label>
        <input id="bgAge" type="number" min="18" step="1" placeholder="18" />
      </div>

      <div class="field">
        <label>${t("background.gender", "Gender")} *</label>
        <select id="bgGender">
          <option value="">${t("common.select", "Select")}</option>
          <option value="female">${t("background.genderOptions.female","Female")}</option>
          <option value="male">${t("background.genderOptions.male","Male")}</option>
          <option value="nonbinary">${t("background.genderOptions.nonbinary","Non-binary")}</option>
          <option value="prefer_not">${t("background.genderOptions.prefer_not","Prefer not to say")}</option>
          <option value="other">${t("background.genderOptions.other","Other")}</option>
        </select>
      </div>

      <div class="field">
        <label>${t("background.country", "Country of residence")} *</label>
        <input id="bgCountry" type="text" placeholder="${t("background.countryPlaceholder","e.g., Italy")}" />
      </div>

      <hr class="sep" />

      <div class="field">
        <label>${t("background.educationQ", "What is your highest completed level of education?")} *</label>
        <select id="bgEducation">
          <option value="">${t("common.select", "Select")}</option>
        </select>
      </div>

      <div class="field">
        <label>${t("background.familiarityQ", "How familiar are you with materials?")} *</label>
        <select id="bgFamiliarity">
          <option value="">${t("common.select", "Select")}</option>
        </select>
      </div>

      <div class="field">
        <label>${t("background.relatedQ", "Do you have any background or experience in design, materials, engineering, or related fields?")} *</label>
        <select id="bgRelated">
          <option value="">${t("common.select", "Select")}</option>
        </select>
      </div>

      <div class="required-hint">${t("validation.required", "Please complete all required fields.")}</div>
    </div>
  `;

  const eduOptions = translations.background?.educationOptions || {};
  const famOptions = translations.background?.familiarityOptions || {};
  const relOptions = translations.background?.relatedOptions || {};

  $("bgAge").value = response.background.age;
  $("bgGender").value = response.background.gender;
  $("bgCountry").value = response.background.country;

  const eduSel = $("bgEducation");
  eduSel.innerHTML += Object.entries(eduOptions)
    .map(([k, label]) => `<option value="${k}">${label}</option>`).join("");
  eduSel.value = response.background.education;

  const famSel = $("bgFamiliarity");
  famSel.innerHTML += Object.entries(famOptions)
    .map(([k, label]) => `<option value="${k}">${label}</option>`).join("");
  famSel.value = response.background.materialsFamiliarity;

  const relSel = $("bgRelated");
  relSel.innerHTML += Object.entries(relOptions)
    .map(([k, label]) => `<option value="${k}">${label}</option>`).join("");
  relSel.value = response.background.relatedBackground;

  function sync(){
    response.background.age = $("bgAge").value;
    response.background.gender = $("bgGender").value;
    response.background.country = $("bgCountry").value;
    response.background.education = $("bgEducation").value;
    response.background.materialsFamiliarity = $("bgFamiliarity").value;
    response.background.relatedBackground = $("bgRelated").value;
    updateNavButtons();
  }

  ["bgAge","bgGender","bgCountry","bgEducation","bgFamiliarity","bgRelated"].forEach(id => {
    const el = $(id);
    el.addEventListener("input", sync);
    el.addEventListener("change", sync);
  });

  sync();
}

function renderDefinitions(card){
  const dims = [...physicalDimensions, ...emotionalDimensions];

  card.innerHTML = `
    <h1>${t("definitions.title", "Definitions")}</h1>
    <p class="muted">${t("definitions.intro", "")}</p>
    <div class="notice">
      <p class="muted">${t("definitions.howToUse", "")}</p>
    </div>

    <div class="def-grid">
      ${dims.map(dim => {
        const label = t(`dimensions.${dim}.label`, dim);
        const def = t(`dimensions.${dim}.definition`, "");
        const ex = t(`dimensions.${dim}.example`, "");
        return `
          <div class="def-card">
            <div class="def-head">
              <div class="def-title">${label}</div>
            </div>
            <p class="muted small">${def}</p>
            <div class="def-example">
              <div class="small" style="font-weight:800;">${t("definitions.exampleTitle","Examples")}</div>
              <div class="muted small">${ex}</div>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function sliderRow(dim, objKey){
  const label = t(`dimensions.${dim}.label`, dim);
  const low = t("scale.low", "low");
  const high = t("scale.high", "high");

  const state = response.cases[objKey].sliders[dim];
  const untouchedClass = state.touched ? "dim-touched" : "dim-untouched";

  return `
    <div class="slider-row ${untouchedClass}">
      <div class="slider-top">
        <div class="slider-label">
          <span>${label}</span>
          <span class="info-dot" role="button" tabindex="0" data-def="${dim}">?</span>
        </div>
      </div>

      <div class="scale-extremes">
        <div class="left"><strong>0</strong><span>${low}</span></div>
        <div class="right"><span>${high}</span><strong>1</strong></div>
      </div>

      <input type="range" min="0" max="1" step="0.01" value="${state.value}" data-dim="${dim}" />
    </div>
  `;
}

function renderCase(card){
  const obj = objects[caseIndex];
  ensureCaseState(obj.key);

  card.innerHTML = `
    <div class="object-card">
      <h1>${t("case.title", "Case study")} ${caseIndex + 1}/10</h1>
      <p class="muted">${t("case.subtitle", "")}</p>

      <div class="notice">
        <div class="muted small">${t("case.instruction","Move each slider at least once. All answers are required.")}</div>
      </div>

      <div class="card object-card" style="box-shadow:none; border:1px solid var(--line);">
        <h2>${t(obj.nameKey, "Object")}</h2>
        <img class="object-image" src="${obj.img}" alt="${t(obj.nameKey, "Object")}" />
      </div>

      <div class="section" style="text-align:left;">
        <h3>${t("case.physicalTitle", "Physical Properties")}</h3>
        ${physicalDimensions.map(dim => sliderRow(dim, obj.key)).join("")}
      </div>

      <div class="section" style="text-align:left;">
        <h3>${t("case.emotionalTitle", "Emotional Reactions")}</h3>
        ${emotionalDimensions.map(dim => sliderRow(dim, obj.key)).join("")}
      </div>

      <div class="required-hint">${t("validation.slidersRequired", "Please move every slider at least once.")}</div>
    </div>
  `;

  card.querySelectorAll("input[type='range']").forEach(r => {
    const dim = r.getAttribute("data-dim");
    r.addEventListener("input", () => {
      response.cases[obj.key].sliders[dim].value = Number(r.value);
      response.cases[obj.key].sliders[dim].touched = true;

      const row = r.closest(".slider-row");
      if(row){
        row.classList.remove("dim-untouched");
        row.classList.add("dim-touched");
      }
      updateNavButtons();
    });
  });

  // Tooltip (?) on sliders only
  card.querySelectorAll("[data-def]").forEach(el => {
    el.addEventListener("click", () => openDefModal(el.getAttribute("data-def")));
    el.addEventListener("keydown", (e) => {
      if(e.key === "Enter" || e.key === " ") openDefModal(el.getAttribute("data-def"));
    });
  });

  updateNavButtons();
}

function renderFinal(card){
  card.innerHTML = `
    <h1 class="big-thanks">${t("final.thanksTitle", "Thank you!")}</h1>
    <p class="muted">${t("final.thanksText", "Your answers are valuable for our research.")}</p>

    <div class="notice">
      <p class="muted">${t("final.instructions", "Click Finish to submit your responses, or Back to review and change your answers.")}</p>
    </div>
  `;
}

/* ---------- Wire up global UI ---------- */

$("languageSwitcher").addEventListener("change", e => loadLanguage(e.target.value));
$("backBtn").addEventListener("click", goBack);
$("nextBtn").addEventListener("click", () => { goNext(); });

$("defModalClose").addEventListener("click", closeDefModal);
$("defModalBackdrop").addEventListener("click", closeDefModal);
document.addEventListener("keydown", (e) => {
  if(e.key === "Escape") closeDefModal();
});

// Init
loadLanguage("en").then(() => renderStage());
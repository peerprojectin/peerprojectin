const API = "https://twqeocprtqcnpvsgxicw.supabase.co/functions/v1";

const TRACKS = {
  boards: "Boards",
  jee: "JEE",
  neet: "NEET",
  cuet: "CUET",
  clat_ipmat: "CLAT / IPMAT",
  iat: "IAT (IISER)",
  abroad: "Studying abroad",
  other: "Something else",
};

const SUBJECTS = new Set([
  "english", "physics", "chemistry", "mathematics", "biology", "computer_science", "accountancy",
  "business_studies", "economics", "history", "political_science", "geography", "psychology",
]);

const ERRORS = {
  applications_closed: "Applications aren't open right now.",
  already_exists: "There's already an application with this email or Discord username for this cohort.",
  captcha_missing: "Please complete the check above the submit button.",
  captcha_failed: "The bot check didn't go through. Please try it again.",
  invalid_email: "That email address doesn't look right.",
  invalid_input: "Something in the form isn't filled in correctly. Check the highlighted fields and try again.",
  help_area_track: "One of your \"where, specifically\" choices doesn't match a field you picked.",
  proof_missing: "Please attach your proof of eligibility.",
  proof_too_large: "Your proof file is over 5 MB. Please upload a smaller one.",
  proof_type: "Your proof needs to be a PDF, PNG or JPG file.",
  mail_failed: "We couldn't send the email just now. Please try again in a minute.",
  email_limit: "This link has already been emailed 3 times, which is the limit.",
};

const form = document.querySelector("[data-apply]");
const kind = form.dataset.apply;
const closedPanel = document.querySelector("[data-closed]");
const errorBox = form.querySelector("[data-error]");
const submitButton = form.querySelector("[type=submit]");
const helpAreaContainer = form.querySelector("[data-help-areas]");

let helpAreaOptions = {};

function istDate(value) {
  return new Date(value).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" });
}

function el(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

function checked(name) {
  return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
}

function value(name) {
  return form.elements[name]?.value.trim() ?? "";
}

function show(selector, visible) {
  for (const node of form.querySelectorAll(selector)) node.hidden = !visible;
}

function syncDisabled() {
  for (const input of form.querySelectorAll("[data-when] input, [data-when] select, [data-when] textarea")) {
    input.disabled = Boolean(input.closest("[hidden]"));
  }
}

function updateConditionals() {
  const board = value("board");
  show("[data-when=board-other]", board === "other");
  show("[data-when=subjects-other]", checked("subjects").includes("__other"));
  show("[data-when=language-other]", checked("language_preferences").includes("other"));
  show("[data-when=availability-other]", value("availability") === "flexible");

  if (kind === "mentee") {
    const level = value("class_level");
    show("[data-when=senior]", ["11", "12", "gap_year"].includes(level));
  }

  if (kind === "mentor") {
    show("[data-when=abroad]", checked("tracks").includes("abroad"));
  }

  syncDisabled();
}

function boardAreas(options) {
  if (kind !== "mentee") return options;
  const picked = new Set(checked("subjects"));
  if (picked.size === 0 || form.querySelector("[data-when=senior]")?.hidden) return options;
  return options.filter(({ area }) => !SUBJECTS.has(area) || picked.has(area));
}

const groups = new Map();

function choiceNodes(track, options, previous) {
  return options.map(({ area, label }) => {
    const id = `area-${track}-${area}`;
    const input = el("input", { type: "checkbox", name: "help_area", value: `${track}:${area}`, id });
    input.checked = previous.has(`${track}:${area}`) || (track === "other" && area === "other");
    return el("label", { class: "choice", for: id }, [input, label]);
  });
}

function createGroup(track) {
  const choices = el("div", { class: "choices" });
  const otherInput = el("input", {
    type: "text",
    class: "other-input",
    "data-other-for": track,
    maxlength: "200",
    placeholder: track === "other" ? "Which field?" : "What else?",
  });
  const node = el("fieldset", { class: "help-area-group" }, [
    el("legend", { text: `${TRACKS[track]}: ${form.dataset.areaPrompt ?? "where, specifically?"}` }),
    choices,
    otherInput,
  ]);
  const syncOther = () => {
    const on = checked("help_area").includes(`${track}:other`);
    otherInput.hidden = !on;
    otherInput.required = on;
  };
  choices.addEventListener("change", syncOther);
  return { node, choices, syncOther, signature: null };
}

function renderHelpAreas() {
  const previous = new Set(checked("help_area"));
  const tracks = Object.keys(TRACKS).filter((track) => checked("tracks").includes(track));

  for (const [track, group] of groups) {
    if (!tracks.includes(track)) {
      group.node.remove();
      groups.delete(track);
    }
  }

  let anchor = null;
  for (const track of tracks) {
    const group = groups.get(track) ?? createGroup(track);
    groups.set(track, group);

    let options = helpAreaOptions[track] ?? [];
    if (track === "boards") options = boardAreas(options);
    const signature = options.map(({ area }) => area).join();
    if (group.signature !== signature) {
      group.choices.replaceChildren(...choiceNodes(track, options, previous));
      group.signature = signature;
      group.syncOther();
    }

    const expected = anchor ? anchor.nextSibling : helpAreaContainer.firstChild;
    if (expected !== group.node) helpAreaContainer.insertBefore(group.node, expected);
    anchor = group.node;
  }

  helpAreaContainer.closest(".field").hidden = tracks.length === 0;
}

function collect() {
  const application = {};
  for (const input of form.querySelectorAll("[name]")) {
    if (input.disabled || input.closest("[hidden]") || input.type === "file") continue;
    const name = input.name;
    if (name === "help_area" || name.startsWith("cf-")) continue;
    if (input.type === "checkbox" && input.dataset.bool !== undefined) {
      application[name] = input.checked;
    } else if (input.type === "checkbox") {
      application[name] ??= [];
      if (input.checked && input.value !== "__other") application[name].push(input.value);
    } else if (input.type === "radio") {
      if (input.checked) application[name] = input.value;
    } else if (name === "other_profiles") {
      application[name] ??= [];
      if (input.value.trim()) application[name].push(input.value.trim());
    } else {
      application[name] = input.type === "number" ? Number(input.value) : input.value.trim();
    }
  }

  if (kind === "mentee") application.has_guardian_consent = application.has_data_consent;

  application.help_areas = checked("help_area").map((pair) => {
    const [track, area] = pair.split(":");
    const other = helpAreaContainer.querySelector(`input[data-other-for="${track}"]`);
    return { track, area, area_other: area === "other" ? other.value.trim() : "" };
  });
  return application;
}

function validate() {
  const problems = [];
  if (checked("tracks").length === 0) problems.push("Pick at least one field.");
  for (const track of checked("tracks")) {
    if (!checked("help_area").some((pair) => pair.startsWith(`${track}:`))) {
      problems.push(`Pick at least one option for ${TRACKS[track]}.`);
    }
  }
  if (kind === "mentor" && checked("mentee_levels").length === 0) problems.push("Pick the classes you can mentor.");
  if (checked("language_preferences").length === 0) problems.push("Pick at least one language.");
  const subjectsBlock = form.querySelector("[data-subjects]");
  if (subjectsBlock && !subjectsBlock.hidden && checked("subjects").length === 0) {
    problems.push("Pick your subjects.");
  }
  const proof = form.querySelector("input[type=file]");
  if (proof) {
    const file = proof.files[0];
    if (!file) problems.push("Attach your proof of eligibility.");
    else if (file.size > 5 * 1024 * 1024) problems.push(ERRORS.proof_too_large);
    else if (!["application/pdf", "image/png", "image/jpeg"].includes(file.type)) problems.push(ERRORS.proof_type);
  }
  return problems;
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
  errorBox.scrollIntoView({ behavior: "smooth", block: "center" });
}

function done(panel) {
  form.hidden = true;
  document.querySelector("[data-intro]")?.setAttribute("hidden", "");
  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function mentorDone(result) {
  const panel = document.querySelector("[data-done]");
  const link = `${location.origin}/questionnaire#${result.questionnaire_token}`;
  panel.querySelector("[data-questionnaire-link]").href = link;
  panel.querySelector("[data-link-text]").textContent = link;
  panel.querySelector("[data-expires]").textContent = new Date(result.questionnaire_expires_at).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  });

  const mailButton = panel.querySelector("[data-mail]");
  const mailStatus = panel.querySelector("[data-mail-status]");
  mailButton.addEventListener("click", async () => {
    mailButton.disabled = true;
    mailStatus.textContent = "Sending...";
    try {
      const response = await fetch(`${API}/questionnaire/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: result.questionnaire_token }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      mailStatus.textContent = `Sent to ${value("email")}. Check your spam folder if it isn't in your inbox.`;
      mailButton.disabled = body.emails_left <= 0;
    } catch (error) {
      mailStatus.textContent = ERRORS[error.message] ?? "We couldn't send it just now. Please try again.";
      mailButton.disabled = false;
    }
  });
  done(panel);
}

async function submit(event) {
  event.preventDefault();
  errorBox.hidden = true;

  const problems = validate();
  if (problems.length) return showError(problems.join(" "));
  if (!form.reportValidity()) return;

  const data = new FormData();
  data.set("application", JSON.stringify(collect()));
  data.set("cf-turnstile-response", form.querySelector("[name=cf-turnstile-response]")?.value ?? "");
  const proof = form.querySelector("input[type=file]");
  if (proof?.files[0]) data.set("proof", proof.files[0]);

  submitButton.disabled = true;
  submitButton.textContent = "submitting...";
  try {
    const headers = {};
    try {
      const testKey = localStorage.getItem("tpp:test-key");
      if (testKey) headers["x-test-key"] = testKey;
    } catch {}
    const response = await fetch(`${API}/apply/${kind}`, { method: "POST", body: data, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? "network");
    if (kind === "mentor") mentorDone(body);
    else {
      document.querySelector("[data-done-email]").textContent = value("email");
      done(document.querySelector("[data-done]"));
    }
  } catch (error) {
    showError(ERRORS[error.message] ?? "Something went wrong on our side. Please try again in a few minutes.");
    window.turnstile?.reset();
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "submit";
  }
}

async function start() {
  let overview;
  try {
    const response = await fetch(`${API}/apply`);
    overview = await response.json();
  } catch {
    document.querySelector("[data-loading]")?.remove();
    closedPanel.querySelector("[data-closed-text]").textContent =
      "We couldn't load the form just now. Please refresh the page in a minute.";
    closedPanel.hidden = false;
    return;
  }

  document.querySelector("[data-loading]")?.remove();
  helpAreaOptions = overview.help_areas ?? {};
  const window_ = overview.cohort?.[kind];
  const preview = location.hash === "#preview";

  if (!window_?.open && !preview) {
    const text = closedPanel.querySelector("[data-closed-text]");
    if (window_?.opens_at && new Date(window_.opens_at) > new Date()) {
      text.textContent = `Applications open on ${istDate(window_.opens_at)}. Come back then.`;
    } else {
      text.textContent = "Applications are closed. We'll announce the next cohort on this site and on our subreddits.";
    }
    closedPanel.hidden = false;
    return;
  }

  if (window_?.closes_at) {
    form.querySelector("[data-closes]")?.replaceChildren(`Applications close on ${istDate(window_.closes_at)}.`);
  }

  form.hidden = false;
  form.querySelectorAll("select").forEach(enhanceSelect);
  form.querySelectorAll("input[type=number]").forEach(enhanceNumber);
  form.querySelectorAll("input[type=file]").forEach(enhanceFile);
  updateConditionals();
  renderHelpAreas();
  form.addEventListener("change", (event) => {
    updateConditionals();
    if (["tracks", "subjects", "class_level"].includes(event.target.name)) renderHelpAreas();
  });
  form.addEventListener("submit", submit);
}

start();

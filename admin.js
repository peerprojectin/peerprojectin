const SUPABASE_URL = "https://twqeocprtqcnpvsgxicw.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_jmtD857jKWurss5pEask4g_Hj45AGqp";
const API = `${SUPABASE_URL}/functions/v1/admin`;
const SESSION_KEY = "tpp:admin:session";

const LABELS = {
  boards: "Boards", jee: "JEE", neet: "NEET", cuet: "CUET", clat_ipmat: "CLAT / IPMAT", iat: "IAT (IISER)",
  abroad: "Studying abroad", other: "Other", gap_year: "Gap-year / dropper", "1_2": "1 to 2 a month",
  "3_4": "3 to 4 a month", flexible: "Flexible", cbse: "CBSE", icse_isc: "ICSE / ISC", state: "State board",
  ib: "IB", cambridge: "Cambridge",
};

const STATUSES = {
  mentors: ["pending", "shortlisted", "accepted", "rejected", "withdrawn"],
  mentees: ["pending", "accepted", "waitlisted", "rejected", "withdrawn"],
};
const EMAILED = new Set(["accepted", "rejected", "waitlisted"]);
const SCORES = ["empathy", "boundaries", "practicality", "honesty"];

const view = document.querySelector("[data-view]");
const errorBox = document.querySelector("[data-error]");
let session = null;
let me = null;
let cohorts = [];
let cohortId = null;

function el(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  node.append(...children.filter((child) => child !== null && child !== undefined));
  return node;
}

function label(value) {
  if (Array.isArray(value)) return value.length ? value.map(label).join(", ") : "-";
  if (value === null || value === undefined || value === "") return "-";
  return LABELS[value] ?? String(value).replace(/_/g, " ");
}

function istDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function toLocalInput(value) {
  if (!value) return "";
  const ist = new Date(new Date(value).getTime() + 330 * 60000);
  return ist.toISOString().slice(0, 16);
}

function fromLocalInput(value) {
  return value ? new Date(`${value}:00+05:30`).toISOString() : null;
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = !message;
  if (message) errorBox.scrollIntoView({ behavior: "smooth", block: "center" });
}

function toast(message) {
  const note = el("div", { class: "admin-toast", text: message });
  document.body.append(note);
  setTimeout(() => note.remove(), 2500);
}

function act(handler) {
  return async (event) => {
    try {
      await handler(event);
    } catch (error) {
      showError(error.message);
    }
  };
}

function storeSession(value) {
  session = value;
  try {
    if (value) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

function restoreSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null");
  } catch {
    return null;
  }
}

async function auth(grant, body) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
    method: "POST",
    headers: { apikey: PUBLISHABLE_KEY, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description ?? data.msg ?? "Your session ended. Sign in again.");
  return { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at };
}

async function token() {
  if (session && session.expires_at - 60 < Date.now() / 1000) {
    storeSession(await auth("refresh_token", { refresh_token: session.refresh_token }));
  }
  return session?.access_token;
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${await token()}`,
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    signOut();
    throw new Error("Your session ended. Sign in again.");
  }
  if (!response.ok) throw new Error(data.error ?? `request failed (${response.status})`);
  return data;
}

function signOut() {
  if (session) {
    fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: PUBLISHABLE_KEY, authorization: `Bearer ${session.access_token}` },
    }).catch(() => {});
  }
  storeSession(null);
  me = null;
  document.querySelector("[data-app]").hidden = true;
  document.querySelector("[data-login]").hidden = false;
}

function select(name, options, current, onchange) {
  const node = el("select", { id: `${name}-${Math.random().toString(36).slice(2, 8)}`, name, onchange });
  for (const [value, text] of options) {
    const option = el("option", { value, text });
    if (String(value) === String(current ?? "")) option.selected = true;
    node.append(option);
  }
  return node;
}

function mount(...nodes) {
  view.replaceChildren(...nodes);
  view.querySelectorAll("select").forEach(enhanceSelect);
}

function cohortPicker() {
  return el("div", { class: "field admin-cohort" }, [
    el("label", { text: "Cohort" }),
    select("cohort", cohorts.map((c) => [c.id, c.name]), cohortId, (event) => {
      cohortId = Number(event.target.value);
      route();
    }),
  ]);
}

async function listView(kind) {
  const status = new URLSearchParams(location.hash.split("?")[1] ?? "").get("status") ?? "";
  const query = new URLSearchParams({ cohort_id: cohortId });
  if (status) query.set("status", status);
  const rows = await api(`/${kind}?${query}`);

  const filter = select("status", [["", "all statuses"], ...STATUSES[kind].map((s) => [s, s])], status, (event) => {
    location.hash = event.target.value ? `${kind}?status=${event.target.value}` : kind;
  });

  const head = kind === "mentors"
    ? ["name", "status", "doing now", "classes", "fields", "takes", "questionnaire", "applied"]
    : ["name", "status", "age", "class", "fields", "applied"];

  const body = rows.map((row) => {
    const cells = kind === "mentors"
      ? [
        row.display_name, row.status, row.current_status, label(row.mentee_levels), label(row.tracks),
        row.mentor_capacity, row.questionnaire_invites?.submitted_at ? "done" : row.questionnaire_invites?.started_at ? "started" : "not started",
        istDate(row.created_at),
      ]
      : [row.display_name, row.status, row.age, label(row.class_level), label(row.tracks), istDate(row.created_at)];
    return el("tr", { onclick: () => (location.hash = `${kind}/${row.id}`) }, cells.map((cell) => el("td", { text: cell ?? "-" })));
  });

  mount(
    el("div", { class: "admin-filters" }, [cohortPicker(), el("div", { class: "field" }, [el("label", { text: "Status" }), filter])]),
    el("p", { class: "admin-count", text: `${rows.length} ${kind}` }),
    rows.length
      ? el("div", { class: "admin-table-wrap" }, [
        el("table", { class: "admin-table" }, [
          el("thead", {}, [el("tr", {}, head.map((h) => el("th", { text: h })))]),
          el("tbody", {}, body),
        ]),
      ])
      : el("p", { class: "admin-empty", text: "Nothing here yet." }),
  );
}

function facts(pairs) {
  return el("dl", { class: "admin-facts" }, pairs.flatMap(([key, value]) => [
    el("dt", { text: key }),
    el("dd", { text: value === null || value === undefined || value === "" ? "-" : String(value) }),
  ]));
}

function helpAreas(rows) {
  if (!rows?.length) return "-";
  return rows.map((row) => `${label(row.track)}: ${label(row.area)}${row.area_other ? ` (${row.area_other})` : ""}`).join("\n");
}

function statusControls(kind, row) {
  const box = el("div", { class: "admin-actions" });
  for (const status of STATUSES[kind]) {
    if (status === row.status) continue;
    box.append(el("button", {
      type: "button",
      class: "secondary-button",
      text: status,
      disabled: me.role !== "admin",
      onclick: act(async () => {
        const emailed = EMAILED.has(status);
        const proofNote = kind === "mentors" && ["accepted", "rejected", "withdrawn"].includes(status) ? " Their proof of eligibility will be deleted." : "";
        const message = emailed
          ? `Mark ${row.display_name} as ${status}? This emails them now.${proofNote}`
          : `Mark ${row.display_name} as ${status}?${proofNote}`;
        if (!confirm(message)) return;
        const result = await api(`/${kind}/${row.id}/status`, { method: "POST", body: JSON.stringify({ status }) });
        await route();
        toast(result.emailed ? `Marked ${status}, email sent` : `Marked ${status}`);
      }),
    }));
  }
  return box;
}

function verifyControl(kind, row) {
  return el("button", {
    type: "button",
    class: "secondary-button",
    text: row.is_verified ? "mark unverified" : "mark verified",
    disabled: me.role !== "admin",
    onclick: act(async () => {
      await api(`/${kind}/${row.id}/verified`, { method: "POST", body: JSON.stringify({ is_verified: !row.is_verified }) });
      route();
    }),
  });
}

function reviewForm(row) {
  const mine = row.mentor_reviews?.find((review) => review.reviewer_id === me.id) ?? {};
  const form = el("form", { class: "apply-form admin-review" });
  for (const score of SCORES) {
    form.append(el("fieldset", { class: "field" }, [
      el("legend", { text: score }),
      el("div", { class: "choices admin-scores" }, [1, 2, 3, 4, 5].map((n) => el("label", { class: "choice" }, [
        el("input", { type: "radio", name: score, value: n, checked: mine[score] === n }),
        String(n),
      ]))),
    ]));
  }
  const notes = el("textarea", { name: "notes", maxlength: "4000" });
  notes.value = mine.notes ?? "";
  form.append(
    el("div", { class: "field" }, [el("label", { text: "notes" }), notes]),
    el("fieldset", { class: "field" }, [
      el("legend", { text: "your call" }),
      el("div", { class: "choices" }, ["shortlist", "follow_up", "reject"].map((decision) => el("label", { class: "choice" }, [
        el("input", { type: "radio", name: "decision", value: decision, checked: mine.decision === decision, required: true }),
        label(decision),
      ]))),
    ]),
    el("div", { class: "form-actions" }, [el("button", { type: "submit", class: "submit-button", text: "save review" })]),
  );
  form.addEventListener("submit", act(async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    if (!data.get("decision")) return showError("Pick shortlist, follow up or reject before saving.");
    const body = { notes: data.get("notes") || null, decision: data.get("decision") };
    for (const score of SCORES) body[score] = data.get(score) ? Number(data.get(score)) : null;
    await api(`/mentors/${row.id}/review`, { method: "PUT", body: JSON.stringify(body) });
    await route();
    toast("Review saved");
  }));
  return form;
}

async function detailView(kind, id) {
  const row = await api(`/${kind}/${id}`);
  const nodes = [
    el("a", { href: `#${kind}`, class: "bracket-link admin-back", text: `[back to ${kind}]` }),
    el("h2", { class: "guide-heads", text: row.display_name }),
    el("p", { class: "admin-status", text: `${row.status}${row.is_verified ? ", verified" : ""}${row.decided_at ? `, decided ${istDate(row.decided_at)}` : ""}` }),
    el("div", { class: "admin-actions" }, [verifyControl(kind, row)]),
    statusControls(kind, row),
  ];

  if (kind === "mentees") {
    nodes.push(facts([
      ["age", row.age], ["class", label(row.class_level)], ["board", row.board_other ?? label(row.board)],
      ["subjects", [label(row.subjects), row.subjects_other].filter((x) => x && x !== "-").join(", ")],
      ["fields", label(row.tracks)], ["specifically", helpAreas(row.mentee_help_areas)], ["exam year", row.target_year],
      ["needs help with", row.help_in], ["check-ins", `${label(row.availability)}${row.availability_other ? ` (${row.availability_other})` : ""}`],
      ["languages", [label(row.language_preferences), row.language_other].filter((x) => x && x !== "-").join(", ")],
      ["discord", row.discord_username], ["email", row.email], ["reddit", row.reddit_username],
      ["heard from", label(row.heard_from)], ["returning", row.is_returning ? "yes" : "no"], ["anything else", row.additional_info],
      ["applied", istDate(row.created_at)],
    ]));
  } else {
    const proofButton = el("button", {
      type: "button",
      class: "secondary-button",
      text: row.has_proof ? "open proof (60s link, logged)" : row.proof_deleted_at ? "proof deleted" : "no proof",
      disabled: !row.has_proof || me.role !== "admin",
      onclick: act(async () => {
        const tab = window.open("about:blank", "_blank");
        if (tab) tab.opener = null;
        try {
          const { url } = await api(`/mentors/${row.id}/proof`);
          if (tab) tab.location.replace(url);
          else location.assign(url);
        } catch (error) {
          tab?.close();
          throw error;
        }
      }),
    });
    const invite = row.questionnaire_invites;
    nodes.push(
      el("div", { class: "admin-actions" }, [proofButton]),
      facts([
        ["doing now", row.current_status], ["board", row.board_other ?? label(row.board)],
        ["subjects", [label(row.subjects), row.subjects_other].filter((x) => x && x !== "-").join(", ")],
        ["classes", label(row.mentee_levels)], ["fields", label(row.tracks)], ["specifically", helpAreas(row.mentor_help_areas)],
        ["results", row.exam_results], ["abroad", row.abroad_details],
        ["check-ins", `${label(row.availability)}${row.availability_other ? ` (${row.availability_other})` : ""}`],
        ["takes", row.mentor_capacity],
        ["languages", [label(row.language_preferences), row.language_other].filter((x) => x && x !== "-").join(", ")],
        ["discord", row.discord_username], ["email", row.email], ["reddit", row.reddit_username],
        ["profiles", row.other_profiles?.join("\n")], ["heard from", label(row.heard_from)],
        ["returning", row.is_returning ? "yes" : "no"], ["anything else", row.additional_info],
        ["applied", istDate(row.created_at)],
        ["questionnaire", invite?.submitted_at ? `submitted ${istDate(invite.submitted_at)}` : invite?.started_at ? `opened, link expires ${istDate(invite.expires_at)}` : `not opened, link expires ${istDate(invite?.expires_at)}`],
      ]),
      el("h2", { class: "guide-heads", text: "Questionnaire" }),
      ...(row.questionnaire_answers?.length
        ? row.questionnaire_answers.map((a) => el("div", { class: "admin-answer" }, [
          el("p", { class: "admin-prompt", text: `${a.questionnaire_questions.position}. ${a.questionnaire_questions.prompt}` }),
          el("p", { class: "admin-reply", text: a.answer }),
        ]))
        : [el("p", { class: "admin-empty", text: "No answers yet." })]),
      el("h2", { class: "guide-heads", text: "Reviews" }),
      ...(row.mentor_reviews?.length
        ? row.mentor_reviews.map((r) => el("p", {
          class: "admin-review-line",
          text: `${r.admins?.display_name ?? "someone"}: ${label(r.decision)} | ${SCORES.map((s) => `${s} ${r[s] ?? "-"}`).join(", ")}${r.notes ? ` | ${r.notes}` : ""}`,
        }))
        : [el("p", { class: "admin-empty", text: "No reviews yet." })]),
      el("h3", { text: "Your review" }),
      reviewForm(row),
    );
  }
  mount(...nodes);
}

async function matchesView() {
  const [rows, mentees, mentors] = await Promise.all([
    api(`/assignments?cohort_id=${cohortId}`),
    api(`/mentees?cohort_id=${cohortId}&status=accepted`),
    api(`/mentors?cohort_id=${cohortId}&status=accepted`),
  ]);
  const live = new Set(rows.filter((r) => ["pending", "active"].includes(r.status)).map((r) => r.mentee_id));
  const load = {};
  for (const r of rows) if (["pending", "active"].includes(r.status)) load[r.mentor_id] = (load[r.mentor_id] ?? 0) + 1;

  const menteeSelect = select("mentee", [["", "pick a mentee"], ...mentees.filter((m) => !live.has(m.id)).map((m) => [m.id, `${m.display_name} - class ${label(m.class_level)}, ${label(m.tracks)}`])]);
  const mentorSelect = select("mentor", [["", "pick a mentor"], ...mentors.map((m) => [m.id, `${m.display_name} - ${load[m.id] ?? 0} of ${m.mentor_capacity} mentees taken, mentors class ${label(m.mentee_levels)}`])]);

  const create = el("form", { class: "apply-form admin-match-form" }, [
    el("div", { class: "field" }, [el("label", { text: "Mentee" }), menteeSelect]),
    el("div", { class: "field" }, [el("label", { text: "Mentor" }), mentorSelect]),
    el("div", { class: "form-actions" }, [el("button", { type: "submit", class: "submit-button", text: "pair them", disabled: me.role !== "admin" })]),
  ]);
  create.addEventListener("submit", act(async (event) => {
    event.preventDefault();
    if (!menteeSelect.value || !mentorSelect.value) return showError("Pick both a mentee and a mentor.");
    await api("/assignments", { method: "POST", body: JSON.stringify({ mentee_id: Number(menteeSelect.value), mentor_id: Number(mentorSelect.value) }) });
    route();
  }));

  const table = rows.length
    ? el("div", { class: "admin-table-wrap" }, [el("table", { class: "admin-table" }, [
      el("thead", {}, [el("tr", {}, ["mentee", "mentor", "status", "confidence", "reason", "change to"].map((h) => el("th", { text: h })))]),
      el("tbody", {}, rows.map((r) => el("tr", {}, [
        el("td", { text: r.mentees?.display_name }),
        el("td", { text: r.mentors?.display_name }),
        el("td", { text: r.status }),
        el("td", { text: r.confidence_score === null ? "-" : r.confidence_score.toFixed(2) }),
        el("td", { text: r.reason ?? "-" }),
        el("td", { class: "admin-row-actions" }, ["pending", "active", "completed", "cancelled"].filter((s) => s !== r.status).map((status) => el("button", {
          type: "button",
          class: "mini-button",
          text: status,
          disabled: me.role !== "admin",
          onclick: act(async (event) => {
            event.stopPropagation();
            await api(`/assignments/${r.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
            await route();
            toast(`Match marked ${status}`);
          }),
        }))),
      ]))),
    ])])
    : el("p", { class: "admin-empty", text: "No matches yet." });

  mount(el("div", { class: "admin-filters" }, [cohortPicker()]), el("h2", { class: "guide-heads", text: "New match" }), create, el("h2", { class: "guide-heads", text: "Matches" }), table);
}

function cohortView() {
  const cohort = cohorts.find((c) => c.id === cohortId);
  const fields = [
    ["mentor_opens_at", "Mentor applications open"], ["mentor_closes_at", "Mentor applications close"],
    ["mentee_opens_at", "Mentee applications open"], ["mentee_closes_at", "Mentee applications close"],
    ["ends_at", "Cohort ends (applications are deleted 3 months after this)"],
  ];
  const readout = (input, note) => {
    const iso = fromLocalInput(input.value);
    if (!iso) {
      note.textContent = "not set";
      return;
    }
    const past = new Date(iso) <= new Date();
    note.textContent = `${istDate(iso)} IST${past && input.name.endsWith("opens_at") ? ", already passed, so this opens immediately" : ""}`;
    note.classList.toggle("is-warning", past && input.name.endsWith("opens_at"));
  };

  const form = el("form", { class: "apply-form" }, [
    ...fields.map(([name, text]) => {
      const input = el("input", { type: "datetime-local", id: name, name, value: toLocalInput(cohort[name]) });
      const note = el("p", { class: "field-note admin-date-readout" });
      input.addEventListener("input", () => readout(input, note));
      readout(input, note);
      return el("div", { class: "field" }, [el("label", { for: name, text: `${text}, IST` }), input, note]);
    }),
    el("div", { class: "form-actions" }, [el("button", { type: "submit", class: "submit-button", text: "save dates", disabled: me.role !== "admin" })]),
  ]);
  form.addEventListener("submit", act(async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(fields.map(([name]) => [name, fromLocalInput(form.elements[name].value)]));
    const now = new Date();
    const opening = ["mentor", "mentee"].filter((kind) => {
      const opens = body[`${kind}_opens_at`];
      const closes = body[`${kind}_closes_at`];
      return opens && new Date(opens) <= now && (!closes || new Date(closes) > now);
    });
    if (opening.length && !confirm(`Saving this opens ${opening.join(" and ")} applications to the public right now. Continue?`)) return;
    const saved = await api(`/cohorts/${cohortId}`, { method: "PATCH", body: JSON.stringify(body) });
    cohorts = cohorts.map((c) => (c.id === saved.id ? saved : c));
    await route();
    toast("Dates saved");
  }));
  mount(el("div", { class: "admin-filters" }, [cohortPicker()]), form);
}

async function route() {
  showError("");
  const [path] = location.hash.slice(1).split("?");
  const [section, id] = path.split("/");
  for (const link of document.querySelectorAll(".admin-tabs a")) {
    link.classList.toggle("is-active", link.getAttribute("href") === `#${section || "mentors"}`);
  }
  try {
    if (section === "mentees" || section === "mentors") await (id ? detailView(section, id) : listView(section));
    else if (section === "matches") await matchesView();
    else if (section === "cohort") cohortView();
    else await listView("mentors");
  } catch (error) {
    showError(error.message);
  }
}

async function enter() {
  me = await api("/me");
  cohorts = await api("/cohorts");
  cohortId ??= cohorts[0]?.id;
  document.querySelector("[data-who]").textContent = `${me.display_name} (${me.role})`;
  document.querySelector("[data-login]").hidden = true;
  document.querySelector("[data-app]").hidden = false;
  await route();
}

document.querySelector("[data-login]").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const errors = form.querySelector("[data-login-error]");
  errors.hidden = true;
  const captcha = form.querySelector("[name=cf-turnstile-response]")?.value ?? "";
  if (!captcha) {
    errors.textContent = "The bot check is still running. Give it a second to finish, then try again.";
    errors.hidden = false;
    return;
  }
  const button = form.querySelector("[type=submit]");
  button.disabled = true;
  try {
    const response = await fetch(`${API}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: form.elements.email.value.trim(),
        password: form.elements.password.value,
        captcha,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 429) throw new Error(`Too many failed attempts. This account is locked until ${istDate(data.locked_until)} IST.`);
    if (response.status === 401) {
      throw new Error(data.attempts_left === 1 ? "Wrong email or password. One more wrong try locks this account for an hour." : "Wrong email or password.");
    }
    if (data.error === "captcha_failed") throw new Error("The bot check didn't go through. Please try it again.");
    if (!response.ok) throw new Error("Sign-in isn't working right now. Try again in a few minutes.");
    storeSession(data);
    form.elements.password.value = "";
    await enter();
  } catch (error) {
    storeSession(null);
    errors.textContent = error.message;
    errors.hidden = false;
    window.turnstile?.reset();
  } finally {
    button.disabled = false;
  }
});

document.querySelector("[data-signout]").addEventListener("click", signOut);
addEventListener("hashchange", () => me && route());

session = restoreSession();
if (session) enter().catch(signOut);
else document.querySelector("[data-login]").hidden = false;

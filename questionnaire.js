const API = "https://twqeocprtqcnpvsgxicw.supabase.co/functions/v1/questionnaire";

const ERRORS = {
  answers_incomplete: "Answer all the situations before submitting.",
  questionnaire_submitted: "This questionnaire has already been submitted.",
  invite_expired: "This link expired before you submitted. Email summons@peerproject.in if you think that's a mistake on our end.",
  invite_invalid: "This link no longer works. It may have been replaced by a newer one.",
  captcha_missing: "Please complete the check above the button.",
  captcha_failed: "The bot check didn't go through. Please try it again.",
  invalid_email: "That email address doesn't look right.",
};

const token = decodeURIComponent(location.hash.slice(1));
const preview = token === "preview";
const draftKey = `tpp:questionnaire:${token.slice(0, 12)}`;

const questionsForm = document.querySelector("[data-questions]");
const recoverForm = document.querySelector("[data-recover]");

function show(state) {
  for (const node of document.querySelectorAll("[data-state]")) node.hidden = node.dataset.state !== state;
  recoverForm.hidden = !["no-link", "invalid"].includes(state);
  questionsForm.hidden = state !== "questions";
}

function istDateTime(value) {
  return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  });
}

function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(draftKey) ?? "{}");
  } catch {
    return {};
  }
}

function saveDraft(draft) {
  try {
    localStorage.setItem(draftKey, JSON.stringify(draft));
  } catch {}
}

function clearDraft() {
  try {
    localStorage.removeItem(draftKey);
  } catch {}
}

function render({ display_name, expires_at, questions }) {
  questionsForm.querySelector("[data-name]").textContent = display_name;
  questionsForm.querySelector("[data-expires]").textContent = istDateTime(expires_at);

  const draft = loadDraft();
  let saveTimer;
  const list = questionsForm.querySelector("[data-list]");
  list.replaceChildren(
    ...questions.map(({ id, prompt }, index) => {
      const field = document.createElement("div");
      field.className = "field";
      const label = document.createElement("label");
      label.htmlFor = `q-${id}`;
      label.textContent = `${index + 1}. ${prompt}`;
      const answer = document.createElement("textarea");
      answer.id = `q-${id}`;
      answer.dataset.questionId = id;
      answer.maxLength = 4000;
      answer.required = true;
      answer.value = draft[id] ?? "";
      answer.addEventListener("input", () => {
        draft[id] = answer.value;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => saveDraft(draft), 400);
      });
      field.append(label, answer);
      return field;
    }),
  );
  show("questions");
}

async function load() {
  if (!token) return show("no-link");
  if (preview) {
    return render({
      display_name: "there",
      expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      questions: [
        "Your mentee started well, then hasn't replied in 10 days. What do you do, and what exactly would you send them?",
        "Your mentee says they're sleeping about 4 hours a night, feel exhausted all the time, and their parents won't take them to a doctor. How do you respond?",
        "Mid-conversation, your mentee mentions they copied answers in a school test to keep their marks up. What do you say?",
        "Your mentee asks you to send them a full study timetable. How do you approach it?",
        "Your mentee asks whether you think they have ADHD. How do you answer?",
        "Your mentee scored 300 in a mock test and wants 650 in three months. How do you talk about it honestly without crushing them?",
        "Your mentee asks to continue on Instagram or WhatsApp instead of the server. What do you do?",
        "Halfway through the cohort, your own exams pile up and you can't keep up with your mentee. What do you do, and when?",
      ].map((prompt, i) => ({ id: i + 1, prompt })),
    });
  }

  try {
    const response = await fetch(API, { headers: { "x-questionnaire-token": token } });
    const body = await response.json();
    if (response.status === 404) return show("invalid");
    if (response.status === 410) return show("expired");
    if (!response.ok) throw new Error(body.error);
    if (body.submitted) return show("submitted");
    render(body);
  } catch {
    show("error");
  }
}

questionsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorBox = questionsForm.querySelector("[data-error]");
  const button = questionsForm.querySelector("[type=submit]");
  errorBox.hidden = true;

  const answers = [...questionsForm.querySelectorAll("textarea")].map((answer) => ({
    question_id: Number(answer.dataset.questionId),
    answer: answer.value.trim(),
  }));
  if (answers.some(({ answer }) => !answer)) {
    errorBox.textContent = ERRORS.answers_incomplete;
    errorBox.hidden = false;
    return;
  }
  if (preview) return;

  button.disabled = true;
  button.textContent = "submitting...";
  try {
    const response = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, answers }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error);
    clearDraft();
    show("done");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    errorBox.textContent = ERRORS[error.message] ?? "Something went wrong on our side. Your answers are still saved here, so try again in a few minutes.";
    errorBox.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = "submit answers";
  }
});

recoverForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorBox = recoverForm.querySelector("[data-recover-error]");
  const status = recoverForm.querySelector("[data-recover-status]");
  const button = recoverForm.querySelector("[type=submit]");
  errorBox.hidden = true;
  status.textContent = "";
  if (!recoverForm.reportValidity()) return;

  button.disabled = true;
  try {
    const response = await fetch(`${API}/recover`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: recoverForm.elements.email.value.trim(),
        "cf-turnstile-response": recoverForm.querySelector("[name=cf-turnstile-response]")?.value ?? "",
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error);
    status.textContent = "If that email has an open questionnaire, a new link is on its way. Check spam too.";
  } catch (error) {
    errorBox.textContent = ERRORS[error.message] ?? "Something went wrong on our side. Please try again in a few minutes.";
    errorBox.hidden = false;
    window.turnstile?.reset();
  } finally {
    button.disabled = false;
  }
});

addEventListener("hashchange", () => location.reload());
load();

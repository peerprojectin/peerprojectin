function enhanceSelect(select) {
  const box = document.createElement("div");
  box.className = "select-box";
  select.before(box);
  box.append(select);
  select.classList.add("native-control");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "select-button";
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  const label = document.querySelector(`label[for="${select.id}"]`);
  if (label) {
    label.id ||= `${select.id}-label`;
    button.setAttribute("aria-labelledby", `${label.id} ${select.id}-value`);
    label.removeAttribute("for");
    label.addEventListener("click", () => button.focus());
  }
  const valueText = document.createElement("span");
  valueText.id = `${select.id}-value`;
  button.append(valueText);

  const list = document.createElement("ul");
  list.className = "select-list";
  list.setAttribute("role", "listbox");
  list.hidden = true;

  const items = [...select.options]
    .filter((option) => !option.disabled)
    .map((option) => {
      const item = document.createElement("li");
      item.setAttribute("role", "option");
      item.tabIndex = -1;
      item.dataset.value = option.value;
      item.textContent = option.textContent;
      item.addEventListener("click", () => choose(option.value));
      list.append(item);
      return item;
    });

  box.append(button, list);

  function sync() {
    const selected = select.selectedOptions[0];
    valueText.textContent = selected?.textContent ?? "";
    button.classList.toggle("is-placeholder", !select.value);
    for (const item of items) item.setAttribute("aria-selected", String(item.dataset.value === select.value));
  }

  function open() {
    list.hidden = false;
    box.classList.add("is-open");
    button.setAttribute("aria-expanded", "true");
    focusItem(items.find((item) => item.dataset.value === select.value) ?? items[0]);
  }

  function close(refocus) {
    if (list.hidden) return;
    list.hidden = true;
    box.classList.remove("is-open");
    button.setAttribute("aria-expanded", "false");
    if (refocus) button.focus();
  }

  function choose(value) {
    if (select.value !== value) {
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    sync();
    close(true);
  }

  function focusItem(item) {
    if (!item) return;
    item.focus({ preventScroll: true });
    item.scrollIntoView({ block: "nearest" });
  }

  function move(step) {
    const index = items.indexOf(document.activeElement);
    focusItem(items[index === -1 ? 0 : Math.min(Math.max(index + step, 0), items.length - 1)]);
  }

  button.addEventListener("click", () => (list.hidden ? open() : close(true)));
  button.addEventListener("keydown", (event) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      open();
    }
  });

  list.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") move(1);
    else if (event.key === "ArrowUp") move(-1);
    else if (event.key === "Home") focusItem(items[0]);
    else if (event.key === "End") focusItem(items.at(-1));
    else if (event.key === "Enter" || event.key === " ") choose(document.activeElement.dataset.value);
    else if (event.key === "Escape") close(true);
    else if (event.key === "Tab") close(false);
    else if (event.key.length === 1) {
      const match = items.find((item) => item.textContent.toLowerCase().startsWith(event.key.toLowerCase()));
      focusItem(match);
      return;
    } else return;
    event.preventDefault();
  });

  document.addEventListener("click", (event) => {
    if (!box.contains(event.target)) close(false);
  });
  select.addEventListener("change", sync);
  select.addEventListener("focus", () => button.focus());
  select.addEventListener("invalid", () => box.classList.add("is-invalid"));
  select.addEventListener("change", () => box.classList.remove("is-invalid"));

  sync();
}

function enhanceNumber(input) {
  const box = document.createElement("div");
  box.className = "stepper";
  input.before(box);

  const step = (direction, text, label) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "stepper-button";
    button.textContent = text;
    button.setAttribute("aria-label", label);
    button.addEventListener("click", () => {
      if (input.value === "") input.value = input.min || 0;
      else if (direction > 0) input.stepUp();
      else input.stepDown();
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    return button;
  };

  box.append(step(-1, "-", "Decrease"), input, step(1, "+", "Increase"));
}

function enhanceFile(input) {
  const box = document.createElement("label");
  box.className = "file-box";
  input.before(box);
  box.append(input);
  input.classList.add("native-control");

  const action = document.createElement("span");
  action.className = "file-action";
  action.textContent = "choose file";
  const name = document.createElement("span");
  name.className = "file-name";
  box.prepend(action, name);

  const sync = () => {
    const file = input.files[0];
    name.textContent = file ? `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)` : "PDF / PNG / JPG; upto 5 MB";
    box.classList.toggle("has-file", Boolean(file));
  };
  input.addEventListener("change", sync);
  sync();
}

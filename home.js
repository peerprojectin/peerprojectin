const home = document.querySelector(".home-container");

function fit() {
  home.style.transform = "";
  const room = window.innerHeight - 48;
  const scale = Math.min(1, room / home.offsetHeight);
  if (scale < 1) home.style.transform = `scale(${scale})`;
}

new ResizeObserver(fit).observe(document.documentElement);
document.fonts?.ready.then(fit);
fit();

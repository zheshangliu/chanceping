(() => {
  const site = document.querySelector(".ich-site");
  const toggle = document.querySelector("[data-reading-toggle]");
  if (!site || !toggle) return;
  const key = "ich-reading-mode-large";
  let large = false;
  try { large = sessionStorage.getItem(key) === "1"; } catch { /* storage may be disabled */ }
  const apply = () => {
    site.classList.toggle("is-large-text", large);
    toggle.setAttribute("aria-pressed", String(large));
    toggle.setAttribute("aria-label", large ? "切换到标准字" : "切换到大字");
    toggle.textContent = large ? "标准" : "大字";
  };
  toggle.addEventListener("click", () => {
    large = !large;
    try { sessionStorage.setItem(key, large ? "1" : "0"); } catch { /* preference remains active for this page */ }
    apply();
  });
  apply();
})();

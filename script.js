const checkboxes = document.querySelectorAll(".diagnosis-card input");
const result = document.querySelector(".diagnosis-result");
const scrollChecklistButton = document.querySelector("[data-scroll-checklist]");

function updateDiagnosis() {
  const checked = [...checkboxes].filter((item) => item.checked).length;
  const total = checkboxes.length;
  const score = Math.round((checked / total) * 100);

  if (checked === 0) {
    result.textContent = "勾选后会显示你的入口完整度。";
    return;
  }

  if (score < 60) {
    result.textContent = `入口完整度 ${score}%：建议先补定位、信任和咨询路径。`;
    return;
  }

  if (score < 100) {
    result.textContent = `入口完整度 ${score}%：基础不错，可以继续补案例和GEO内容。`;
    return;
  }

  result.textContent = "入口完整度 100%：可以开始做搜索内容和新媒体导流。";
}

checkboxes.forEach((item) => item.addEventListener("change", updateDiagnosis));

scrollChecklistButton?.addEventListener("click", () => {
  document.querySelector(".diagnosis-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
});

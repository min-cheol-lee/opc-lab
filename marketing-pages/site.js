(function () {
  var config = window.OPCLAB_SITE_CONFIG || {};
  var simulatorUrl = (config.simulatorUrl || "").trim();
  var links = [document.getElementById("launchTop"), document.getElementById("launchMain")];
  for (var i = 0; i < links.length; i++) {
    var link = links[i];
    if (!link) continue;
    if (simulatorUrl) {
      link.href = simulatorUrl;
    } else {
      link.href = "#";
      link.addEventListener("click", function (e) {
        e.preventDefault();
        alert("Set marketing-pages/site-config.js -> simulatorUrl first.");
      });
    }
  }
})();

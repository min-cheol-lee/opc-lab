(function () {
  var config = window.OPCLAB_SITE_CONFIG || {};
  var simulatorUrl = (config.simulatorUrl || "").trim();
  var launchLinks = document.querySelectorAll("[data-launch]");
  var revealTargets = document.querySelectorAll("[data-reveal]");

  for (var i = 0; i < launchLinks.length; i++) {
    var link = launchLinks[i];
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

  if (!("IntersectionObserver" in window)) {
    for (var j = 0; j < revealTargets.length; j++) {
      revealTargets[j].classList.add("is-visible");
    }
    return;
  }

  var observer = new IntersectionObserver(
    function (entries, io) {
      for (var k = 0; k < entries.length; k++) {
        var entry = entries[k];
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        io.unobserve(entry.target);
      }
    },
    {
      threshold: 0.16,
      rootMargin: "0px 0px -8% 0px",
    },
  );

  for (var m = 0; m < revealTargets.length; m++) {
    observer.observe(revealTargets[m]);
  }
})();

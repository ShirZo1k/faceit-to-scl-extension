import React from "react";
import { createRoot } from "react-dom/client";
import FaceitToSclButton from "./FaceitToSclButton";

console.log(
  "Loaded FACEIT to SCL extension for FACEIT injection in web page context",
);

function onDomChange() {
  // Only inject if not already on page
  if (document.getElementById("__faceit-to-scl")) {
    return;
  }

  // Must be on a match page
  const isMatchPage = /\/cs.+\/room\//.test(location.href);
  if (!isMatchPage) return;

  // Get the info panel of match page
  const parent = document.querySelector<HTMLDivElement>("div[name=info]");
  if (!parent) return;

  const hasCaptcha = !!parent.querySelector("#cf-turnstile");

  // Find "Watch demo" button
  const button = parent.querySelector(
    "div:first-child > div:first-child > button > span",
  )?.parentElement;

  if (hasCaptcha && button) {
    // Logged in: show upload buttons
    parent.style.marginLeft = "-8px";
    parent.style.marginRight = "-8px";
    parent.style.padding = "16px 8px";

    const div = document.createElement("div");
    div.id = "__faceit-to-scl";
    div.style.marginTop = "16px";
    div.style.marginBottom = "16px";
    button.after(div);

    const root = createRoot(div);
    root.render(<FaceitToSclButton />);
  } else if (!hasCaptcha) {
    // Logged out: show login prompt
    // Find a good insertion point - look for the info panel's first child
    const firstChild = parent.querySelector("div:first-child");
    if (!firstChild) return;

    const div = document.createElement("div");
    div.id = "__faceit-to-scl";
    div.style.marginTop = "12px";
    div.style.marginBottom = "12px";
    div.style.padding = "0 8px";
    firstChild.appendChild(div);

    const link = document.createElement("a");
    link.href = "https://www.faceit.com/en/signin";
    link.target = "_blank";
    link.rel = "noreferrer";
    link.style.cssText = "display:flex;align-items:center;justify-content:center;gap:6px;width:100%;height:32px;background:rgba(11,174,234,0.12);border:1px solid rgba(11,174,234,0.25);border-radius:4px;color:#0BAEEA;font-size:12px;font-weight:700;text-decoration:none;transition:all 0.15s;cursor:pointer;";
    link.addEventListener("mouseover", () => { link.style.background = "rgba(11,174,234,0.2)"; });
    link.addEventListener("mouseout", () => { link.style.background = "rgba(11,174,234,0.12)"; });

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "14"); svg.setAttribute("height", "14");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", "2.5");
    svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round");
    const sp1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
    sp1.setAttribute("d", "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4");
    const sp2 = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    sp2.setAttribute("points", "10 17 15 12 10 7");
    const sp3 = document.createElementNS("http://www.w3.org/2000/svg", "line");
    sp3.setAttribute("x1", "15"); sp3.setAttribute("y1", "12");
    sp3.setAttribute("x2", "3"); sp3.setAttribute("y2", "12");
    svg.append(sp1, sp2, sp3);

    link.appendChild(svg);
    link.appendChild(document.createTextNode("Log in to FACEIT to upload to SCL"));
    div.appendChild(link);
  }
}

onDomChange();

// Watch all DOM changes
const observer = new MutationObserver(onDomChange);
observer.observe(document.documentElement, { subtree: true, childList: true });

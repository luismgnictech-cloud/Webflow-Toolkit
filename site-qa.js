"use strict";
const BOOKMARKLET_SRC="https://luismgnictech-cloud.github.io/Webflow-Toolkit/site-qa-bookmarklet.js";
const code="javascript:(()=>{const e=document.getElementById('wft-site-qa-loader');if(e){e.remove();}const s=document.createElement('script');s.id='wft-site-qa-loader';s.src='"+BOOKMARKLET_SRC+"?v='+Date.now();s.onload=()=>s.remove();s.onerror=()=>alert('Site QA could not load on this page. The site may block external scripts through Content Security Policy.');document.documentElement.appendChild(s);})();";
const bookmarklet=document.getElementById("bookmarklet");
const copyButton=document.getElementById("copyBookmarklet");
const status=document.getElementById("bookmarkletStatus");
const target=document.getElementById("target");
bookmarklet.href=code;
bookmarklet.addEventListener("click",event=>{
  // Clicking on this setup page should not run the audit accidentally.
  if(!event.altKey){
    event.preventDefault();
    status.textContent="Drag “Run Site QA” to your bookmarks bar. Hold Alt while clicking to test it on this page.";
  }
});
copyButton.addEventListener("click",async()=>{
  try{
    await navigator.clipboard.writeText(code);
    status.textContent="Bookmarklet copied. Create a new browser bookmark and paste it into the bookmark URL field.";
  }catch{
    status.textContent="Clipboard access was unavailable. Drag the Run Site QA button to your bookmarks bar instead.";
  }
});
document.getElementById("openTarget").addEventListener("click",()=>{
  const raw=target.value.trim();
  if(!raw){status.textContent="Enter a URL to open.";target.focus();return}
  let url;
  try{url=new URL(raw)}catch{status.textContent="Enter a valid URL including https://";target.focus();return}
  if(!/^https?:$/.test(url.protocol)){status.textContent="Only HTTP and HTTPS URLs can be opened.";return}
  window.open(url.href,"_blank","noopener");
  status.textContent="Site opened in a new tab. Use Run Site QA from your bookmarks bar on that page.";
});
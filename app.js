/* =========================================================
   PixelPack — client-side image → ZIP

   Supports:
   - File picker
   - Drag & drop
   - Clipboard paste
   - HTTP/HTTPS image URLs when CORS permits
   - Browser blob URLs when accessible
   - Data URLs
   - Image previews
   - Remove individual images
   - Clear all
   - ZIP generation with password via zip.js
   - Progress reporting

   IMPORTANT:
   A browser cannot bypass CORS.
   Remote servers must allow your page to fetch the image.
========================================================= */

(() => {
  "use strict";

  /* =========================
     DOM
  ========================= */

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");

  const urlInput = document.getElementById("urlInput");
  const addUrl = document.getElementById("addUrl");

  const imagesEl = document.getElementById("images");
  const emptyEl = document.getElementById("empty");

  const countEl = document.getElementById("count");
  const clearBtn = document.getElementById("clearBtn");

  const statImages = document.getElementById("statImages");
  const statSize = document.getElementById("statSize");

  const zipBtn = document.getElementById("zipBtn");

  const progressEl = document.getElementById("progress");
  const progressBar = document.getElementById("progressBar");

  const statusEl = document.getElementById("status");


  /* =========================
     STATE
  ========================= */

  const items = [];

  let isPacking = false;


  /* =========================
     HELPERS
  ========================= */

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return "0 B";
    }

    const units = ["B", "KB", "MB", "GB"];

    let value = bytes;
    let unit = 0;

    while (
      value >= 1024 &&
      unit < units.length - 1
    ) {
      value /= 1024;
      unit++;
    }

    if (unit === 0) {
      return `${Math.round(value)} B`;
    }

    return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
  }


  function sanitizeFilename(name) {
    let clean = String(name || "image");

    clean = clean.replace(/^.*[\\/]/, "");

    clean = clean.replace(
      /[<>:"/\\|?*\x00-\x1F]/g,
      "_"
    );

    clean = clean.trim();

    if (!clean) {
      clean = "image";
    }

    if (clean.length > 180) {
      const dot = clean.lastIndexOf(".");

      if (dot > 0) {
        const extension = clean.slice(dot);

        clean =
          clean.slice(
            0,
            180 - extension.length
          ) + extension;
      } else {
        clean = clean.slice(0, 180);
      }
    }

    return clean;
  }


  function filenameFromUrl(url) {
    try {
      const parsed = new URL(url);

      const pathname =
        decodeURIComponent(parsed.pathname);

      const filename =
        pathname
          .split("/")
          .filter(Boolean)
          .pop();

      if (filename) {
        return sanitizeFilename(filename);
      }

    } catch {
      // Ignore.
    }

    return "image";
  }


  function extensionFromMime(type) {
    const mime =
      String(type || "").toLowerCase();

    const map = {
      "image/jpeg": ".jpg",
      "image/jpg": ".jpg",
      "image/png": ".png",
      "image/gif": ".gif",
      "image/webp": ".webp",
      "image/bmp": ".bmp",
      "image/svg+xml": ".svg",
      "image/avif": ".avif",
      "image/tiff": ".tif",
      "image/x-icon": ".ico"
    };

    return map[mime] || "";
  }


  function ensureImageExtension(name, blob) {
    const clean =
      sanitizeFilename(name);

    if (
      /\.[a-z0-9]{2,8}$/i.test(clean)
    ) {
      return clean;
    }

    const extension =
      extensionFromMime(blob.type);

    return (
      clean +
      (extension || ".img")
    );
  }


  function uniqueFilename(filename, usedNames) {
    const clean =
      sanitizeFilename(filename);

    if (
      !usedNames.has(
        clean.toLowerCase()
      )
    ) {
      usedNames.add(
        clean.toLowerCase()
      );

      return clean;
    }

    const dot =
      clean.lastIndexOf(".");

    let base;
    let extension;

    if (dot > 0) {
      base = clean.slice(0, dot);
      extension = clean.slice(dot);
    } else {
      base = clean;
      extension = "";
    }

    let number = 2;
    let candidate;

    do {
      candidate =
        `${base}-${number}${extension}`;

      number++;

    } while (
      usedNames.has(
        candidate.toLowerCase()
      )
    );

    usedNames.add(
      candidate.toLowerCase()
    );

    return candidate;
  }


  function setStatus(message) {
    statusEl.textContent =
      message || "";
  }


  function setProgress(value) {
    const percent =
      Math.max(
        0,
        Math.min(
          100,
          Number(value) || 0
        )
      );

    progressBar.style.width =
      `${percent}%`;
  }


  function showProgress(show) {
    progressEl.style.display =
      show ? "block" : "none";
  }


  /* =========================
     STATE / UI
  ========================= */

  function updateStats() {
    const totalBytes =
      items.reduce(
        (total, item) =>
          total + item.blob.size,
        0
      );

    countEl.textContent =
      String(items.length);

    statImages.textContent =
      String(items.length);

    statSize.textContent =
      formatBytes(totalBytes);

    emptyEl.style.display =
      items.length === 0
        ? ""
        : "none";

    clearBtn.disabled =
      items.length === 0 ||
      isPacking;

    zipBtn.disabled =
      items.length === 0 ||
      isPacking;
  }


  function randomTilt() {
    const values = [
      -2.2,
      -1.4,
      -0.7,
      0.6,
      1.1,
      1.8,
      2.4
    ];

    return values[
      Math.floor(
        Math.random() *
        values.length
      )
    ];
  }


  /* =========================
     CARD
  ========================= */

  function createCard(item, index) {
    const card =
      document.createElement("article");

    card.className =
      "card fresh";

    card.style.setProperty(
      "--tilt",
      `${randomTilt()}deg`
    );

    card.dataset.id =
      item.id;


    const previewWrap =
      document.createElement("div");

    previewWrap.className =
      "preview-wrap";


    const img =
      document.createElement("img");

    img.className =
      "preview";

    img.alt =
      item.name;

    img.loading =
      "lazy";

    img.src =
      item.previewUrl;


    const number =
      document.createElement("span");

    number.className =
      "card-number";

    number.textContent =
      String(index + 1)
        .padStart(2, "0");


    const remove =
      document.createElement("button");

    remove.className =
      "remove";

    remove.type =
      "button";

    remove.title =
      `Remove ${item.name}`;

    remove.setAttribute(
      "aria-label",
      `Remove ${item.name}`
    );

    remove.textContent =
      "×";


    remove.addEventListener(
      "click",
      event => {
        event.stopPropagation();

        removeItem(item.id);
      }
    );


    const body =
      document.createElement("div");

    body.className =
      "card-body";


    const name =
      document.createElement("div");

    name.className =
      "name";

    name.title =
      item.name;

    name.textContent =
      item.name;


    const size =
      document.createElement("div");

    size.className =
      "size";

    size.textContent =
      formatBytes(
        item.blob.size
      );


    previewWrap.appendChild(img);
    previewWrap.appendChild(number);
    previewWrap.appendChild(remove);

    body.appendChild(name);
    body.appendChild(size);

    card.appendChild(previewWrap);
    card.appendChild(body);

    return card;
  }

  function removeItem(id) {
    const index = items.findIndex(item => item.id === id);
    if (index !== -1) {
      URL.revokeObjectURL(items[index].previewUrl);
      items.splice(index, 1);
      render();
    }
  }

  function render() {
    const cards =
      imagesEl.querySelectorAll(
        ".card"
      );

    cards.forEach(card =>
      card.remove()
    );

    items.forEach(
      (item, index) => {
        imagesEl.appendChild(
          createCard(
            item,
            index
          )
        );
      }
    );

    updateStats();
  }


  /* =========================================================
     COMPRESSION & ENCRYPTION PIPELINE (zip.js)
  ========================================================= */
  zipBtn.addEventListener("click", async () => {
    if (items.length === 0 || isPacking) return;

    isPacking = true;
    updateStats();
    showProgress(true);
    setProgress(0);
    setStatus("Preparing container...");

    const archivePassword = document.getElementById("zipFilePassword").value.trim();
    const options = {};

    if (archivePassword) {
      options.password = archivePassword;
      options.zipCrypto = true; // Triggers standard ZipCrypto for native OS extraction support
      setStatus("Applying security keys...");
    }

    try {
      const blobWriter = new zip.BlobWriter("application/zip");
      const zipWriter = new zip.ZipWriter(blobWriter, options);

      const usedNames = new Set();
      let completed = 0;

      for (const item of items) {
        const uniqueName = uniqueFilename(item.name, usedNames);
        setStatus(`Packing: ${uniqueName}...`);

        const fileReader = new zip.BlobReader(item.blob);
        await zipWriter.add(uniqueName, fileReader);

        completed++;
        setProgress((completed / items.length) * 100);
      }

      setStatus("Sealing parcel...");
      const finalZipBlob = await zipWriter.close();

      const downloadUrl = URL.createObjectURL(finalZipBlob);
      const tempLink = document.createElement("a");
      tempLink.href = downloadUrl;
      tempLink.download = `pixelpack-${Date.now()}.zip`;
      document.body.appendChild(tempLink);
      tempLink.click();
      document.body.removeChild(tempLink);
      URL.revokeObjectURL(downloadUrl);
      setStatus("Parcel delivered successfully!");
      setProgress(100);
      document.getElementById("zipFilePassword").value = "";
    } catch (error) {
      console.error(error);
      setStatus("Packaging failed: check resource integrity.");
    } finally {
      isPacking = false;
      updateStats();
      setTimeout(() => showProgress(false), 3000);
    }
  });
  /* =========================================================
  DRAG, DROP & INPUT CAPTURE INITIALIZERS
  ========================================================= */
  dropzone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    handleFiles(fileInput.files);
    fileInput.value = "";
  });
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragging");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragging"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragging");
    handleFiles(e.dataTransfer.files);
  });
  window.addEventListener("paste", (e) => {
    const files = e.clipboardData.files;
    if (files.length > 0) handleFiles(files);
  });
  clearBtn.addEventListener("click", () => {
    if (isPacking) return;
    items.forEach(item => URL.revokeObjectURL(item.previewUrl));
    items.length = 0;
    render();
    setStatus("Table swept clean.");
  });
  function handleFiles(filesList) {
    if (!filesList) return;
    Array.from(filesList).forEach(file => {
      if (!file.type.startsWith("image/")) return;
      const id = Math.random().toString(36).substr(2, 9);
      const previewUrl = URL.createObjectURL(file);
      items.push({
        id,
        name: file.name,
        blob: file,
        previewUrl
      });
    });
    render();
  }
  addUrl.addEventListener("click", async () => {
    const url = urlInput.value.trim();
    if (!url) return;
    setStatus("Fetching remote picture...");
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("CORS or network error");
      const blob = await response.blob();
      const id = Math.random().toString(36).substr(2, 9);
      const name = filenameFromUrl(url) || "downloaded-image";
      const finalName = ensureImageExtension(name, blob);
      const previewUrl = URL.createObjectURL(blob);
      items.push({ id, name: finalName, blob, previewUrl });
      render();
      urlInput.value = "";
      setStatus("Remote picture added.");
    } catch (err) {
      console.error(err);
      setStatus("Fetch failed: Host blocked request (CORS).");
    }
  });
})();
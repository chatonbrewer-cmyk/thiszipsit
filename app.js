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
   - ZIP generation with JSZip
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


  /* =========================
     ADD BLOB
  ========================= */

  function addBlob(
    blob,
    filename,
    source = "local"
  ) {
    if (!(blob instanceof Blob)) {
      setStatus(
        "That item could not be read as an image."
      );

      return false;
    }


    if (
      !blob.type ||
      !blob.type.startsWith("image/")
    ) {
      setStatus(
        "Only image files are supported."
      );

      return false;
    }


    const finalName =
      ensureImageExtension(
        filename || "image",
        blob
      );


    const previewUrl =
      URL.createObjectURL(blob);


    const item = {
      id:
        `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`,

      blob,

      name:
        finalName,

      previewUrl,

      source
    };


    items.push(item);

    render();

    setStatus(
      `${items.length} image${
        items.length === 1
          ? ""
          : "s"
      } on the table.`
    );

    return true;
  }


  /* =========================
     REMOVE
  ========================= */

  function removeItem(id) {
    const index =
      items.findIndex(
        item =>
          item.id === id
      );

    if (index === -1) {
      return;
    }


    const [item] =
      items.splice(index, 1);


    if (item.previewUrl) {
      URL.revokeObjectURL(
        item.previewUrl
      );
    }


    render();


    setStatus(
      items.length
        ? `${items.length} image${
            items.length === 1
              ? ""
              : "s"
          } remaining.`
        : "The table is empty."
    );
  }


  /* =========================
     CLEAR
  ========================= */

  function clearAll() {
    if (isPacking) {
      return;
    }


    for (const item of items) {
      if (item.previewUrl) {
        URL.revokeObjectURL(
          item.previewUrl
        );
      }
    }


    items.length = 0;

    render();

    setStatus(
      "The table has been swept clear."
    );
  }


  /* =========================
     LOCAL FILES
  ========================= */

  function addFiles(fileList) {
    if (!fileList) {
      return;
    }


    const files =
      Array.from(fileList);


    const images =
      files.filter(
        file =>
          file &&
          (
            file.type.startsWith(
              "image/"
            ) ||
            /\.(jpg|jpeg|png|gif|webp|bmp|svg|avif|tif|tiff|ico)$/i
              .test(file.name)
          )
      );


    if (images.length === 0) {
      setStatus(
        "No image files were found."
      );

      return;
    }


    let added = 0;


    for (const file of images) {
      if (
        addBlob(
          file,
          file.name,
          "local"
        )
      ) {
        added++;
      }
    }


    if (added > 0) {
      setStatus(
        `Added ${added} image${
          added === 1
            ? ""
            : "s"
        } to the table.`
      );
    }
  }


  /* =========================
     FILE PICKER
  ========================= */

  dropzone.addEventListener(
    "click",
    event => {
      if (
        event.target ===
        fileInput
      ) {
        return;
      }

      if (!isPacking) {
        fileInput.click();
      }
    }
  );


  dropzone.addEventListener(
    "keydown",
    event => {
      if (isPacking) {
        return;
      }

      if (
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();

        fileInput.click();
      }
    }
  );


  fileInput.addEventListener(
    "change",
    () => {
      addFiles(
        fileInput.files
      );

      fileInput.value = "";
    }
  );


  /* =========================
     DRAG & DROP
  ========================= */

  [
    "dragenter",
    "dragover"
  ].forEach(
    eventName => {
      dropzone.addEventListener(
        eventName,
        event => {
          event.preventDefault();

          if (!isPacking) {
            dropzone.classList.add(
              "dragging"
            );
          }
        }
      );
    }
  );


  [
    "dragleave",
    "drop"
  ].forEach(
    eventName => {
      dropzone.addEventListener(
        eventName,
        event => {
          event.preventDefault();

          dropzone.classList.remove(
            "dragging"
          );
        }
      );
    }
  );


  dropzone.addEventListener(
    "drop",
    event => {
      if (isPacking) {
        return;
      }

      addFiles(
        event.dataTransfer.files
      );
    }
  );


  /* =========================
     CLIPBOARD
  ========================= */

  document.addEventListener(
    "paste",
    event => {
      if (isPacking) {
        return;
      }


      const clipboardItems =
        Array.from(
          event.clipboardData?.items ||
          []
        );


      const imageItems =
        clipboardItems.filter(
          item =>
            item.type.startsWith(
              "image/"
            )
        );


      if (
        imageItems.length === 0
      ) {
        return;
      }


      event.preventDefault();


      let added = 0;


      for (
        const item of imageItems
      ) {
        const blob =
          item.getAsFile();


        if (!blob) {
          continue;
        }


        const extension =
          extensionFromMime(
            blob.type
          ) || ".png";


        const filename =
          `pasted-image-${Date.now()}${extension}`;


        if (
          addBlob(
            blob,
            filename,
            "clipboard"
          )
        ) {
          added++;
        }
      }


      if (added > 0) {
        setStatus(
          `Pasted ${added} image${
            added === 1
              ? ""
              : "s"
          } from the clipboard.`
        );
      }
    }
  );


  /* ========================================================
     DATA URL
     ======================================================== */

  function isDataUrl(value) {
    return String(value)
      .trim()
      .toLowerCase()
      .startsWith("data:image/");
  }


  async function fetchDataUrl(dataUrl) {
    const response =
      await fetch(dataUrl);

    if (!response.ok) {
      throw new Error(
        "Could not read data URL."
      );
    }

    return response.blob();
  }


    /* =========================
    URL FETCHING
  ========================= */

  async function fetchImageUrl(rawUrl) {
    const value = String(rawUrl || "").trim();

    if (!value) {
      setStatus("Enter an image URL first.");
      return;
    }

    let parsed;

    try {
      parsed = new URL(value);
    } catch {
      setStatus("That doesn't look like a valid image URL.");
      return;
    }

    if (
      parsed.protocol !== "http:" &&
      parsed.protocol !== "https:"
    ) {
      setStatus(
        "Please enter a normal HTTP or HTTPS image URL."
      );
      return;
    }

    if (isPacking) {
      return;
    }

    addUrl.disabled = true;

    const originalText = addUrl.textContent;
    addUrl.textContent = "Fetching…";

    setStatus("Fetching image…");

    try {
      const proxyUrl =
        `/.netlify/functions/fetch-image?url=${encodeURIComponent(value)}`;

      const response = await fetch(proxyUrl, {
        method: "GET",
        cache: "no-store"
      });

      if (!response.ok) {
        let message =
          `Image fetch failed (HTTP ${response.status}).`;

        try {
          const data = await response.json();

          if (data?.error) {
            message = data.error;
          }
        } catch {
          // Response was not JSON.
        }

        throw new Error(message);
      }

      const blob = await response.blob();

      if (!blob.type.startsWith("image/")) {
        throw new Error(
          "The URL did not return an image."
        );
      }

      let filename = filenameFromUrl(value);

      filename = ensureImageExtension(
        filename,
        blob
      );

      const added = addBlob(
        blob,
        filename,
        "url"
      );

      if (added) {
        urlInput.value = "";

        setStatus(
          `Fetched ${filename}. The image is now in browser memory and will be included in the ZIP.`
        );
      }

    } catch (error) {
      console.error(
        "PixelPack URL import error:",
        error
      );

      setStatus(
        error?.message ||
        "Could not fetch that image."
      );

    } finally {
      addUrl.disabled = false;
      addUrl.textContent = originalText;
    }
  }


  addUrl.addEventListener(
    "click",
    () => {
      fetchImageUrl(
        urlInput.value
      );
    }
  );


  urlInput.addEventListener(
    "keydown",
    event => {
      if (
        event.key === "Enter"
      ) {
        event.preventDefault();

        fetchImageUrl(
          urlInput.value
        );
      }
    }
  );


  /* =========================
     CLEAR
  ========================= */

  clearBtn.addEventListener(
    "click",
    clearAll
  );


  /* ========================================================
     ZIP
     ======================================================== */

  async function createZip() {
    if (isPacking) {
      return;
    }


    if (items.length === 0) {
      setStatus(
        "Add at least one image before sealing the parcel."
      );

      return;
    }


    if (
      typeof window.JSZip ===
      "undefined"
    ) {
      setStatus(
        "JSZip could not be loaded. Make sure jszip.min.js is in the project folder."
      );

      return;
    }


    isPacking = true;

    updateStats();

    showProgress(true);

    setProgress(0);


    zipBtn.disabled = true;

    clearBtn.disabled = true;

    addUrl.disabled = true;

    fileInput.disabled = true;


    setStatus(
      `Packing ${items.length} image${
        items.length === 1
          ? ""
          : "s"
      }…`
    );


    try {
      const zip =
        new JSZip();


      const usedNames =
        new Set();


      const files =
        items.map(item => {
          const filename =
            uniqueFilename(
              item.name,
              usedNames
            );

          return {
            item,
            filename
          };
        });


      /* --------------------------------
         ADD FILES
         -------------------------------- */

      for (
        let i = 0;
        i < files.length;
        i++
      ) {
        const {
          item,
          filename
        } = files[i];


        zip.file(
          filename,
          item.blob
        );


        setProgress(
          (i /
            files.length) *
            35
        );
      }


      /* --------------------------------
         CREATE ZIP
         -------------------------------- */

      const zipBlob =
        await zip.generateAsync(
          {
            type: "blob",

            compression:
              "DEFLATE",

            compressionOptions: {
              level: 6
            }
          },

          metadata => {
            const percent =
              35 +
              (
                metadata.percent *
                0.65
              );

            setProgress(
              percent
            );


            setStatus(
              `Packing… ${Math.round(
                metadata.percent
              )}%`
            );
          }
        );


      /* --------------------------------
        DOWNLOAD ZIP
        -------------------------------- */

      const downloadUrl =
        URL.createObjectURL(zipBlob);

      const filename =
        createZipFilename();

      const link =
        document.createElement("a");

      link.href = downloadUrl;
      link.download = filename;
      link.textContent = `Download ${filename}`;

      link.className = "zip-download";

      document.body.appendChild(link);

      setProgress(100);

      setStatus(
        `ZIP ready. Click the download link below.`
      );

      // Keep the Blob URL alive for one minute.
      setTimeout(() => {
        URL.revokeObjectURL(downloadUrl);
      }, 60000);



    } catch (error) {
      console.error(
        "PixelPack ZIP error:",
        error
      );


      setProgress(0);


      setStatus(
        "The ZIP could not be created. Your browser may not have enough memory for these images."
      );

    } finally {
      isPacking = false;

      fileInput.disabled =
        false;

      addUrl.disabled =
        false;

      updateStats();
    }
  }


  /* =========================
     ZIP FILENAME
  ========================= */

  function createZipFilename() {
    const now =
      new Date();


    const year =
      now.getFullYear();


    const month =
      String(
        now.getMonth() + 1
      ).padStart(2, "0");


    const day =
      String(
        now.getDate()
      ).padStart(2, "0");


    const hour =
      String(
        now.getHours()
      ).padStart(2, "0");


    const minute =
      String(
        now.getMinutes()
      ).padStart(2, "0");


    return (
      `pixelpack-${year}-${month}-${day}-${hour}${minute}.zip`
    );
  }


  zipBtn.addEventListener(
    "click",
    createZip
  );


  /* =========================
     CLEANUP
  ========================= */

  window.addEventListener(
    "beforeunload",
    () => {
      for (
        const item of items
      ) {
        if (
          item.previewUrl
        ) {
          URL.revokeObjectURL(
            item.previewUrl
          );
        }
      }
    }
  );


  /* =========================
     INITIAL STATE
  ========================= */

  showProgress(false);

  setProgress(0);

  updateStats();

})();

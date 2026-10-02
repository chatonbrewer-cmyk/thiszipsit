Private Image ZIP



A privacy-first, client-side image-to-ZIP web application.



Privacy model



Images selected, pasted, or dragged into the application are processed locally in the user's browser.



The application does not provide an image-upload endpoint or database.



The only intentionally downloaded file is the generated ZIP archive.



Image URLs



When a user supplies an image URL, the browser requests that URL directly. The image does not pass through the application's server.



Some websites block browser-based image requests using CORS. This is expected browser security behavior and is not bypassed by this application.



Files

private-image-zip/

├── index.html

├── jszip.min.js

├── \_headers

└── README.md



Important



Place the official jszip.min.js distribution in the same directory as index.html.



Do not replace the local JSZip file with a CDN URL if the goal is maximum privacy.



Local testing



Open index.html in a browser.



For more reliable testing, serve the folder through a local HTTP server.



Deployment



This is a static website.



It can be deployed to any static hosting provider that supports HTML, JavaScript and CSS.



No database, application server or API is required.



Privacy limitation



The application minimizes the data it creates and sends, but a web application cannot guarantee that the browser or operating system leaves absolutely no temporary data or cache.



The application therefore makes no "zero forensic footprint" guarantee.


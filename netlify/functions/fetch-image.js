exports.handler = async function (event) {
  try {
    const url = event.queryStringParameters?.url;

    if (!url) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          error: "Missing image URL."
        })
      };
    }

    const parsed = new URL(url);

    if (
      parsed.protocol !== "http:" &&
      parsed.protocol !== "https:"
    ) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          error: "Only HTTP and HTTPS URLs are supported."
        })
      };
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "PixelPack/1.0"
      }
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          error: `Remote server returned HTTP ${response.status}.`
        })
      };
    }

    const contentType =
      response.headers.get("content-type") || "";

    if (!contentType.toLowerCase().startsWith("image/")) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          error: "The URL did not return an image."
        })
      };
    }

    const arrayBuffer = await response.arrayBuffer();

    const base64 = Buffer.from(arrayBuffer).toString("base64");

    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store"
      },
      body: base64
    };

  } catch (error) {
    console.error("fetch-image error:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        error: "Could not fetch the image."
      })
    };
  }
};

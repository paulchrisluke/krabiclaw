export function readHttpResponse(response, requestUrl) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;

    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    response.on("data", chunk => chunks.push(chunk));
    response.once("error", rejectOnce);
    response.once("close", () => {
      if (!response.complete) {
        rejectOnce(new Error(`Incomplete HTTP response from ${requestUrl}`));
      }
    });
    response.once("end", () => {
      if (!response.complete) {
        rejectOnce(new Error(`Incomplete HTTP response from ${requestUrl}`));
        return;
      }
      if (response.statusCode === undefined) {
        rejectOnce(new Error(`Missing HTTP status for ${requestUrl}`));
        return;
      }
      if (settled) return;
      settled = true;
      resolve({
        status: response.statusCode,
        headers: response.headers,
        bodyText: Buffer.concat(chunks).toString("utf8").trim(),
      });
    });
  });
}

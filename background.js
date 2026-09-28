chrome.runtime.onInstalled.addListener(() => {
  updateOriginRule("http://localhost:11435");
});

function updateOriginRule(targetUrl) {
  try {
    const originUrl = new URL(targetUrl).origin;
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1],
      addRules: [
        {
          id: 1,
          priority: 1,
          action: {
            type: "modifyHeaders",
            requestHeaders: [
              {
                header: "Origin",
                operation: "set",
                value: originUrl
              }
            ]
          },
          condition: {
            urlFilter: `${originUrl}/*`,
            resourceTypes: ["xmlhttprequest"]
          }
        }
      ]
    });
  } catch (err) {
    console.error("Invalid URL for Origin header rule:", targetUrl);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "CLASSIFY_SUBJECT_API") {
    const apiUrl = request.options?.apiUrl || "http://localhost:11435/api/decide";
    const modelName = request.options?.modelName || "kev";
    const threshold = typeof request.options?.probabilityThreshold === "number" 
      ? request.options.probabilityThreshold 
      : 0.4;

    // Update dynamic origin rule to match the targeted API URL
    updateOriginRule(apiUrl);

    const startTime = performance.now();

    fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: modelName,
        state: `Email subject: ${request.subject}`,
        questions: {
          promotional: {
            type: "noul",
            instructions: request.instructions
          }
        }
      })
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`API response status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        const durationMs = Math.round(performance.now() - startTime);
        const score = data.answers?.promotional?.noul ?? 0;
        const isPromotional = score > threshold;

        console.log(`[API Success] Subject: "${request.subject}" | Score: ${score} | Threshold: ${threshold} | Duration: ${durationMs}ms`);

        sendResponse({
          success: true,
          isPromotional,
          score,
          answers: data.answers,
          timeTakenMs: durationMs
        });
      })
      .catch((err) => {
        const durationMs = Math.round(performance.now() - startTime);
        console.error(`[API Error] Duration: ${durationMs}ms | Error:`, err);

        sendResponse({
          success: false,
          error: err.message,
          timeTakenMs: durationMs
        });
      });

    return true;
  }
});
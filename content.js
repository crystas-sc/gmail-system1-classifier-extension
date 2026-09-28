let globalTotalSelected = 0;
let globalTotalProcessed = 0;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "START_CLASSIFICATION") {
    runMultiPageClassification(request.instructions, request.options || {})
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));

    return true;
  }
});

async function runMultiPageClassification(instructions, options) {
  let runProcessed = 0;
  let runSelected = 0;
  const allResults = [];

  for (let i = 0; i < 3; i++) {
    console.log(`[Page ${i + 1}/3] Processing Gmail threads...`);

    const pageResult = await processGmailThreads(instructions, options);
    
    if (pageResult && pageResult.success) {
      runProcessed += pageResult.total || 0;
      runSelected += pageResult.selected || 0;
      if (pageResult.results) {
        allResults.push(...pageResult.results);
      }
    }

    const olderBtn = document.querySelector("div[aria-label='Older']");
    if (olderBtn) {
      const keypressOptions = {
        key: " ",
        code: "Space",
        keyCode: 32,
        which: 32,
        charCode: 32,
        bubbles: true,
        cancelable: true
      };
      olderBtn.dispatchEvent(new KeyboardEvent('keyup', keypressOptions));
    } else {
      console.warn("Older page button not found. Ending loop early.");
      break;
    }

    if (i < 2) {
      console.log("Waiting 3 seconds for next page to load...");
      await delay(3000);
    }
  }

  globalTotalProcessed += runProcessed;
  globalTotalSelected += runSelected;

  return {
    success: true,
    total: globalTotalProcessed,
    selected: globalTotalSelected,
    cumulativeTotal: globalTotalProcessed,
    cumulativeSelected: globalTotalSelected,
    results: allResults
  };
}

function classifySubjectViaBackground(subject, instructions, options) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        action: "CLASSIFY_SUBJECT_API",
        subject,
        instructions,
        options
      },
      (response) => {
        if (chrome.runtime.lastError || !response || !response.success) {
          console.error("Classification error:", response?.error || chrome.runtime.lastError);
          resolve(false);
          return;
        }
        resolve(response.isPromotional);
      }
    );
  });
}

async function processGmailThreads(instructions, options) {
  const rows = Array.from(document.querySelectorAll("table[role='grid'] tbody tr"));

  if (rows.length === 0) {
    return { success: false, message: "No email rows found in current view." };
  }

  const subjectColIndex = options.subjectColumnIndex || 6;
  const negateSelections = options.negateSelections || false;

  const results = [];
  let selectedCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const subjectCell = row.querySelector(`td:nth-child(${subjectColIndex})`);
    const checkboxCell = row.querySelector("td:nth-child(2)");

    if (!subjectCell || !checkboxCell) continue;

    const subject = subjectCell.innerText.trim();
    if (!subject) continue;

    console.log(`[${i + 1}/${rows.length}] Classifying (Col ${subjectColIndex}): "${subject}"`);
    const deciderResult = await classifySubjectViaBackground(subject, instructions, options);
    console.log("deciderResult", deciderResult);
    results.push(deciderResult);

    // Apply selection negation if option is enabled
    const shouldSelect = negateSelections ? !deciderResult : deciderResult;

    if (shouldSelect) {
      const checkboxEl = checkboxCell.querySelector("div[role='checkbox']") || checkboxCell;
      const isAlreadyChecked = checkboxEl.getAttribute("aria-checked") === "true";

      if (!isAlreadyChecked) {
        checkboxCell.click();
        selectedCount++;
      }
    }
  }

  console.log("Final Classification Results:", results);

  return {
    success: true,
    total: rows.length,
    selected: selectedCount,
    results
  };
}
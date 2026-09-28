document.addEventListener("DOMContentLoaded", () => {
  // Load saved options from storage if available
  chrome.storage.local.get(
    {
      instructions: "Is this email subject contain bank transactional data ",
      negateSelections: false,
      probabilityThreshold: 0.4,
      modelName: "kev",
      apiUrl: "http://localhost:11435/api/decide",
      subjectColumnIndex: 6
    },
    (items) => {
      document.getElementById("instructions").value = items.instructions;
      document.getElementById("negateSelections").checked = items.negateSelections;
      document.getElementById("probabilityThreshold").value = items.probabilityThreshold;
      document.getElementById("modelName").value = items.modelName;
      document.getElementById("apiUrl").value = items.apiUrl;
      document.getElementById("subjectColumnIndex").value = items.subjectColumnIndex;
    }
  );
});

document.getElementById("runBtn").addEventListener("click", async () => {
  const statusEl = document.getElementById("status");
  const btn = document.getElementById("runBtn");

  const instructionsInput = document.getElementById("instructions").value.trim();
  const negateSelections = document.getElementById("negateSelections").checked;
  const rawThreshold = parseFloat(document.getElementById("probabilityThreshold").value);
  const probabilityThreshold = isNaN(rawThreshold) ? 0.4 : rawThreshold;
  const modelName = document.getElementById("modelName").value.trim() || "kev";
  const apiUrl = document.getElementById("apiUrl").value.trim() || "http://localhost:11435/api/decide";
  const subjectColumnIndex = parseInt(document.getElementById("subjectColumnIndex").value, 10) || 6;

  if (!instructionsInput) {
    statusEl.innerText = "Please enter instructions before running.";
    return;
  }

  // Save current preferences
  const options = {
    instructions: instructionsInput,
    negateSelections,
    probabilityThreshold,
    modelName,
    apiUrl,
    subjectColumnIndex
  };
  chrome.storage.local.set(options);

  btn.disabled = true;
  statusEl.innerText = "Classifying emails via Local API...";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url || !tab.url.includes("mail.google.com")) {
    statusEl.innerText = "Please navigate to Gmail first.";
    btn.disabled = false;
    return;
  }

  chrome.tabs.sendMessage(
    tab.id,
    {
      action: "START_CLASSIFICATION",
      instructions: instructionsInput,
      options: options
    },
    (response) => {
      btn.disabled = false;

      if (chrome.runtime.lastError) {
        statusEl.innerText = "Error: Reload the Gmail tab and try again.";
        console.error(chrome.runtime.lastError);
        return;
      }

      if (response && response.success) {
        statusEl.innerText = `Complete!\nProcessed: ${response.total}\nSelected: ${response.selected}`;
      } else {
        statusEl.innerText = response?.message || "Failed to process emails.";
      }
    }
  );
});